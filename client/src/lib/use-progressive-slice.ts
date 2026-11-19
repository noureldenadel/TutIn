import { useEffect, useRef, useState } from "react";

interface UseProgressiveSliceOptions {
  total: number;
  initialCount?: number;
  step?: number;
  /** Minimum count to pre-mount (e.g. derived from restored scroll offset so scroll restoration never clamps). */
  minVisibleCount?: number;
  /** Changing this key resets the progressive slice back to initialCount (e.g. search/filter changes). */
  resetKey?: string;
}

/**
 * Progressively appends batches of items as a bottom sentinel enters the scroll viewport,
 * keeping initial DOM light on large libraries/histories without interfering with scroll restoration.
 */
export function useProgressiveSlice({
  total,
  initialCount = 24,
  step = 24,
  minVisibleCount = 0,
  resetKey = "",
}: UseProgressiveSliceOptions) {
  const baseCount = Math.max(initialCount, minVisibleCount);
  const [visibleCount, setVisibleCount] = useState<number>(baseCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prevResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      setVisibleCount(baseCount);
    }
  }, [baseCount, resetKey]);

  const effectiveCount = Math.min(total, Math.max(visibleCount, minVisibleCount));
  const hasMore = effectiveCount < total;

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisibleCount(total);
      return;
    }

    // Use the nearest scrolling ancestor (<main>) as root when available so rootMargin preloads ahead smoothly.
    const scrollRoot = node.closest("main");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(total, Math.max(prev, effectiveCount) + step));
        }
      },
      {
        root: scrollRoot instanceof Element ? scrollRoot : null,
        rootMargin: "480px 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [effectiveCount, hasMore, step, total]);

  return { visibleCount: effectiveCount, hasMore, sentinelRef };
}
