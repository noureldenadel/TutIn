import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Camera,
  Check,
  Crop,
  GripVertical,
  ImagePlus,
  Italic,
  List,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  hydrateContainerMedia,
  isMediaUri,
  resolveMediaUrl,
  saveMediaDataUrl,
  saveMediaFile,
  serializeContainerMediaHtml,
  useResolvedNoteHtml,
} from "@/lib/media-store";
import { cn } from "@/lib/utils";

const MAX_CROP_WIDTH = 1200;
const MAX_CROP_HEIGHT = 800;

export interface RichNoteSuggestion {
  completion: string;
  fullPhrase: string;
}

export interface RichNoteSurfaceProps {
  courseId?: string | undefined;
  content: string;
  onChange: (html: string) => void;
  onSubmit?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onCaptureScreenshot?: (() => Promise<string>) | undefined;
  getSuggestion?: ((textBefore: string) => RichNoteSuggestion | null) | undefined;
  onWritingActivity?: (() => void) | undefined;
  onSuspendSmartTimers?: (() => void) | undefined;
  placeholder?: string | undefined;
  compactToolbar?: boolean | undefined;
  maxHeightClassName?: string | undefined;
  minHeightClassName?: string | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
}

export function RichNoteHtmlContent({
  html,
  className,
  onDoubleClick,
  onImageClick,
}: {
  html: string;
  className?: string | undefined;
  onDoubleClick?: ((e: React.MouseEvent<HTMLDivElement>) => void) | undefined;
  onImageClick?: ((src: string, e: React.MouseEvent<HTMLDivElement>) => void) | undefined;
}) {
  const resolvedHtml = useResolvedNoteHtml(html);

  return (
    <div
      className={cn("note-content select-text text-sm leading-6 text-foreground", className)}
      dir="auto"
      onDoubleClick={onDoubleClick}
      onClick={(e) => {
        if (!onImageClick) return;
        const target = e.target as HTMLElement;
        if (target.tagName === "IMG") {
          const img = target as HTMLImageElement;
          const src = img.currentSrc || img.src;
          if (src) {
            e.stopPropagation();
            onImageClick(src, e);
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  );
}

function EditorToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function InlineImageCropper({
  imageSrc,
  onApplyCrop,
  onCancel,
}: {
  imageSrc: string;
  onApplyCrop: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const isDrawingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const startX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const startY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    isDrawingRef.current = true;
    startPointRef.current = { x: startX, y: startY };
    setCrop({ x: startX, y: startY, width: 0, height: 0 });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const start = startPointRef.current;

    setCrop({
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setCrop((prev) => (!prev || prev.width < 2 || prev.height < 2 ? null : prev));
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const hasDrawn = crop && crop.width >= 2 && crop.height >= 2;
    const c = hasDrawn ? crop : { x: 0, y: 0, width: 100, height: 100 };

    const srcX = Math.max(0, Math.round((c.x / 100) * nw));
    const srcY = Math.max(0, Math.round((c.y / 100) * nh));
    const srcW = Math.min(nw - srcX, Math.max(1, Math.round((c.width / 100) * nw)));
    const srcH = Math.min(nh - srcY, Math.max(1, Math.round((c.height / 100) * nh)));
    if (srcW <= 0 || srcH <= 0) return;

    const scale = Math.min(1, MAX_CROP_WIDTH / srcW, MAX_CROP_HEIGHT / srcH);
    const destW = Math.max(1, Math.round(srcW * scale));
    const destH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = destW;
    canvas.height = destH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH);
    onApplyCrop(canvas.toDataURL("image/jpeg", 0.85));
  };

  const hasActiveCrop = Boolean(crop && crop.width >= 2 && crop.height >= 2);

  return (
    <div className="space-y-2.5 border-b border-border/50 bg-secondary/35 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Crop className="size-3.5 text-primary" /> Drag to crop
        </span>
        {hasActiveCrop && (
          <button
            type="button"
            onClick={() => setCrop(null)}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex max-h-[240px] min-h-[140px] items-center justify-center overflow-hidden rounded-lg bg-player p-1">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative inline-block max-h-[220px] cursor-crosshair select-none touch-none"
        >
          <img
            ref={imgRef}
            src={imageSrc}
            crossOrigin="anonymous"
            alt="Crop target"
            onLoad={() => setIsLoaded(true)}
            className="pointer-events-none block max-h-[220px] w-auto max-w-full select-none rounded-sm object-contain"
            draggable={false}
          />
          {isLoaded && hasActiveCrop && crop && (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bg-black/65"
                style={{ height: `${crop.y}%` }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65"
                style={{ height: `${100 - (crop.y + crop.height)}%` }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-black/65"
                style={{ top: `${crop.y}%`, width: `${crop.x}%`, height: `${crop.height}%` }}
              />
              <div
                className="pointer-events-none absolute right-0 bg-black/65"
                style={{
                  top: `${crop.y}%`,
                  width: `${100 - (crop.x + crop.width)}%`,
                  height: `${crop.height}%`,
                }}
              />
              <div
                className="pointer-events-none absolute border-2 border-primary ring-1 ring-white/80"
                style={{
                  top: `${crop.y}%`,
                  left: `${crop.x}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                }}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={handleApply}
        >
          <Check className="size-3.5" /> {hasActiveCrop ? "Apply" : "Keep full"}
        </Button>
      </div>
    </div>
  );
}

export function RichNoteSurface({
  courseId,
  content,
  onChange,
  onSubmit,
  onCancel,
  onCaptureScreenshot,
  getSuggestion,
  onWritingActivity,
  onSuspendSmartTimers,
  placeholder = "Write a note…",
  compactToolbar = false,
  maxHeightClassName = "max-h-[280px]",
  minHeightClassName = "min-h-[100px]",
  autoFocus = true,
  className,
}: RichNoteSurfaceProps) {
  const courseIdRef = useRef(courseId);
  courseIdRef.current = courseId;
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitializedRef = useRef(false);
  const draggingBlockRef = useRef<HTMLElement | null>(null);
  const ghostSpanRef = useRef<HTMLSpanElement | null>(null);

  const [croppingImage, setCroppingImage] = useState<{
    element: HTMLImageElement;
    src: string;
  } | null>(null);
  const [selectedImg, setSelectedImg] = useState<{
    element: HTMLImageElement;
    src: string;
    top: number;
    left: number;
  } | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState<{
    completion: string;
    fullPhrase: string;
    node: Text;
    offset: number;
  } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getSuggestionRef = useRef(getSuggestion);
  getSuggestionRef.current = getSuggestion;
  const onWritingActivityRef = useRef(onWritingActivity);
  onWritingActivityRef.current = onWritingActivity;

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || isInitializedRef.current) return;
    ed.innerHTML = content || "";
    isInitializedRef.current = true;
    void hydrateContainerMedia(ed);
    if (autoFocus) {
      ed.focus();
    }
  }, [autoFocus, content]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChangeRef.current(serializeContainerMediaHtml(editorRef.current));
    }
  }, []);

  const triggerWritingActivity = useCallback(() => {
    onWritingActivityRef.current?.();
  }, []);

  const removeGhostSpan = useCallback(() => {
    if (ghostSpanRef.current && ghostSpanRef.current.isConnected) {
      ghostSpanRef.current.remove();
    }
    ghostSpanRef.current = null;
  }, []);

  const insertGhostSpan = useCallback(
    (textNode: Text, offset: number, completion: string) => {
      removeGhostSpan();
      if (!textNode.isConnected) return;

      const span = document.createElement("span");
      span.setAttribute("data-ghost", "true");
      span.contentEditable = "false";
      span.textContent = completion;
      span.style.cssText =
        "color: var(--color-primary); opacity: 0.55; font-style: italic; pointer-events: none; user-select: none; display: inline;";

      const after = textNode.splitText(offset);
      textNode.parentNode?.insertBefore(span, after);
      ghostSpanRef.current = span;

      try {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(textNode, textNode.textContent?.length ?? 0);
        r.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r);
      } catch {
        // ignore
      }
    },
    [removeGhostSpan],
  );

  const updateGhostSuggestion = useCallback(() => {
    const suggestFn = getSuggestionRef.current;
    if (!suggestFn || !editorRef.current) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (!editorRef.current.contains(node) || node === ghostSpanRef.current) {
      removeGhostSpan();
      setGhostSuggestion(null);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const textBefore = (textNode.textContent || "").slice(0, range.startOffset);
      const suggestion = suggestFn(textBefore);
      if (suggestion && suggestion.completion) {
        if (ghostSpanRef.current?.textContent !== suggestion.completion) {
          insertGhostSpan(textNode, range.startOffset, suggestion.completion);
        }
        setGhostSuggestion({
          completion: suggestion.completion,
          fullPhrase: suggestion.fullPhrase,
          node: textNode,
          offset: range.startOffset,
        });
        return;
      }
    }
    removeGhostSpan();
    setGhostSuggestion(null);
  }, [insertGhostSpan, removeGhostSpan]);

  const acceptGhostSuggestion = () => {
    if (!ghostSuggestion) return;
    removeGhostSpan();
    const { node: textNode, offset, completion } = ghostSuggestion;
    if (textNode && textNode.isConnected) {
      const text = textNode.textContent || "";
      textNode.textContent = text.slice(0, offset) + completion + text.slice(offset);
      try {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(textNode, offset + completion.length);
        r.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r);
      } catch {
        // ignore
      }
    } else {
      document.execCommand("insertText", false, completion);
    }
    setGhostSuggestion(null);
    handleInput();
    triggerWritingActivity();
  };

  const getClosestBlock = useCallback((node: Node | null): HTMLElement | null => {
    let curr: Node | null = node;
    while (curr && curr !== editorRef.current) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (["p", "div", "h1", "h2", "h3", "blockquote", "li", "pre"].includes(tag)) {
          return el;
        }
      }
      curr = curr.parentNode;
    }
    return null;
  }, []);

  const ensureBlockWrapper = useCallback((node: Node | null): HTMLElement | null => {
    if (!editorRef.current || !node) return null;
    let directChild: Node | null = node;
    while (directChild && directChild.parentNode !== editorRef.current) {
      directChild = directChild.parentNode;
    }
    if (!directChild || directChild === editorRef.current) return null;
    if (directChild.nodeType === Node.ELEMENT_NODE) {
      const el = directChild as HTMLElement;
      const t = el.tagName.toLowerCase();
      if (["p", "div", "h1", "h2", "h3", "blockquote", "li", "pre", "ul", "ol"].includes(t)) {
        return el;
      }
    }
    if (directChild.nodeType === Node.TEXT_NODE) {
      const p = document.createElement("p");
      editorRef.current.insertBefore(p, directChild);
      p.appendChild(directChild);
      return p;
    }
    return null;
  }, []);

  const setCaretInside = useCallback((el: HTMLElement) => {
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      if (el.firstChild) {
        if (el.firstChild.nodeType === Node.TEXT_NODE) {
          range.setStart(el.firstChild, 0);
        } else {
          range.setStart(el, 0);
        }
      } else {
        range.selectNodeContents(el);
      }
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.focus?.();
    } catch {
      // ignore
    }
  }, []);

  const getCurrentBlockText = useCallback((block: HTMLElement | null) => {
    if (!block) return "";
    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-ghost]").forEach((s) => s.remove());
    return clone.textContent || "";
  }, []);

  const applyMarkdownOnSpace = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;

    const node = range.startContainer;
    let block = getClosestBlock(node);
    if (!block || !editorRef.current.contains(block)) {
      block = ensureBlockWrapper(node);
    }
    if (!block || !editorRef.current.contains(block)) return false;

    const tag = block.tagName.toLowerCase();
    const text = getCurrentBlockText(block).trim();

    const replaceBlockWith = (newEl: HTMLElement, targetInside?: HTMLElement) => {
      const parent = block!.parentNode || editorRef.current!;
      if (parent.contains(block!)) {
        parent.replaceChild(newEl, block!);
      } else {
        editorRef.current!.appendChild(newEl);
      }
      setCaretInside(targetInside || newEl);
      handleInput();
      return true;
    };

    if (!["h1", "h2", "h3"].includes(tag)) {
      if (text === "###") {
        const h = document.createElement("h3");
        h.innerHTML = "<br>";
        return replaceBlockWith(h);
      }
      if (text === "##") {
        const h = document.createElement("h2");
        h.innerHTML = "<br>";
        return replaceBlockWith(h);
      }
      if (text === "#") {
        const h = document.createElement("h1");
        h.innerHTML = "<br>";
        return replaceBlockWith(h);
      }
    }
    if (tag !== "blockquote" && text === ">") {
      const bq = document.createElement("blockquote");
      bq.innerHTML = "<br>";
      return replaceBlockWith(bq);
    }
    if (tag !== "li" && (text === "-" || text === "*")) {
      const ul = document.createElement("ul");
      const li = document.createElement("li");
      li.innerHTML = "<br>";
      ul.appendChild(li);
      return replaceBlockWith(ul, li);
    }
    if (tag !== "li" && (text === "1." || text === "1")) {
      const ol = document.createElement("ol");
      const li = document.createElement("li");
      li.innerHTML = "<br>";
      ol.appendChild(li);
      return replaceBlockWith(ol, li);
    }
    return false;
  }, [ensureBlockWrapper, getClosestBlock, getCurrentBlockText, handleInput, setCaretInside]);

  const processInlineCode = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const val = node.nodeValue || "";
    const codeMatch = /`([^`\n]+)`/.exec(val);
    if (codeMatch && range.startOffset >= codeMatch.index + codeMatch[0].length) {
      const codeText = codeMatch[1]!;
      const startIdx = codeMatch.index;
      const endIdx = startIdx + codeMatch[0].length;
      const beforeText = val.slice(0, startIdx);
      const afterText = val.slice(endIdx);

      const codeEl = document.createElement("code");
      codeEl.textContent = codeText;
      const parent = node.parentNode;
      if (parent) {
        if (beforeText) parent.insertBefore(document.createTextNode(beforeText), node);
        parent.insertBefore(codeEl, node);
        const afterNode = document.createTextNode(afterText || "\u00A0");
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);
        const newRange = document.createRange();
        newRange.setStart(afterNode, afterText ? 0 : 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        handleInput();
      }
    }
  }, [handleInput]);

  const getDirectEditorChild = useCallback((node: Node | null): HTMLElement | null => {
    if (!editorRef.current || !node) return null;
    let curr: Node | null = node;
    while (curr && curr.parentNode !== editorRef.current) {
      curr = curr.parentNode;
    }
    if (curr && curr.parentNode === editorRef.current && curr.nodeType === Node.ELEMENT_NODE) {
      return curr as HTMLElement;
    }
    return null;
  }, []);

  const getImageBlock = useCallback(
    (imgEl: HTMLImageElement): HTMLElement | null => {
      return getDirectEditorChild(imgEl) || imgEl;
    },
    [getDirectEditorChild],
  );

  const updateSelectedImgPos = useCallback((imgEl: HTMLImageElement) => {
    if (!wrapperRef.current || !imgEl.isConnected) {
      setSelectedImg(null);
      return;
    }
    if (editorRef.current) {
      editorRef.current.querySelectorAll("img.is-selected").forEach((img) => {
        if (img !== imgEl) img.classList.remove("is-selected");
      });
    }
    imgEl.classList.add("is-selected");

    const wrapRect = wrapperRef.current.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    const toolbarWidth = 164;
    const top = imgRect.top - wrapRect.top + wrapperRef.current.scrollTop + 8;
    const left = Math.max(
      8,
      imgRect.left -
        wrapRect.left +
        wrapperRef.current.scrollLeft +
        imgRect.width -
        toolbarWidth -
        8,
    );
    setSelectedImg({
      element: imgEl,
      src: imgEl.currentSrc || imgEl.src,
      top,
      left,
    });
  }, []);

  const moveImageBlock = useCallback(
    (imgEl: HTMLImageElement, direction: "up" | "down") => {
      if (!editorRef.current || !imgEl.isConnected) return;
      const block = getImageBlock(imgEl);
      if (!block || !block.parentElement) return;

      if (direction === "up") {
        const prev = block.previousElementSibling;
        if (prev) {
          editorRef.current.insertBefore(block, prev);
          handleInput();
          triggerWritingActivity();
          block.scrollIntoView({ block: "nearest", behavior: "smooth" });
          requestAnimationFrame(() => updateSelectedImgPos(imgEl));
        }
      } else {
        const next = block.nextElementSibling;
        if (next) {
          editorRef.current.insertBefore(block, next.nextElementSibling);
          handleInput();
          triggerWritingActivity();
          block.scrollIntoView({ block: "nearest", behavior: "smooth" });
          requestAnimationFrame(() => updateSelectedImgPos(imgEl));
        }
      }
    },
    [getImageBlock, handleInput, triggerWritingActivity, updateSelectedImgPos],
  );

  const handleRemoveImage = useCallback(
    (imgEl: HTMLImageElement) => {
      imgEl.classList.remove("is-selected");
      const parent = imgEl.parentElement;
      if (
        parent &&
        parent !== editorRef.current &&
        (parent.tagName === "DIV" || parent.tagName === "P") &&
        parent.children.length === 1 &&
        !parent.textContent?.trim()
      ) {
        parent.remove();
      } else {
        imgEl.remove();
      }
      setSelectedImg(null);
      handleInput();
      triggerWritingActivity();
      editorRef.current?.focus();
    },
    [handleInput, triggerWritingActivity],
  );

  const handleImageInsert = useCallback(
    async (rawSrcOrFile: string | File) => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.focus();

      const storedUri =
        typeof rawSrcOrFile === "string"
          ? await saveMediaDataUrl(rawSrcOrFile, courseIdRef.current)
          : await saveMediaFile(rawSrcOrFile, courseIdRef.current);
      const displayUrl = isMediaUri(storedUri) ? await resolveMediaUrl(storedUri) : storedUri;

      const imgWrapper = document.createElement("div");
      imgWrapper.style.margin = "8px 0";
      const img = document.createElement("img");
      img.src = displayUrl;
      if (isMediaUri(storedUri)) {
        img.setAttribute("data-media-uri", storedUri);
      }
      img.alt = "Note snapshot";
      img.draggable = false;
      img.setAttribute("draggable", "false");
      imgWrapper.appendChild(img);

      const pAfter = document.createElement("p");
      pAfter.appendChild(document.createElement("br"));

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(pAfter);
        range.insertNode(imgWrapper);
        const newRange = document.createRange();
        newRange.setStart(pAfter, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        ed.appendChild(imgWrapper);
        ed.appendChild(pAfter);
        const newRange = document.createRange();
        newRange.setStart(pAfter, 0);
        newRange.collapse(true);
        const sel2 = window.getSelection();
        sel2?.removeAllRanges();
        sel2?.addRange(newRange);
      }
      handleInput();
      triggerWritingActivity();
      requestAnimationFrame(() => {
        updateSelectedImgPos(img);
      });
    },
    [handleInput, triggerWritingActivity, updateSelectedImgPos],
  );

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (selectedImg && selectedImg.element.isConnected) {
      if (e.altKey && (e.key === "ArrowUp" || e.key === "Up")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "up");
        return;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "Down")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "down");
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        handleRemoveImage(selectedImg.element);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        selectedImg.element.classList.remove("is-selected");
        setSelectedImg(null);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      e.stopPropagation();
      onSubmit();
      return;
    }
    if (e.key === "Escape") {
      if (ghostSuggestion) {
        e.preventDefault();
        e.stopPropagation();
        removeGhostSpan();
        setGhostSuggestion(null);
        return;
      }
      if (onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      return;
    }
    if (ghostSuggestion && (e.key === "Tab" || e.key === "ArrowRight")) {
      if (e.key === "ArrowRight") {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (r.startOffset < (r.startContainer.textContent?.length ?? 0)) return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      acceptGhostSuggestion();
      return;
    }

    if (!["Control", "Shift", "Alt", "Meta", "CapsLock"].includes(e.key)) {
      removeGhostSpan();
      setGhostSuggestion(null);
      triggerWritingActivity();
    }

    if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (applyMarkdownOnSpace()) {
        e.preventDefault();
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    triggerWritingActivity();
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try {
          await handleImageInsert(file);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to paste image.");
        }
        return;
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    triggerWritingActivity();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        try {
          await handleImageInsert(file);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to drop image.");
        }
        return;
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.stopPropagation();
      const imgEl = target as HTMLImageElement;
      imgEl.draggable = false;
      imgEl.setAttribute("draggable", "false");
      updateSelectedImgPos(imgEl);
      return;
    }
    if (target.closest(".image-action-toolbar")) return;
    if (selectedImg) {
      selectedImg.element.classList.remove("is-selected");
      setSelectedImg(null);
    }
    if (target === wrapperRef.current && editorRef.current) {
      const ed = editorRef.current;
      ed.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  useEffect(() => {
    if (!selectedImg) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".image-action-toolbar") && target !== selectedImg.element) {
        selectedImg.element.classList.remove("is-selected");
        setSelectedImg(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedImg.element.isConnected) {
        setSelectedImg(null);
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "Up")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "up");
        return;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "Down")) {
        e.preventDefault();
        e.stopPropagation();
        moveImageBlock(selectedImg.element, "down");
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        handleRemoveImage(selectedImg.element);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        selectedImg.element.classList.remove("is-selected");
        setSelectedImg(null);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedImg, moveImageBlock, handleRemoveImage]);

  const handleApplyCrop = async (croppedDataUrl: string) => {
    if (croppingImage) {
      const storedUri = await saveMediaDataUrl(croppedDataUrl, courseIdRef.current);
      const displayUrl = isMediaUri(storedUri) ? await resolveMediaUrl(storedUri) : storedUri;
      const updateImg = (img: HTMLImageElement) => {
        img.src = displayUrl;
        if (isMediaUri(storedUri)) img.setAttribute("data-media-uri", storedUri);
        else img.removeAttribute("data-media-uri");
      };

      if (croppingImage.element.isConnected) {
        updateImg(croppingImage.element);
      } else if (editorRef.current) {
        const imgs = editorRef.current.querySelectorAll("img");
        for (const img of Array.from(imgs)) {
          if (img.src === croppingImage.src) {
            updateImg(img);
            break;
          }
        }
      }
      handleInput();
    }
    setCroppingImage(null);
    setSelectedImg(null);
    triggerWritingActivity();
  };

  const execCmd = (cmd: string) => {
    document.execCommand(cmd, false);
    handleInput();
    triggerWritingActivity();
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className={cn(
          "flex items-center gap-0.5 border-b border-border/50 bg-secondary/30",
          compactToolbar ? "px-2 pb-1.5 pt-1" : "px-2.5 pb-2 pt-1.5",
        )}
      >
        <EditorToolBtn label="Bold (Ctrl+B)" onClick={() => execCmd("bold")}>
          <Bold />
        </EditorToolBtn>
        <EditorToolBtn label="Italic (Ctrl+I)" onClick={() => execCmd("italic")}>
          <Italic />
        </EditorToolBtn>
        <EditorToolBtn label="Strikethrough" onClick={() => execCmd("strikeThrough")}>
          <Strikethrough />
        </EditorToolBtn>
        <div className="mx-1 h-3.5 w-px bg-border" />
        <EditorToolBtn label="Bullet list" onClick={() => execCmd("insertUnorderedList")}>
          <List />
        </EditorToolBtn>
        <div className="mx-1 h-3.5 w-px bg-border" />
        <EditorToolBtn label="Add image" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus />
        </EditorToolBtn>
        {onCaptureScreenshot && (
          <EditorToolBtn
            label="Capture video screenshot"
            onClick={async () => {
              const dataUrl = await onCaptureScreenshot();
              if (dataUrl) await handleImageInsert(dataUrl);
            }}
          >
            <Camera />
          </EditorToolBtn>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              await handleImageInsert(file);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to load image.");
            }
            e.target.value = "";
          }}
        />
      </div>

      {croppingImage && (
        <InlineImageCropper
          imageSrc={croppingImage.src}
          onApplyCrop={handleApplyCrop}
          onCancel={() => {
            setCroppingImage(null);
            setSelectedImg(null);
          }}
        />
      )}

      <div
        ref={wrapperRef}
        onClick={handleEditorClick}
        onScroll={() => {
          updateGhostSuggestion();
          if (selectedImg) updateSelectedImgPos(selectedImg.element);
        }}
        className={cn(
          "relative w-full cursor-text overflow-y-auto px-3.5 py-3 pb-8 custom-scrollbar-sm",
          maxHeightClassName,
          minHeightClassName,
          croppingImage && "hidden",
        )}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            removeGhostSpan();
            setGhostSuggestion(null);
            processInlineCode();
            handleInput();
            triggerWritingActivity();
            requestAnimationFrame(updateGhostSuggestion);
          }}
          onKeyUp={(e) => {
            if (!["Tab", "ArrowRight"].includes(e.key)) {
              updateGhostSuggestion();
            }
          }}
          onMouseUp={updateGhostSuggestion}
          onBlur={() => {
            setTimeout(() => {
              removeGhostSpan();
              setGhostSuggestion(null);
            }, 150);
          }}
          onKeyDown={handleEditorKeyDown}
          onPaste={handlePaste}
          onDragStart={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") e.preventDefault();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggingBlockRef.current) {
              e.dataTransfer.dropEffect = "move";
              const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
              const targetBlock = target ? getDirectEditorChild(target) : null;
              if (
                targetBlock &&
                targetBlock !== draggingBlockRef.current &&
                editorRef.current?.contains(targetBlock)
              ) {
                const rect = targetBlock.getBoundingClientRect();
                const isAfter = e.clientY > rect.top + rect.height / 2;
                if (isAfter) {
                  editorRef.current.insertBefore(
                    draggingBlockRef.current,
                    targetBlock.nextElementSibling,
                  );
                } else {
                  editorRef.current.insertBefore(draggingBlockRef.current, targetBlock);
                }
              }
            } else {
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            if (draggingBlockRef.current) {
              e.preventDefault();
              e.stopPropagation();
              handleInput();
              triggerWritingActivity();
              const imgEl = selectedImg?.element;
              draggingBlockRef.current = null;
              if (imgEl && imgEl.isConnected) {
                requestAnimationFrame(() => updateSelectedImgPos(imgEl));
              }
              return;
            }
            void handleDrop(e);
          }}
          className="note-editor min-h-[68px] w-full text-sm leading-6 outline-none"
          data-placeholder={placeholder}
          dir="auto"
        />

        {ghostSuggestion && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1">
            <span className="inline-flex select-none items-center gap-0.5 rounded bg-primary-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              Tab
            </span>
          </div>
        )}

        {selectedImg && (
          <div
            className="image-action-toolbar pointer-events-auto absolute z-20 flex items-center gap-0.5 rounded-lg bg-popover/95 p-1 text-popover-foreground shadow-workspace backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: `${Math.max(6, selectedImg.top)}px`,
              left: `${Math.max(6, selectedImg.left)}px`,
            }}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-note-image", "1");
                e.dataTransfer.effectAllowed = "move";
                draggingBlockRef.current = getImageBlock(selectedImg.element);
              }}
              onDragEnd={() => {
                draggingBlockRef.current = null;
              }}
              className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-3.5" />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveImageBlock(selectedImg.element, "up");
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Move up (Alt+Up)"
            >
              <ArrowUp className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveImageBlock(selectedImg.element, "down");
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Move down (Alt+Down)"
            >
              <ArrowDown className="size-3.5" />
            </button>

            <div className="mx-0.5 h-3.5 w-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleInput();
                onSuspendSmartTimers?.();
                setCroppingImage({ element: selectedImg.element, src: selectedImg.src });
                selectedImg.element.classList.remove("is-selected");
                setSelectedImg(null);
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Crop image"
            >
              <Crop className="size-3.5 text-muted-foreground" />
              <span>Crop</span>
            </button>

            <div className="mx-0.5 h-3.5 w-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemoveImage(selectedImg.element);
              }}
              className="flex size-6 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/15"
              title="Delete image (Del)"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
