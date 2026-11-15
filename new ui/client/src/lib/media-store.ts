import { useEffect, useState } from "react";
import { stripLiveSyntaxArtifacts } from "@/components/notes/markdown/note-dom";
import { API_BASE_URL, apiJson, apiUrl } from "@/lib/api";

const DB_NAME = "tutin_media_store";
const STORE_NAME = "images";
const DB_VERSION = 1;
const MEDIA_SCHEME = "media://";
const VAULT_MEDIA_PREFIX = "/api/notes/media/";
const COPIED_MEDIA_STORAGE_KEY = "tutin_copied_vault_media_v1";
const COPIED_MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_COPIED_MEDIA_REFS = 8;
const THUMB_SAMPLE_DIM = 16;

interface CopiedVaultMediaRef {
  vaultUri: string;
  courseId: string;
  width: number;
  height: number;
  thumbB64: string;
  copiedAt: number;
}

const MAX_CACHED_OBJECT_URLS = 250;
const resolvedObjectUrls = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();
let sharedMediaDbPromise: Promise<IDBDatabase> | null = null;
let memoryCopiedMediaRefs: CopiedVaultMediaRef[] = [];

export function isMediaUri(src: string | undefined | null): src is `media://${string}` {
  return typeof src === "string" && src.startsWith(MEDIA_SCHEME);
}

export function extractMediaId(uri: string): string {
  return uri.startsWith(MEDIA_SCHEME) ? uri.slice(MEDIA_SCHEME.length) : uri;
}

export function extractVaultMediaUri(rawSrc: string | undefined | null): string | null {
  if (typeof rawSrc !== "string") return null;
  const trimmed = rawSrc.trim();
  if (!trimmed) return null;

  let pathname = "";
  if (trimmed.startsWith(VAULT_MEDIA_PREFIX)) {
    pathname = trimmed.split(/[?#]/)[0] ?? "";
  } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const allowedOrigins = new Set<string>();
      if (typeof window !== "undefined") {
        allowedOrigins.add(window.location.origin);
        if (API_BASE_URL) {
          allowedOrigins.add(new URL(API_BASE_URL, window.location.origin).origin);
        }
      } else if (API_BASE_URL) {
        allowedOrigins.add(new URL(API_BASE_URL).origin);
      }
      if (!allowedOrigins.has(parsed.origin)) return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!pathname.startsWith(VAULT_MEDIA_PREFIX)) return null;
  const rest = pathname.slice(VAULT_MEDIA_PREFIX.length);
  const segments = rest.split("/");
  if (segments.length !== 2) return null;
  const [courseSeg, fileSeg] = segments;
  if (
    !courseSeg ||
    !fileSeg ||
    courseSeg === "." ||
    courseSeg === ".." ||
    fileSeg === "." ||
    fileSeg === ".."
  ) {
    return null;
  }
  return `${VAULT_MEDIA_PREFIX}${courseSeg}/${fileSeg}`;
}

export function getVaultMediaCourseId(vaultUri: string): string | null {
  const normalized = extractVaultMediaUri(vaultUri);
  if (!normalized) return null;
  const courseSeg = normalized.slice(VAULT_MEDIA_PREFIX.length).split("/")[0] ?? "";
  try {
    return decodeURIComponent(courseSeg);
  } catch {
    return courseSeg;
  }
}

export function isVaultMediaCourseCompatible(vaultUri: string, targetCourseId?: string): boolean {
  const mediaCourse = getVaultMediaCourseId(vaultUri);
  if (!mediaCourse) return false;
  const expected = targetCourseId || "shared";
  return mediaCourse === expected;
}

export async function verifyVaultMediaExists(vaultUri: string): Promise<boolean> {
  const normalized = extractVaultMediaUri(vaultUri);
  if (!normalized) return false;
  try {
    const res = await fetch(apiUrl(normalized), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export function extractSameCourseVaultImageUrisFromHtml(
  rawHtml: string | undefined | null,
  targetCourseId?: string,
): string[] | null {
  if (!rawHtml || typeof DOMParser === "undefined") return null;
  const startMarker = "<!--StartFragment-->";
  const endMarker = "<!--EndFragment-->";
  const startIdx = rawHtml.indexOf(startMarker);
  const endIdx = rawHtml.indexOf(endMarker);
  const slice =
    startIdx !== -1 && endIdx > startIdx
      ? rawHtml.slice(startIdx + startMarker.length, endIdx)
      : rawHtml;

  const doc = new DOMParser().parseFromString(slice, "text/html");
  doc.body.querySelectorAll("meta, link, title, style, script").forEach((n) => n.remove());
  const imgs = Array.from(doc.body.querySelectorAll("img"));
  if (imgs.length === 0) return null;

  const leftoverText = (doc.body.textContent || "").replace(/[\u00A0\u200B]/g, "").trim();
  if (leftoverText.length > 0) return null;

  if (doc.body.querySelector("hr, pre, table, input, ul, ol, blockquote, h1, h2, h3, h4, h5, h6")) {
    return null;
  }

  const uris: string[] = [];
  for (const img of imgs) {
    const rawCandidate = img.getAttribute("data-media-uri") || img.getAttribute("src") || "";
    const vaultUri = extractVaultMediaUri(rawCandidate);
    if (!vaultUri || !isVaultMediaCourseCompatible(vaultUri, targetCourseId)) {
      return null;
    }
    uris.push(vaultUri);
  }
  return uris.length > 0 ? uris : null;
}

function readCopiedMediaRefs(): CopiedVaultMediaRef[] {
  const now = Date.now();
  let list = memoryCopiedMediaRefs;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(COPIED_MEDIA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          list = parsed;
        }
      }
    } catch {
      // Ignore storage read error
    }
  }
  const fresh = list.filter(
    (entry) =>
      entry &&
      typeof entry.vaultUri === "string" &&
      typeof entry.courseId === "string" &&
      typeof entry.width === "number" &&
      typeof entry.height === "number" &&
      typeof entry.thumbB64 === "string" &&
      typeof entry.copiedAt === "number" &&
      now - entry.copiedAt < COPIED_MEDIA_TTL_MS,
  );
  memoryCopiedMediaRefs = fresh;
  return fresh;
}

function computeCanvasThumbB64(source: CanvasImageSource): string | null {
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = THUMB_SAMPLE_DIM;
  thumbCanvas.height = THUMB_SAMPLE_DIM;
  const ctx = thumbCanvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, THUMB_SAMPLE_DIM, THUMB_SAMPLE_DIM);
    const { data } = ctx.getImageData(0, 0, THUMB_SAMPLE_DIM, THUMB_SAMPLE_DIM);
    const rgb = new Uint8Array(THUMB_SAMPLE_DIM * THUMB_SAMPLE_DIM * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i] ?? 0;
      rgb[j + 1] = data[i + 1] ?? 0;
      rgb[j + 2] = data[i + 2] ?? 0;
    }
    let bin = "";
    for (let i = 0; i < rgb.length; i++) {
      bin += String.fromCharCode(rgb[i]!);
    }
    return btoa(bin);
  } catch {
    return null;
  }
}

