import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api";
import {
  readAppSettings,
  type DubBackgroundMode,
  type DubVoiceEngine,
  type DubVoiceGender,
} from "@/lib/app-settings";
import { fetchCourseCurriculum, type SubtitleSource } from "@/lib/course-lessons";
import { getLanguageLabel, normalizeLanguageCode } from "@/lib/languages";

export interface TranscriptProgressUpdate {
  step: string;
  progress: number; // 0 to 100
  message: string;
}

export interface TranscribeVideoTarget {
  videoId: string;
  courseId: string;
  title?: string | undefined;
  youtubeId?: string | null | undefined;
}

export interface TranscriptJobStep {
  id: string;
  label: string;
  detail?: string | undefined;
  status: "running" | "done";
}

export interface DubTrackMeta {
  language: string;
  engine?: DubVoiceEngine | undefined;
  bgMode?: DubBackgroundMode | undefined;
  voiceGender?: DubVoiceGender | undefined;
  generatedAt?: string | null | undefined;
}

export interface TranscriptJobItem {
  videoId: string;
  courseId: string;
  videoTitle: string;
  mode: "transcribe" | "translate" | "dub";
  targetLanguage: string;
  sourceLanguage: string;
  sourceTrackId?: string | undefined;
  dubEngine?: DubVoiceEngine | undefined;
  dubVoiceGender?: DubVoiceGender | undefined;
  dubBgMode?: DubBackgroundMode | undefined;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number; // 0 to 100
  message: string;
  steps: TranscriptJobStep[];
  startedAt?: number | undefined;
  error?: string | undefined;
}

export const TRANSCRIPT_UPDATED_EVENT = "tutin:transcript-updated";
export const DUB_UPDATED_EVENT = "tutin:dub-updated";

export function notifyTranscriptUpdated(
  videoId: string,
  courseId?: string,
  options?: { trackId?: string | undefined; targetLang?: string | undefined },
): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TRANSCRIPT_UPDATED_EVENT, {
        detail: {
          videoId,
          courseId,
          trackId: options?.trackId,
          targetLang: options?.targetLang,
        },
      }),
    );
  }
  if (courseId) {
    void fetchCourseCurriculum(courseId, true).catch(() => {});
  }
}

export function notifyDubUpdated(
  videoId: string,
  courseId?: string,
  options?: { targetLang?: string | undefined; track?: DubTrackMeta | null | undefined },
): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DUB_UPDATED_EVENT, {
        detail: {
          videoId,
          courseId,
          targetLang: options?.targetLang,
          track: options?.track,
        },
      }),
    );
  }
  if (courseId) {
    void fetchCourseCurriculum(courseId, true).catch(() => {});
  }
}

// ── Browser WebWorker Whisper Fallback Engine ────────────────────

let whisperWorker: Worker | null = null;
let activeWorkerCancel: (() => void) | null = null;

function getWhisperWorker(): Worker {
  if (!whisperWorker) {
    whisperWorker = new Worker(new URL("./whisper-worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return whisperWorker;
}

export function cancelActiveBrowserTranscription(): void {
  if (activeWorkerCancel) {
    activeWorkerCancel();
    activeWorkerCancel = null;
  }
  if (whisperWorker) {
    whisperWorker.terminate();
    whisperWorker = null;
  }
}

function parseWavToFloat32(arrayBuffer: ArrayBuffer): Float32Array | null {
  try {
    const view = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 44) return null;
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    if (riff !== "RIFF") return null;

    let offset = 12;
    while (offset + 8 <= arrayBuffer.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === "data") {
        const dataStart = offset + 8;
        const availableBytes = arrayBuffer.byteLength - dataStart;
        const sampleCount = Math.floor(
          (chunkSize > 0 && chunkSize <= availableBytes ? chunkSize : availableBytes) / 2,
        );
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          const int16 = view.getInt16(dataStart + i * 2, true);
          float32[i] = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
        }
        return float32;
      }
      offset += 8 + chunkSize;
    }
    return null;
  } catch {
    return null;
  }
}

