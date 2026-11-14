import { apiUrl } from "@/lib/api";
import { touchCourseLastAccessed } from "@/lib/courses";

export const EXTERNAL_VISIT_THRESHOLD_MS = 8000;
export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube.com";
const ALLOWED_YOUTUBE_ORIGINS = new Set([
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
]);

/**
 * Duration-aware minimum active playback seconds required before logging a
 * lesson in Watch History.
 *
 * - Normal lessons (>= 60s): capped at 15s (e.g. 25% of duration up to 15s).
 * - Short lessons (12s-59s): 25% of duration, minimum 3s.
 * - Ultra-short clips (< 5s): min(3s, 70% of duration) so completing a 2s intro
 *   still qualifies while accidental <=1s clicks do not.
 * - Unknown duration (0s, Drive embeds, unsized streams): 10s fallback.
 */
export function getHistoryThresholdSeconds(durationSec: number): number {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (safeDuration <= 0) return 10;
  const floor = Math.min(3, safeDuration * 0.7);
  return Math.min(15, Math.max(floor, safeDuration * 0.25));
}

export interface RecordCourseAccessOptions {
  type?: "player" | "external";
  timestamp?: string;
  keepalive?: boolean;
}

/**
 * Persists intentional course engagement to `/api/courses/:id/access` and keeps
 * the client-side course list timestamp in sync.
 */
export async function recordCourseAccess(
  courseId: string,
  options: RecordCourseAccessOptions = {},
): Promise<void> {
  const now = options.timestamp ?? new Date().toISOString();
  const payload = JSON.stringify({
    type: options.type ?? "player",
    timestamp: now,
  });

  touchCourseLastAccessed(courseId, now);

  try {
    await fetch(apiUrl(`/api/courses/${encodeURIComponent(courseId)}/access`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: options.keepalive ?? false,
    });
  } catch {
    // Non-blocking: offline or closing tab should never disrupt navigation
  }
}

export interface ExternalCourseOpenOptions {
  accessType?: "external" | "player";
  thresholdMs?: number;
  onCommitted?: (timestamp: string) => void;
}

const activeExternalTrackers = new Map<string, () => void>();

/**
 * Tracks an external course/resource tab visit and only commits history after
 * the user spends at least `thresholdMs` (default 8s) away from TutIn.
 * Quick returns (< 8s) are treated as accidental clicks and canceled cleanly.
 */
export function trackExternalCourseOpen(
  courseId: string,
  options: ExternalCourseOpenOptions = {},
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Cancel any pending tracker for the same course so rapid clicks never stack
  activeExternalTrackers.get(courseId)?.();

  const thresholdMs = options.thresholdMs ?? EXTERNAL_VISIT_THRESHOLD_MS;
  const openedAt = Date.now();
  let leftTab = false;
  let settled = false;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (commitTimer !== null) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    window.removeEventListener("blur", handleLeave);
    window.removeEventListener("focus", handleReturn);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (activeExternalTrackers.get(courseId) === cancel) {
      activeExternalTrackers.delete(courseId);
    }
  };

  const commit = (keepalive: boolean) => {
    if (settled) return;
    settled = true;
    const committedAt = new Date().toISOString();
    cleanup();
    void recordCourseAccess(courseId, {
      type: options.accessType ?? "external",
      timestamp: committedAt,
      keepalive,
    });
    options.onCommitted?.(committedAt);
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  const handleLeave = () => {
    leftTab = true;
  };

  const handleReturn = () => {
    if (settled || !leftTab) return;
    if (Date.now() - openedAt >= thresholdMs) {
      commit(false);
    } else {
      cancel();
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      handleLeave();
    } else if (document.visibilityState === "visible") {
      handleReturn();
    }
  };

  const handlePageHide = () => {
    if (settled) return;
    if (leftTab && Date.now() - openedAt >= thresholdMs) {
      commit(true);
    } else {
      cancel();
    }
  };

  window.addEventListener("blur", handleLeave);
  window.addEventListener("focus", handleReturn);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  commitTimer = setTimeout(() => {
    if (leftTab || document.visibilityState === "hidden") {
      commit(false);
    } else {
      // User never switched away (e.g. blocked popup); avoid logging false history
      cancel();
    }
  }, thresholdMs);

  activeExternalTrackers.set(courseId, cancel);
  return cancel;
}

export interface YoutubeIframeStateUpdate {
  playerState?: number;
  currentTime?: number;
  duration?: number;
  isReady?: boolean;
}

/**
 * Posts the YouTube IFrame `listening` handshake so `onStateChange` and
 * `infoDelivery` updates stream back over `window.postMessage`.
 */
export function sendYoutubeListeningHandshake(
  iframe: HTMLIFrameElement | null,
  playerId: string,
): void {
  const win = iframe?.contentWindow;
  if (!win) return;
  try {
    win.postMessage(
      JSON.stringify({ event: "listening", id: playerId, channel: "widget" }),
      YOUTUBE_EMBED_ORIGIN,
    );
  } catch {
    // Cross-origin frame may reject before ready; retried by caller
  }
}

/**
 * Parses `window` `message` events emitted by a YouTube `enablejsapi=1` iframe.
 * Returns `null` for non-YouTube origins or payloads from other frames.
 */
export function parseYoutubeIframeMessage(
  event: MessageEvent,
  expectedWindow: Window | null | undefined,
): YoutubeIframeStateUpdate | null {
  if (!ALLOWED_YOUTUBE_ORIGINS.has(event.origin)) return null;
  if (expectedWindow && event.source !== expectedWindow) return null;

  let parsed: Record<string, unknown> | null = null;
  if (typeof event.data === "string") {
    if (!event.data.startsWith("{")) return null;
    try {
      const candidate = JSON.parse(event.data) as unknown;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  } else if (event.data && typeof event.data === "object" && !Array.isArray(event.data)) {
    parsed = event.data as Record<string, unknown>;
  }

  if (!parsed) return null;

  const eventName = typeof parsed["event"] === "string" ? parsed["event"] : "";
  const info = parsed["info"];

  if (eventName === "onReady") {
    return { isReady: true };
  }

  if (eventName === "onStateChange" && typeof info === "number") {
    return { playerState: info };
  }

  if (
    (eventName === "infoDelivery" || eventName === "initialDelivery") &&
    info &&
    typeof info === "object" &&
    !Array.isArray(info)
  ) {
    const infoObj = info as Record<string, unknown>;
    const update: YoutubeIframeStateUpdate = {};
    if (typeof infoObj["playerState"] === "number") {
      update.playerState = infoObj["playerState"];
    }
    if (typeof infoObj["currentTime"] === "number" && Number.isFinite(infoObj["currentTime"])) {
      update.currentTime = infoObj["currentTime"];
    }
    if (typeof infoObj["duration"] === "number" && Number.isFinite(infoObj["duration"])) {
      update.duration = infoObj["duration"];
    }
    if (
      update.playerState !== undefined ||
      update.currentTime !== undefined ||
      update.duration !== undefined
    ) {
      return update;
    }
  }

  return null;
}