function isThumbB64Close(aB64: string, bB64: string): boolean {
  if (aB64 === bB64) return true;
  try {
    const aStr = atob(aB64);
    const bStr = atob(bB64);
    if (aStr.length !== bStr.length || aStr.length === 0) return false;
    let totalDiff = 0;
    let maxDiff = 0;
    for (let i = 0; i < aStr.length; i++) {
      const diff = Math.abs(aStr.charCodeAt(i) - bStr.charCodeAt(i));
      totalDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
      if (maxDiff > 12) return false;
    }
    return totalDiff / aStr.length <= 2.0;
  } catch {
    return false;
  }
}

export function rememberCopiedVaultImage(
  src: string,
  width: number,
  height: number,
  source: CanvasImageSource,
): void {
  const vaultUri = extractVaultMediaUri(src);
  const courseId = vaultUri ? getVaultMediaCourseId(vaultUri) : null;
  if (!vaultUri || !courseId || width <= 0 || height <= 0) return;

  const thumbB64 = computeCanvasThumbB64(source);
  if (!thumbB64) return;

  const nextEntry: CopiedVaultMediaRef = {
    vaultUri,
    courseId,
    width,
    height,
    thumbB64,
    copiedAt: Date.now(),
  };
  const nextList = [
    nextEntry,
    ...readCopiedMediaRefs().filter((item) => item.vaultUri !== vaultUri),
  ].slice(0, MAX_COPIED_MEDIA_REFS);
  memoryCopiedMediaRefs = nextList;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(COPIED_MEDIA_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // Ignore storage quota error
    }
  }
}