function detectSpeechOnset(audioBuffer: Float32Array, sampleRate = 16000): number {
  if (!audioBuffer || audioBuffer.length === 0) return 0;
  const windowSamples = Math.floor(sampleRate * 0.05);
  const maxScanSamples = Math.min(audioBuffer.length, sampleRate * 60);
  const rmsThreshold = 0.012;
  const requiredConsecutive = 3;
  let consecutiveActive = 0;

  for (let i = 0; i + windowSamples <= maxScanSamples; i += windowSamples) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples; j++) {
      const s = audioBuffer[i + j] ?? 0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / windowSamples);
    if (rms >= rmsThreshold) {
      consecutiveActive++;
      if (consecutiveActive >= requiredConsecutive) {
        const onsetSample = i - (requiredConsecutive - 1) * windowSamples;
        return Math.max(0, onsetSample / sampleRate - 0.15);
      }
    } else {
      consecutiveActive = 0;
    }
  }
  return 0;
}

async function extract16kAudioFromServer(
  videoId: string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const res = await fetch(
    apiUrl(`/api/videos/${encodeURIComponent(videoId)}/audio-16k`),
    signal ? { signal } : undefined,
  );
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || "Could not extract 16kHz audio stream from video");
  }
  const arrayBuffer = await res.arrayBuffer();
  const parsed = parseWavToFloat32(arrayBuffer);
  if (parsed && parsed.length > 0) return parsed;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx({ sampleRate: 16000 });
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return decoded.getChannelData(0);
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

