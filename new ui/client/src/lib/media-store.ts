import { useEffect, useState } from "react";
import { API_BASE_URL, apiJson, apiUrl } from "@/lib/api";

const DB_NAME = "tutin_media_store";
const STORE_NAME = "images";
const DB_VERSION = 1;
const MEDIA_SCHEME = "media://";

const resolvedObjectUrls = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();

export function isMediaUri(src: string | undefined | null): src is `media://${string}` {
  return typeof src === "string" && src.startsWith(MEDIA_SCHEME);
}

export function extractMediaId(uri: string): string {
  return uri.startsWith(MEDIA_SCHEME) ? uri.slice(MEDIA_SCHEME.length) : uri;
}

export function normalizeMediaSrcForStorage(src: string): string {
  if (!src) return src;
  if (API_BASE_URL && src.startsWith(`${API_BASE_URL}/api/`)) {
    return src.slice(API_BASE_URL.length);
  }
  return src;
}

export function resolveNoteImageSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("/api/")) return apiUrl(src);
  return src;
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open media database."));
  });
}

async function getBlobFromDb(id: string): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Failed to read media blob."));
    });
  } catch {
    return null;
  }
}

export function compressImageFileToBlob(
  file: Blob,
  maxWidth = 1200,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxWidth && file.type === "image/webp") {
        resolve(file);
        return;
      }
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/webp",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to encode image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to encode image"));
    reader.readAsDataURL(blob);
  });
}

async function uploadMediaDataUrlToVault(
  dataUrl: string,
  courseId?: string,
  filename?: string,
): Promise<string> {
  if (!courseId) return dataUrl;
  try {
    const res = await apiJson<{ url?: string }>("/api/notes/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        dataUrl,
        ...(filename ? { filename } : {}),
      }),
    });
    if (res.url) return res.url;
  } catch {
    // Fall back safely to inline compressed data URL if server/offline fails
  }
  return dataUrl;
}

export async function saveMediaBlob(
  blob: Blob,
  courseId?: string,
  filename?: string,
): Promise<string> {
  const compressed = await compressImageFileToBlob(blob);
  const dataUrl = await blobToDataUrl(compressed);
  return uploadMediaDataUrlToVault(dataUrl, courseId, filename);
}

export async function saveMediaFile(file: File, courseId?: string): Promise<string> {
  return saveMediaBlob(file, courseId, file.name);
}

export async function saveMediaDataUrl(
  dataUrl: string,
  courseId?: string,
  filename?: string,
): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return saveMediaBlob(blob, courseId, filename);
  } catch {
    return uploadMediaDataUrlToVault(dataUrl, courseId, filename);
  }
}

export async function resolveMediaUrl(src: string): Promise<string> {
  if (!src) return src;
  if (src.startsWith("/api/")) return apiUrl(src);
  if (!isMediaUri(src)) return src;

  const id = extractMediaId(src);
  const cached = resolvedObjectUrls.get(id);
  if (cached) return cached;

  const existingPromise = inFlightResolutions.get(id);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const blob = await getBlobFromDb(id);
    if (!blob) return src;
    const url = URL.createObjectURL(blob);
    resolvedObjectUrls.set(id, url);
    return url;
  })().finally(() => {
    inFlightResolutions.delete(id);
  });

  inFlightResolutions.set(id, promise);
  return promise;
}

export function useMediaUrl(src: string | undefined | null): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!src) return "";
    if (src.startsWith("/api/")) return apiUrl(src);
    if (!isMediaUri(src)) return src;
    return resolvedObjectUrls.get(extractMediaId(src)) ?? "";
  });

  useEffect(() => {
    if (!src) {
      setResolved("");
      return;
    }
    if (src.startsWith("/api/")) {
      setResolved(apiUrl(src));
      return;
    }
    if (!isMediaUri(src)) {
      setResolved(src);
      return;
    }
    const id = extractMediaId(src);
    const cached = resolvedObjectUrls.get(id);
    if (cached) {
      setResolved(cached);
      return;
    }

    let cancelled = false;
    resolveMediaUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return resolved;
}

export async function hydrateContainerMedia(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const attrSrc = img.getAttribute("src") ?? "";
      if (attrSrc.startsWith("/api/")) {
        img.setAttribute("data-media-uri", attrSrc);
        img.src = apiUrl(attrSrc);
        return;
      }
      if (isMediaUri(attrSrc)) {
        img.setAttribute("data-media-uri", attrSrc);
        const blobUrl = await resolveMediaUrl(attrSrc);
        if (blobUrl && blobUrl !== attrSrc) {
          img.src = blobUrl;
        }
      }
    }),
  );
}

export function serializeContainerMediaHtml(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("img").forEach((img) => {
    const uri = img.getAttribute("data-media-uri");
    if (uri) {
      img.setAttribute("src", normalizeMediaSrcForStorage(uri));
      img.removeAttribute("data-media-uri");
    } else {
      const src = img.getAttribute("src");
      if (src) {
        img.setAttribute("src", normalizeMediaSrcForStorage(src));
      }
    }
  });
  return clone.innerHTML;
}

export async function resolveHtmlMediaUrls(html: string): Promise<string> {
  if (!html) return html;
  if (!html.includes(MEDIA_SCHEME) && !html.includes('src="/api/')) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  await hydrateContainerMedia(doc.body);
  return doc.body.innerHTML;
}

export function useResolvedNoteHtml(html: string): string {
  const [resolvedHtml, setResolvedHtml] = useState<string>(() => {
    if (!html) return html;
    return API_BASE_URL ? html.replaceAll('src="/api/', `src="${API_BASE_URL}/api/`) : html;
  });

  useEffect(() => {
    let cancelled = false;
    if (!html || (!html.includes(MEDIA_SCHEME) && !html.includes('src="/api/'))) {
      setResolvedHtml(html);
      return;
    }
    resolveHtmlMediaUrls(html).then((next) => {
      if (!cancelled) setResolvedHtml(next);
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  return resolvedHtml;
}