export async function findReusableCopiedVaultMediaForBlob(
  blob: Blob,
  targetCourseId?: string,
): Promise<string | null> {
  const refs = readCopiedMediaRefs().filter((entry) =>
    isVaultMediaCourseCompatible(entry.vaultUri, targetCourseId),
  );
  if (refs.length === 0) return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const candidateRefs = refs.filter((r) => r.width === width && r.height === height);
    if (candidateRefs.length === 0) return null;

    const thumbB64 = computeCanvasThumbB64(img);
    if (!thumbB64) return null;

    for (const candidate of candidateRefs) {
      if (isThumbB64Close(candidate.thumbB64, thumbB64)) {
        if (await verifyVaultMediaExists(candidate.vaultUri)) {
          return candidate.vaultUri;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function normalizeMediaSrcForStorage(src: string): string {
  if (!src) return src;
  const vaultUri = extractVaultMediaUri(src);
  if (vaultUri) return vaultUri;
  if (API_BASE_URL && src.startsWith(`${API_BASE_URL}/api/`)) {
    return src.slice(API_BASE_URL.length);
  }
  return src;
}

function openMediaDb(): Promise<IDBDatabase> {
  if (sharedMediaDbPromise) return sharedMediaDbPromise;

  sharedMediaDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      sharedMediaDbPromise = null;
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
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        sharedMediaDbPromise = null;
      };
      db.onclose = () => {
        sharedMediaDbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      sharedMediaDbPromise = null;
      reject(req.error ?? new Error("Failed to open media database."));
    };
  });

  return sharedMediaDbPromise;
}

function cacheResolvedObjectUrl(id: string, url: string): void {
  if (resolvedObjectUrls.size >= MAX_CACHED_OBJECT_URLS) {
    const oldestKey = resolvedObjectUrls.keys().next().value;
    if (oldestKey !== undefined) {
      const oldestUrl = resolvedObjectUrls.get(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
      resolvedObjectUrls.delete(oldestKey);
    }
  }
  resolvedObjectUrls.set(id, url);
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
      canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", quality);
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
  if (courseId) {
    const reusedUri = await findReusableCopiedVaultMediaForBlob(blob, courseId);
    if (reusedUri) return reusedUri;
  }
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
    cacheResolvedObjectUrl(id, url);
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
  const liveInputs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-ghost]").forEach((el) => el.remove());
  stripLiveSyntaxArtifacts(clone);
  clone.querySelectorAll("img.is-selected").forEach((img) => img.classList.remove("is-selected"));
  clone.querySelectorAll("br[data-code-eol]").forEach((br) => br.remove());
  clone.querySelectorAll("[data-note-image-block]").forEach((el) => {
    el.removeAttribute("contenteditable");
  });
  clone.querySelectorAll('p[data-image-tail="true"]').forEach((p) => {
    const text = (p.textContent || "")
      .replace(/\u00A0/g, "")
      .replace(/\u200B/g, "")
      .trim();
    const hasContent = Boolean(text) || Boolean(p.querySelector("img, hr, pre, ul, ol"));
    if (!hasContent) {
      p.remove();
    } else {
      p.removeAttribute("data-image-tail");
    }
  });

  const clonedInputs = Array.from(clone.querySelectorAll('input[type="checkbox"]'));
  clonedInputs.forEach((input, idx) => {
    const live = liveInputs[idx] as HTMLInputElement | undefined;
    const isChecked = live ? live.checked : (input as HTMLInputElement).hasAttribute("checked");
    if (isChecked) {
      input.setAttribute("checked", "");
    } else {
      input.removeAttribute("checked");
    }
    const li = input.closest("li[data-task]");
    if (li) {
      li.setAttribute("data-checked", String(isChecked));
    }
  });

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const toRemove: Node[] = [];
  let textNode = walker.nextNode();
  while (textNode) {
    if (textNode.nodeValue && textNode.nodeValue.includes("\u200B")) {
      const cleaned = textNode.nodeValue.replace(/\u200B/g, "");
      if (cleaned === "") {
        toRemove.push(textNode);
      } else {
        textNode.nodeValue = cleaned;
      }
    }
    textNode = walker.nextNode();
  }
  toRemove.forEach((node) => {
    const parent = node.parentElement;
    node.parentNode?.removeChild(node);
    if (
      parent &&
      parent !== clone &&
      (parent.tagName === "P" || parent.tagName === "LI" || parent.tagName === "SPAN") &&
      parent.childNodes.length === 0
    ) {
      parent.appendChild(document.createElement("br"));
    }
  });

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