async function runBrowserWhisperTranscription(
  videoId: string,
  language: string,
  onProgress?: (update: TranscriptProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<Array<{ start: number; end: number; timestamp: [number, number]; text: string }>> {
  const settings = readAppSettings();

  onProgress?.({
    step: "extracting",
    progress: 12,
    message: "Extracting 16kHz audio stream…",
  });

  const audioBuffer = await extract16kAudioFromServer(videoId, signal);
  if (signal?.aborted) throw new Error("Cancelled");

  const speechOnset = detectSpeechOnset(audioBuffer, 16000);

  onProgress?.({
    step: "loading",
    progress: 25,
    message: "Initializing Whisper model…",
  });

  const worker = getWhisperWorker();
  const reqId = `whisper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const rawChunks = await new Promise<Array<{ text: string; timestamp: [number, number | null] }>>(
    (resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMsg);
        activeWorkerCancel = null;
      };

      const abortHandler = () => {
        cleanup();
        cancelActiveBrowserTranscription();
        reject(new Error("Cancelled"));
      };

      activeWorkerCancel = abortHandler;
      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      const onMsg = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg || msg.id !== reqId) return;

        if (msg.type === "progress" && msg.data) {
          const pct = typeof msg.data.progress === "number" ? Math.round(msg.data.progress) : 0;
          onProgress?.({
            step: "downloading",
            progress: Math.min(55, 25 + Math.round(pct * 0.3)),
            message: `Loading Whisper model (${pct}%)…`,
          });
        } else if (msg.type === "status") {
          onProgress?.({
            step: "transcribing",
            progress: 60,
            message: msg.message || "Transcribing speech…",
          });
        } else if (msg.type === "complete") {
          cleanup();
          resolve(msg.result?.chunks ?? []);
        } else if (msg.type === "error") {
          cleanup();
          reject(new Error(msg.error || "Whisper transcription failed"));
        }
      };

      worker.addEventListener("message", onMsg);
      worker.postMessage({
        type: "transcribe",
        id: reqId,
        audio: audioBuffer,
        device: settings.computeDevice,
        language,
        model: settings.whisperModel === "whisper-small" ? "whisper-small" : "whisper-base",
      });
    },
  );

  const formatted = rawChunks
    .map((c, idx) => {
      let start = Number(c.timestamp?.[0] ?? 0);
      const end = Number(c.timestamp?.[1] ?? start + 2.5);
      if (idx === 0 && speechOnset >= 0.4 && start < 0.25 && end > speechOnset + 0.3) {
        start = Number(speechOnset.toFixed(2));
      }
      return {
        start,
        end: Math.max(start + 0.5, end),
        timestamp: [start, Math.max(start + 0.5, end)] as [number, number],
        text: (c.text || "").trim(),
      };
    })
    .filter((c) => c.text.length > 0);

  return formatted;
}

// ── Unified Transcription Function (Backend Faster-Whisper -> Browser Fallback) ──

export async function transcribeVideoCaptions(
  target: TranscribeVideoTarget,
  language = "en",
  onProgress?: (update: TranscriptProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<SubtitleSource | null> {
  const settings = readAppSettings();
  const normLang = normalizeLanguageCode(language);

  // 1. YouTube Fast Path
  if (target.youtubeId) {
    onProgress?.({
      step: "fetching",
      progress: 25,
      message: "Fetching YouTube subtitles…",
    });
    const ytRes = await fetch(
      apiUrl(
        `/api/youtube/transcript?videoId=${encodeURIComponent(target.youtubeId)}&dbVideoId=${encodeURIComponent(target.videoId)}&lang=${encodeURIComponent(normLang)}`,
      ),
      signal ? { signal } : undefined,
    );
    if (!ytRes.ok) {
      const errData = (await ytRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || "YouTube subtitles unavailable for this video");
    }
    const ytData = (await ytRes.json()) as { track?: SubtitleSource };
    onProgress?.({
      step: "done",
      progress: 100,
      message: "YouTube subtitles saved",
    });
    const resolvedYtTrackId = ytData.track?.id || `${normLang}:generated`;
    notifyTranscriptUpdated(target.videoId, target.courseId, {
      trackId: resolvedYtTrackId,
      targetLang: normLang,
    });
    return ytData.track ?? null;
  }

  // 2. Try Backend Faster-Whisper (Silero VAD + Word Timestamps + Clause Segmentation)
  onProgress?.({
    step: "transcribing",
    progress: 15,
    message: `Transcribing audio (${getLanguageLabel(normLang)})…`,
  });

  let simulatedPct = 15;
  const progressTimer = setInterval(() => {
    simulatedPct = Math.min(88, simulatedPct + (simulatedPct < 45 ? 4 : simulatedPct < 70 ? 2 : 1));
    onProgress?.({
      step: "transcribing",
      progress: simulatedPct,
      message:
        simulatedPct < 35
          ? `Preparing Faster-Whisper (${getLanguageLabel(normLang)})…`
          : `Transcribing audio (${getLanguageLabel(normLang)})…`,
    });
  }, 1200);

  try {
    const serverRes = await fetch(
      apiUrl(`/api/transcripts/${encodeURIComponent(target.videoId)}/transcribe`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: normLang,
          model: settings.whisperModel,
        }),
        ...(signal ? { signal } : {}),
      },
    );

    if (serverRes.ok) {
      const data = (await serverRes.json()) as {
        success?: boolean;
        fallbackToBrowser?: boolean;
        track?: SubtitleSource;
      };
      if (data.success && !data.fallbackToBrowser) {
        onProgress?.({
          step: "done",
          progress: 100,
          message: "Transcription complete",
        });
        const resolvedTrackId = data.track?.id || `${normLang}:generated`;
        notifyTranscriptUpdated(target.videoId, target.courseId, {
          trackId: resolvedTrackId,
          targetLang: normLang,
        });
        return data.track ?? null;
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    // Fall through to browser worker
  } finally {
    clearInterval(progressTimer);
  }

  // 3. Fallback: In-Browser WebGPU / WASM Whisper Worker
  const browserChunks = await runBrowserWhisperTranscription(
    target.videoId,
    normLang,
    onProgress,
    signal,
  );

  onProgress?.({
    step: "saving",
    progress: 92,
    message: "Saving subtitles to course vault…",
  });

  const saveRes = await fetch(apiUrl(`/api/transcripts/${encodeURIComponent(target.videoId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: normLang,
      chunks: browserChunks,
    }),
    ...(signal ? { signal } : {}),
  });

  if (!saveRes.ok) {
    const errData = (await saveRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || "Failed to save generated subtitles");
  }

  const savedData = (await saveRes.json()) as { track?: SubtitleSource };
  onProgress?.({
    step: "done",
    progress: 100,
    message: "Transcription complete",
  });

  const resolvedSavedTrackId = savedData.track?.id || `${normLang}:generated`;
  notifyTranscriptUpdated(target.videoId, target.courseId, {
    trackId: resolvedSavedTrackId,
    targetLang: normLang,
  });
  return savedData.track ?? null;
}

// ── Streaming Subtitle Translation Function ─────────────────────

