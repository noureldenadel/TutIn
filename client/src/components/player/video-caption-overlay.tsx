import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { CaptionFontSize, CaptionPosition } from "@/lib/app-settings";

const FONT_SIZE_SCALES: Record<CaptionFontSize, string> = {
  small: "clamp(0.75rem, min(1.25cqw, 2.25cqh), 1.375rem)",
  medium: "clamp(0.875rem, min(1.5cqw, 2.7cqh), 1.625rem)",
  large: "clamp(1rem, min(1.85cqw, 3.3cqh), 2rem)",
};

const FADE_OUT_MS = 200;
const EDGE_MARGIN_PX = 12;
const CONTROLS_GAP_PX = 12;

export function VideoCaptionOverlay({
  text,
  rtl = false,
  enabled,
  controlsVisible,
  controlsHeight,
  fontSize,
  showBackground,
  position,
  onPositionChange,
}: {
  text: string | null;
  rtl?: boolean;
  enabled: boolean;
  controlsVisible: boolean;
  controlsHeight: number;
  fontSize: CaptionFontSize;
  showBackground: boolean;
  position: CaptionPosition | null;
  onPositionChange: (next: CaptionPosition | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    latestPos: CaptionPosition;
    moved: boolean;
  } | null>(null);

  const activeText = enabled ? text : null;
  const [prevActiveText, setPrevActiveText] = useState<string | null>(activeText);
  const [fadingText, setFadingText] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<CaptionPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [customLiftPx, setCustomLiftPx] = useState(0);

  if (activeText !== prevActiveText) {
    setPrevActiveText(activeText);
    if (activeText) {
      setFadingText(null);
    } else if (enabled && prevActiveText) {
      setFadingText(prevActiveText);
    } else {
      setFadingText(null);
    }
  }

  const latestOnPositionChangeRef = useRef(onPositionChange);
  latestOnPositionChangeRef.current = onPositionChange;

  useEffect(() => {
    if (!fadingText) return;
    const timer = window.setTimeout(() => {
      setFadingText(null);
    }, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [fadingText]);

  useEffect(() => {
    if (!isDragging) return;

    const computeClampedPosition = (clientX: number, clientY: number): CaptionPosition | null => {
      const stage = stageRef.current;
      const box = captionRef.current;
      const drag = dragStateRef.current;
      if (!stage || !box || !drag) return null;

      const stageRect = stage.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0) return null;

      const visualRect = (textRef.current ?? box).getBoundingClientRect();
      const halfWPct = Math.min(
        45,
        ((visualRect.width / 2 + EDGE_MARGIN_PX) / stageRect.width) * 100,
      );
      const halfHPct = Math.min(
        45,
        ((visualRect.height / 2 + EDGE_MARGIN_PX) / stageRect.height) * 100,
      );

      const rawX = ((clientX - stageRect.left - drag.offsetX) / stageRect.width) * 100;
      const rawY = ((clientY - stageRect.top - drag.offsetY) / stageRect.height) * 100;

      return {
        x: Math.max(halfWPct, Math.min(100 - halfWPct, rawX)),
        y: Math.max(halfHPct, Math.min(100 - halfHPct, rawY)),
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const next = computeClampedPosition(e.clientX, e.clientY);
      if (!next) return;
      if (Math.abs(next.x - drag.latestPos.x) > 0.1 || Math.abs(next.y - drag.latestPos.y) > 0.1) {
        drag.moved = true;
      }
      drag.latestPos = next;
      setDragPos(next);
    };

    const finishDrag = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const finalPos = drag.latestPos;
      const didMove = drag.moved;
      dragStateRef.current = null;
      setIsDragging(false);
      setDragPos(null);
      if (didMove) {
        latestOnPositionChangeRef.current(finalPos);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [isDragging]);

  const activePos = dragPos ?? position;
  const displayText = activeText ?? fadingText;
  const isCueVisible = Boolean(activeText);
  const effectiveControlsClearance = (controlsHeight > 0 ? controlsHeight : 88) + CONTROLS_GAP_PX;

  useLayoutEffect(() => {
    if (!activePos || !controlsVisible || isDragging || !displayText) {
      setCustomLiftPx(0);
      return;
    }
    const stage = stageRef.current;
    const box = captionRef.current;
    if (!stage || !box) {
      setCustomLiftPx(0);
      return;
    }
    const stageH = stage.clientHeight;
    const boxH = box.offsetHeight;
    if (stageH <= 0 || boxH <= 0) {
      setCustomLiftPx(0);
      return;
    }
    const bottomGap = stageH * (1 - activePos.y / 100) - boxH / 2;
    const lift =
      bottomGap < effectiveControlsClearance ? effectiveControlsClearance - bottomGap : 0;
    setCustomLiftPx(lift);
  }, [activePos, controlsVisible, isDragging, displayText, effectiveControlsClearance, fontSize]);

  if (!enabled) {
    return null;
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!isCueVisible) return;
    e.stopPropagation();

    const stage = stageRef.current;
    const box = captionRef.current;
    if (!stage || !box) return;

    const stageRect = stage.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;

    const centerX = boxRect.left + boxRect.width / 2;
    const centerY = boxRect.top + boxRect.height / 2;
    const initialPos: CaptionPosition = position ?? {
      x: ((centerX - stageRect.left) / stageRect.width) * 100,
      y: ((centerY - stageRect.top) / stageRect.height) * 100,
    };

    dragStateRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - centerX,
      offsetY: e.clientY - centerY,
      latestPos: initialPos,
      moved: false,
    };
    setDragPos(initialPos);
    setIsDragging(true);
  };

  return (
    <div
      ref={stageRef}
      style={{ containerType: "size" }}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {displayText && (
        <div
          ref={captionRef}
          dir={rtl ? "rtl" : "ltr"}
          aria-live="off"
          style={{
            fontSize: FONT_SIZE_SCALES[fontSize],
            width: "max-content",
            maxWidth: "min(84%, 38em)",
            textWrap: "balance",
            unicodeBidi: "plaintext",
            ...(activePos
              ? {
                  left: `${activePos.x}%`,
                  top: `${activePos.y}%`,
                  transform: `translate(-50%, calc(-50% - ${customLiftPx}px))`,
                }
              : {
                  left: "50%",
                  bottom: controlsVisible
                    ? `${effectiveControlsClearance}px`
                    : "clamp(0.875rem, 4.2cqh, 2.5rem)",
                  transform: "translateX(-50%)",
                }),
          }}
          className={cn(
            "pointer-events-none absolute select-none whitespace-pre-line text-center font-sans font-normal leading-[1.56] text-white antialiased",
            isDragging
              ? "transition-none"
              : "transition-[left,top,bottom,transform,opacity] duration-200 ease-out",
            isCueVisible ? "opacity-100" : "opacity-0",
          )}
        >
          <span
            ref={textRef}
            data-no-speed-boost="true"
            onPointerDown={handlePointerDown}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (position !== null) onPositionChange(null);
            }}
            className={cn(
              "inline box-decoration-clone",
              isCueVisible ? "pointer-events-auto" : "pointer-events-none",
              isDragging ? "cursor-grabbing" : "cursor-grab",
              showBackground
                ? "rounded-[0.2em] bg-[rgba(8,8,8,0.85)] px-[0.42em] pt-[0.02em] pb-[0.14em]"
                : "bg-transparent px-[0.2em] [text-shadow:0_1px_3px_rgba(0,0,0,0.92),0_0_6px_rgba(0,0,0,0.85)]",
            )}
          >
            {displayText}
          </span>
        </div>
      )}
    </div>
  );
}
