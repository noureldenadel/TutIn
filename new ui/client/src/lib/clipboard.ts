import { rememberCopiedVaultImage } from "@/lib/media-store";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fallback below for non-secure or restricted contexts
    }
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) {
    throw new Error("Could not copy text to clipboard.");
  }
}

async function renderImageToPngBlob(src: string): Promise<Blob> {
  const img = new Image();
  if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    img.crossOrigin = "anonymous";
  }

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image for copying."));
    img.src = src;
  });

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("Image has empty dimensions.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");
  ctx.drawImage(img, 0, 0);
  rememberCopiedVaultImage(src, width, height, canvas);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode image."));
    }, "image/png");
  });
}

/**
 * Copies any image URL (`blob:`, `data:`, or same-origin/CORS URL) to the OS clipboard as PNG.
 * Passes the PNG Blob promise directly to `ClipboardItem` so user activation stays intact.
 */
export async function copyImageToClipboard(src: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image copy is not supported in this browser.");
  }

  const pngPromise = renderImageToPngBlob(src);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
}