export async function translateVideoSubtitles(
  target: TranscribeVideoTarget,
  options: {
    targetLanguage: string;
    sourceLanguage: string;
    sourceTrackId?: string | undefined;
    ensureSourceFirst?: boolean | undefined;
  },
  onProgress?: (update: TranscriptProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<SubtitleSource | null> {
  const settings = readAppSettings();
  const targetLang = normalizeLanguageCode(options.targetLanguage);
  const sourceLang = normalizeLanguageCode(options.sourceLanguage);

  // Check if source captions exist; if not and ensureSourceFirst !== false, transcribe first
  if (options.ensureSourceFirst !== false && !options.sourceTrackId) {
    const langRes = await fetch(
      apiUrl(`/api/transcripts/${encodeURIComponent(target.videoId)}/languages`),
      signal ? { signal } : undefined,
    );
    if (langRes.ok) {
      const langData = (await langRes.json()) as {
        sourceExists?: boolean;
        subtitleSources?: SubtitleSource[];
      };
      const hasAnySource =
        Boolean(langData.sourceExists) || (langData.subtitleSources?.length ?? 0) > 0;
      if (!hasAnySource) {
        await transcribeVideoCaptions(
          target,
          sourceLang,
          (subProg) => {
            onProgress?.({
              step: subProg.step,
              progress: Math.round(subProg.progress * 0.45),
              message: `Step 1/2 · ${subProg.message}`,
            });
          },
          signal,
        );
      }
    }
  }

  onProgress?.({
    step: "loading",
    progress: 48,
    message: `Starting translation to ${getLanguageLabel(targetLang)}…`,
  });

  const response = await fetch(
    apiUrl(`/api/transcripts/${encodeURIComponent(target.videoId)}/translate`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetLanguage: targetLang,
        sourceLanguage: sourceLang,
        sourceTrackId: options.sourceTrackId,
        openRouterApiKey: settings.openRouterApiKey,
        openRouterModel: settings.openRouterModel,
      }),
      ...(signal ? { signal } : {}),
    },
  );

  if (!response.ok || !response.body) {
    const errData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Translation failed (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let createdTrack: SubtitleSource | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;

      let payload: {
        error?: string;
        step?: string;
        percent?: number;
        message?: string;
        done?: boolean;
        track?: SubtitleSource;
      };
      try {
        payload = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (typeof payload.percent === "number") {
        onProgress?.({
          step: payload.step || "translating",
          progress: Math.min(99, Math.max(5, Math.round(payload.percent))),
          message: payload.message || `Translating (${Math.round(payload.percent)}%)…`,
        });
      }

      if (payload.done) {
        createdTrack = payload.track ?? null;
      }
    }
  }

  onProgress?.({
    step: "done",
    progress: 100,
    message: `Translated to ${getLanguageLabel(targetLang)}`,
  });

  const resolvedTranslatedTrackId = createdTrack?.id || `${targetLang}:generated`;
  notifyTranscriptUpdated(target.videoId, target.courseId, {
    trackId: resolvedTranslatedTrackId,
    targetLang,
  });
  return createdTrack;
}

// ── Streaming AI Voice Dubbing Function ─────────────────────────

export async function dubVideoAudio(
  target: TranscribeVideoTarget,
  options: {
    targetLanguage: string;
    sourceLanguage: string;
    sourceTrackId?: string | undefined;
    engine?: DubVoiceEngine | undefined;
    voiceGender?: DubVoiceGender | undefined;
    bgMode?: DubBackgroundMode | undefined;
  },
  onProgress?: (update: TranscriptProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<DubTrackMeta | null> {
  const settings = readAppSettings();
  const targetLang = normalizeLanguageCode(options.targetLanguage);
  const sourceLang = normalizeLanguageCode(options.sourceLanguage);
  const engine = options.engine ?? settings.dubVoiceEngine;
  const voiceGender = options.voiceGender ?? settings.dubVoiceGender;
  const bgMode = options.bgMode ?? settings.dubBgMode;

  onProgress?.({
    step: "starting-dub",
    progress: 8,
    message: `Preparing ${getLanguageLabel(targetLang)} dub…`,
  });

  const response = await fetch(
    apiUrl(`/api/dub/video/${encodeURIComponent(target.videoId)}/generate`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetLanguage: targetLang,
        sourceLanguage: sourceLang,
        sourceTrackId: options.sourceTrackId,
        engine,
        voiceGender,
        bgMode,
        device: settings.dubComputingDevice,
        unloadIdleModel: settings.dubUnloadIdleModel,
        openRouterApiKey: settings.openRouterApiKey,
        openRouterModel: settings.openRouterModel,
      }),
      ...(signal ? { signal } : {}),
    },
  );

  if (!response.ok || !response.body) {
    const errData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Dubbing failed (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let createdDubTrack: DubTrackMeta | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;

      let payload: {
        error?: string;
        step?: string;
        percent?: number;
        message?: string;
        done?: boolean;
        track?: DubTrackMeta;
      };
      try {
        payload = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (typeof payload.percent === "number") {
        onProgress?.({
          step: payload.step || "synthesizing",
          progress: Math.min(99, Math.max(5, Math.round(payload.percent))),
          message: payload.message || `Synthesizing voice (${Math.round(payload.percent)}%)…`,
        });
      }

      if (payload.done) {
        createdDubTrack = payload.track ?? { language: targetLang, engine, bgMode, voiceGender };
      }
    }
  }

  onProgress?.({
    step: "done",
    progress: 100,
    message: `${getLanguageLabel(targetLang)} dub ready`,
  });

  // Notify both transcript and dub listeners (in case auto-translation also generated subtitles)
  notifyTranscriptUpdated(target.videoId, target.courseId, {
    targetLang,
  });
  notifyDubUpdated(target.videoId, target.courseId, {
    targetLang,
    track: createdDubTrack,
  });

  return createdDubTrack;
}

// ── Track Management Actions (Set Master, Set Source, Delete) ───

export async function setSubtitleTrackMaster(
  videoId: string,
  trackId: string,
  courseId?: string,
): Promise<SubtitleSource[]> {
  const res = await fetch(apiUrl(`/api/transcripts/${encodeURIComponent(videoId)}/set-master`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: trackId }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to set Master subtitle track");
  }
  const data = (await res.json()) as { subtitleSources?: SubtitleSource[] };
  notifyTranscriptUpdated(videoId, courseId);
  return data.subtitleSources ?? [];
}

export async function setSubtitleTrackSource(
  videoId: string,
  trackId: string | null,
  courseId?: string,
): Promise<SubtitleSource[]> {
  const res = await fetch(apiUrl(`/api/transcripts/${encodeURIComponent(videoId)}/make-source`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trackId ? { id: trackId } : { clear: true }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to update translation source track");
  }
  const data = (await res.json()) as { subtitleSources?: SubtitleSource[] };
  notifyTranscriptUpdated(videoId, courseId);
  return data.subtitleSources ?? [];
}

export async function deleteSubtitleTrack(
  videoId: string,
  trackId: string,
  courseId?: string,
): Promise<SubtitleSource[]> {
  const res = await fetch(
    apiUrl(`/api/transcripts/${encodeURIComponent(videoId)}?id=${encodeURIComponent(trackId)}`),
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to delete subtitle track");
  }
  const data = (await res.json()) as { subtitleSources?: SubtitleSource[] };
  notifyTranscriptUpdated(videoId, courseId);
  return data.subtitleSources ?? [];
}

// ── Global Background Job Queue (Syncs Player & Curriculum Manager) ──

type JobsSnapshot = Record<string, TranscriptJobItem>;

let jobsState: JobsSnapshot = {};
const jobListeners = new Set<() => void>();
const jobAbortControllers = new Map<string, AbortController>();
let isProcessingQueue = false;

function emitJobsChange(): void {
  jobsState = { ...jobsState };
  for (const listener of jobListeners) {
    listener();
  }
}

export function getTranscriptJobsSnapshot(): JobsSnapshot {
  return jobsState;
}

export function subscribeTranscriptJobs(listener: () => void): () => void {
  jobListeners.add(listener);
  return () => {
    jobListeners.delete(listener);
  };
}

export function useTranscriptJobs(): JobsSnapshot {
  return useSyncExternalStore(
    subscribeTranscriptJobs,
    getTranscriptJobsSnapshot,
    getTranscriptJobsSnapshot,
  );
}

export function useVideoTranscriptJob(videoId?: string | null): TranscriptJobItem | null {
  const all = useTranscriptJobs();
  if (!videoId) return null;
  const job = all[videoId];
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") return job;
  return null;
}

function normalizeStepEntry(upd: TranscriptProgressUpdate): {
  id: string;
  label: string;
  detail?: string | undefined;
} {
  const rawMsg = upd.message.replace(/…+$/, "").trim();
  const isPrepStep = rawMsg.startsWith("Step 1/2");
  const cleanMsg = rawMsg.replace(/^Step 1\/2\s*·\s*/i, "");
  const stepKey = `${isPrepStep ? "prep:" : ""}${upd.step || "working"}`;

  // Split trailing parenthetical detail like "Translating (42%)" -> label + detail
  const parenMatch = cleanMsg.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (parenMatch) {
    return {
      id: stepKey,
      label: parenMatch[1]!.trim(),
      detail: parenMatch[2]!.trim(),
    };
  }
  return {
    id: stepKey,
    label: cleanMsg || (upd.step === "done" ? "Finishing" : "Processing"),
    detail: upd.progress > 0 && upd.progress < 100 ? `${upd.progress}%` : undefined,
  };
}

function advanceJobWithProgress(
  prev: TranscriptJobItem,
  upd: TranscriptProgressUpdate,
): TranscriptJobItem {
  const nextEntry = normalizeStepEntry(upd);
  const existingIdx = prev.steps.findIndex((s) => s.id === nextEntry.id);

  let nextSteps: TranscriptJobStep[];
  if (upd.step === "done") {
    nextSteps = prev.steps.map((s) => ({ ...s, status: "done" as const }));
  } else if (existingIdx !== -1) {
    nextSteps = prev.steps.map((s, idx) => {
      if (idx === existingIdx) {
        return {
          ...s,
          label: nextEntry.label,
          detail: nextEntry.detail,
          status: "running" as const,
        };
      }
      return idx < existingIdx || s.status === "running" ? { ...s, status: "done" as const } : s;
    });
  } else {
    nextSteps = [
      ...prev.steps.map((s) => ({ ...s, status: "done" as const })),
      {
        id: nextEntry.id,
        label: nextEntry.label,
        detail: nextEntry.detail,
        status: "running" as const,
      },
    ];
  }

  return {
    ...prev,
    progress: upd.progress,
    message: upd.message,
    steps: nextSteps,
  };
}

export function enqueueTranscriptJobs(
  items: Array<{
    videoId: string;
    courseId: string;
    videoTitle: string;
    youtubeId?: string | null | undefined;
    mode: "transcribe" | "translate" | "dub";
    targetLanguage: string;
    sourceLanguage: string;
    sourceTrackId?: string | undefined;
    dubEngine?: DubVoiceEngine | undefined;
    dubVoiceGender?: DubVoiceGender | undefined;
    dubBgMode?: DubBackgroundMode | undefined;
  }>,
): void {
  if (items.length === 0) return;

  for (const item of items) {
    const existing = jobsState[item.videoId];
    if (existing && (existing.status === "running" || existing.status === "queued")) {
      continue;
    }
    jobsState[item.videoId] = {
      videoId: item.videoId,
      courseId: item.courseId,
      videoTitle: item.videoTitle,
      mode: item.mode,
      targetLanguage: normalizeLanguageCode(item.targetLanguage),
      sourceLanguage: normalizeLanguageCode(item.sourceLanguage),
      sourceTrackId: item.sourceTrackId,
      dubEngine: item.dubEngine,
      dubVoiceGender: item.dubVoiceGender,
      dubBgMode: item.dubBgMode,
      status: "queued",
      progress: 0,
      message: "Queued…",
      steps: [
        {
          id: "queued",
          label: "Waiting in queue",
          status: "running",
        },
      ],
    };
    (jobsState[item.videoId] as TranscriptJobItem & { youtubeId?: string | null }).youtubeId =
      item.youtubeId ?? null;
  }

  emitJobsChange();
  void processQueueLoop();
}

export function cancelTranscriptJob(videoId: string): void {
  const job = jobsState[videoId];
  if (!job) return;

  const controller = jobAbortControllers.get(videoId);
  if (controller) {
    controller.abort();
    jobAbortControllers.delete(videoId);
  }
  cancelActiveBrowserTranscription();

  delete jobsState[videoId];
  emitJobsChange();
}

export function cancelAllTranscriptJobs(courseId?: string): void {
  for (const [vid, job] of Object.entries(jobsState)) {
    if (courseId && job.courseId !== courseId) continue;
    const controller = jobAbortControllers.get(vid);
    if (controller) {
      controller.abort();
      jobAbortControllers.delete(vid);
    }
    delete jobsState[vid];
  }
  cancelActiveBrowserTranscription();
  emitJobsChange();
}

async function processQueueLoop(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (true) {
      const nextJob = Object.values(jobsState).find((j) => j.status === "queued") as
        (TranscriptJobItem & { youtubeId?: string | null }) | undefined;
      if (!nextJob) break;

      const vid = nextJob.videoId;
      const controller = new AbortController();
      jobAbortControllers.set(vid, controller);

      const initialMessage =
        nextJob.mode === "transcribe"
          ? `Transcribing (${getLanguageLabel(nextJob.targetLanguage)})…`
          : nextJob.mode === "dub"
            ? `Dubbing to ${getLanguageLabel(nextJob.targetLanguage)}…`
            : `Translating to ${getLanguageLabel(nextJob.targetLanguage)}…`;
      const initialStepId =
        nextJob.mode === "transcribe"
          ? "starting-transcribe"
          : nextJob.mode === "dub"
            ? "starting-dub"
            : "starting-translate";
      const initialStepLabel =
        nextJob.mode === "transcribe"
          ? "Starting transcription"
          : nextJob.mode === "dub"
            ? "Starting voice dubbing"
            : "Starting translation";
      jobsState[vid] = {
        ...nextJob,
        status: "running",
        startedAt: Date.now(),
        progress: 5,
        message: initialMessage,
        steps: [
          {
            id: "queued",
            label: "Queued",
            status: "done",
          },
          {
            id: initialStepId,
            label: initialStepLabel,
            detail: getLanguageLabel(nextJob.targetLanguage),
            status: "running",
          },
        ],
      };
      emitJobsChange();

      const pushProgress = (upd: TranscriptProgressUpdate) => {
        if (!jobsState[vid]) return;
        jobsState[vid] = advanceJobWithProgress(jobsState[vid]!, upd);
        emitJobsChange();
      };

      try {
        if (nextJob.mode === "transcribe") {
          await transcribeVideoCaptions(
            {
              videoId: nextJob.videoId,
              courseId: nextJob.courseId,
              title: nextJob.videoTitle,
              youtubeId: nextJob.youtubeId,
            },
            nextJob.targetLanguage,
            pushProgress,
            controller.signal,
          );
        } else if (nextJob.mode === "dub") {
          await dubVideoAudio(
            {
              videoId: nextJob.videoId,
              courseId: nextJob.courseId,
              title: nextJob.videoTitle,
              youtubeId: nextJob.youtubeId,
            },
            {
              targetLanguage: nextJob.targetLanguage,
              sourceLanguage: nextJob.sourceLanguage,
              sourceTrackId: nextJob.sourceTrackId,
              engine: nextJob.dubEngine,
              voiceGender: nextJob.dubVoiceGender,
              bgMode: nextJob.dubBgMode,
            },
            pushProgress,
            controller.signal,
          );
        } else {
          await translateVideoSubtitles(
            {
              videoId: nextJob.videoId,
              courseId: nextJob.courseId,
              title: nextJob.videoTitle,
              youtubeId: nextJob.youtubeId,
            },
            {
              targetLanguage: nextJob.targetLanguage,
              sourceLanguage: nextJob.sourceLanguage,
              sourceTrackId: nextJob.sourceTrackId,
              ensureSourceFirst: true,
            },
            pushProgress,
            controller.signal,
          );
        }

        delete jobsState[vid];
        jobAbortControllers.delete(vid);
        emitJobsChange();
        toast.success(
          nextJob.mode === "dub"
            ? `${getLanguageLabel(nextJob.targetLanguage)} · Dub ready`
            : `${getLanguageLabel(nextJob.targetLanguage)} · AI subtitles ready`,
        );
      } catch (err) {
        jobAbortControllers.delete(vid);
        if (controller.signal.aborted || !jobsState[vid]) {
          delete jobsState[vid];
          emitJobsChange();
          continue;
        }
        delete jobsState[vid];
        emitJobsChange();
        console.error(`[TranscriptQueue] Job failed for ${vid}:`, err);
        toast.error(
          err instanceof Error
            ? err.message
            : nextJob.mode === "dub"
              ? "Voice dubbing failed"
              : "Subtitle generation failed",
        );
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}
