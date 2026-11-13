import { useEffect, useState } from "react";

const DB_NAME = "tutin_media_db";
const STORE_NAME = "blobs";
const DB_VERSION = 1;
const MEDIA_PREFIX = "media://";

interface StoredMediaRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

const objectUrlCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();

export function isMediaUri(src: string | undefined | null): src is `media://${string}` {
  return typeof src === "string" && src.startsWith(MEDIA_PREFIX);
}

export function extractMediaId(uri: string): string {
  return uri.startsWith(MEDIA_PREFIX) ? uri.slice(MEDIA_PREFIX.length) : uri;
}

function createMediaId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read media blob."));
    };
    reader.onerror = () => reject(new Error("Failed to read media blob."));
    reader.readAsDataURL(blob);
  });
}

export function compressImageFileToBlob(
  file: File,
  maxWidth = 1400,
  maxBytes = 1.6 * 1024 * 1024,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Image exceeds 12MB limit."));
      return;
    }

    const img = new Image();
    const tempUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      if (img.width <= maxWidth && file.size <= maxBytes) {
        resolve(file);
        return;
      }

      const scale = Math.min(1, maxWidth / Math.max(1, img.width));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const attemptEncode = (quality: number) => {
        canvas.toBlob(
          (outBlob) => {
            if (!outBlob) {
              resolve(file);
              return;
            }
            if (outBlob.size > maxBytes && quality > 0.35) {
              attemptEncode(quality - 0.12);
              return;
            }
            resolve(outBlob);
          },
          "image/jpeg",
          quality,
        );
      };

      attemptEncode(0.86);
    };

    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      reject(new Error("Failed to decode image."));
    };

    img.src = tempUrl;
  });
}

export async function saveMediaBlob(blob: Blob): Promise<string> {
  const db = await openMediaDb();
  if (!db) {
    return readFileAsDataUrl(blob);
  }

  const id = createMediaId();
  const uri = `${MEDIA_PREFIX}${id}`;
  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(uri, objectUrl);

  const stored = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id,
        blob,
        mimeType: blob.type || "image/jpeg",
        createdAt: Date.now(),
      } satisfies StoredMediaRecord);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  if (!stored) {
    return readFileAsDataUrl(blob);
  }
  return uri;
}

export async function saveMediaFile(file: File): Promise<string> {
  const compressed = await compressImageFileToBlob(file);
  return saveMediaBlob(compressed);
}

export async function saveMediaDataUrl(dataUrl: string): Promise<string> {
  if (isMediaUri(dataUrl)) return dataUrl;
  if (!dataUrl.startsWith("data:")) return dataUrl;

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return saveMediaBlob(blob);
  } catch {
    return dataUrl;
  }
}

export async function resolveMediaUrl(src: string): Promise<string> {
  if (!isMediaUri(src)) return src;

  const cached = objectUrlCache.get(src);
  if (cached) return cached;

  const pending = inFlightResolutions.get(src);
  if (pending) return pending;

  const promise = (async () => {
    const db = await openMediaDb();
    if (!db) return src;
    const id = extractMediaId(src);

    return new Promise<string>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          const rec = req.result as StoredMediaRecord | undefined;
          if (rec?.blob) {
            const url = URL.createObjectURL(rec.blob);
            objectUrlCache.set(src, url);
            resolve(url);
          } else {
            resolve(src);
          }
        };
        req.onerror = () => resolve(src);
      } catch {
        resolve(src);
      }
    });
  })().finally(() => {
    inFlightResolutions.delete(src);
  });

  inFlightResolutions.set(src, promise);
  return promise;
}

export function useMediaUrl(src: string | undefined | null): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!src) return "";
    if (!isMediaUri(src)) return src;
    return objectUrlCache.get(src) || "";
  });

  useEffect(() => {
    if (!src) {
      setResolved("");
      return;
    }
    if (!isMediaUri(src)) {
      setResolved(src);
      return;
    }
    const cached = objectUrlCache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    let active = true;
    resolveMediaUrl(src).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}

/**
 * Replaces `media://...` URIs inside HTML `<img>` elements with cached Object URLs
 * while storing the original `media://` URI in `data-media-uri` so serialization
 * can restore compact URIs cleanly.
 */
export async function hydrateContainerMedia(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const attrSrc = img.getAttribute("src") || "";
      const refUri = img.getAttribute("data-media-uri") || (isMediaUri(attrSrc) ? attrSrc : "");
      if (!refUri) return;
      img.setAttribute("data-media-uri", refUri);
      const url = await resolveMediaUrl(refUri);
      if (url && img.isConnected) {
        img.src = url;
      }
    }),
  );
}

/**
 * Returns HTML from a container with any transient `blob:` URLs mapped back to
 * their persistent `media://` URIs via `data-media-uri`.
 */
export function serializeContainerMediaHtml(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-ghost]").forEach((el) => el.remove());
  clone.querySelectorAll("img").forEach((img) => {
    img.classList.remove("is-selected");
    const mediaUri = img.getAttribute("data-media-uri");
    if (mediaUri) {
      img.setAttribute("src", mediaUri);
      img.removeAttribute("data-media-uri");
    }
  });
  return clone.innerHTML;
}

export async function resolveHtmlMediaUrls(html: string): Promise<string> {
  if (!html || !html.includes(MEDIA_PREFIX) || typeof document === "undefined") {
    return html;
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  await hydrateContainerMedia(tmp);
  return tmp.innerHTML;
}

export function useResolvedNoteHtml(html: string): string {
  const [resolvedHtml, setResolvedHtml] = useState<string>(() => html);

  useEffect(() => {
    if (!html || !html.includes(MEDIA_PREFIX)) {
      setResolvedHtml(html);
      return;
    }
    let active = true;
    resolveHtmlMediaUrls(html).then((out) => {
      if (active) setResolvedHtml(out);
    });
    return () => {
      active = false;
    };
  }, [html]);

  return resolvedHtml;
}
