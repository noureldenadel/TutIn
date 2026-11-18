// Web Worker for in-browser Whisper transcription (@huggingface/transformers v3 with WebGPU / WASM)
// Used as the automatic zero-setup fallback when the local Python faster-whisper server is not running.

// @ts-expect-error CDN dynamic module import inside Web Worker
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
  static instance: unknown = null;
  static currentModel: string | null = null;
  static currentDevice: string | null = null;

  static async getInstance(
    progress_callback?: (info: Record<string, unknown>) => void,
    devicePreference = "auto",
    modelName = "Xenova/whisper-base.en",
  ) {
    let targetDevice = "wasm";
    if (devicePreference === "gpu") {
      targetDevice = "webgpu";
    } else if (devicePreference === "auto") {
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        targetDevice = "webgpu";
      }
    }

    if (
      this.instance === null ||
      this.currentDevice !== targetDevice ||
      this.currentModel !== modelName
    ) {
      this.currentDevice = targetDevice;
      this.currentModel = modelName;

      const options: Record<string, unknown> = {
        progress_callback,
        device: targetDevice,
      };

      if (targetDevice === "webgpu") {
        options["dtype"] = {
          encoder_model: "fp32",
          decoder_model_merged: "q4",
        };
      } else {
        options[" quantized"] = true;
      }

      try {
        this.instance = await pipeline("automatic-speech-recognition", modelName, options);
      } catch (err) {
        if (targetDevice === "webgpu") {
          this.currentDevice = "wasm";
          this.instance = await pipeline("automatic-speech-recognition", modelName, {
            progress_callback,
            device: "wasm",
          });
        } else {
          throw err;
        }
      }
    }
    return this.instance as (
      audio: Float32Array,
      opts: Record<string, unknown>,
    ) => Promise<{
      text?: string;
      chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
    }>;
  }
}

self.addEventListener("message", async (event: MessageEvent) => {
  const {
    type,
    audio,
    id,
    device = "auto",
    language = "en",
    model = "whisper-base",
  } = event.data || {};

  if (type !== "transcribe") return;

  try {
    const cleanLang = String(language || "en")
      .toLowerCase()
      .trim();
    const isEnglish = cleanLang === "en" || cleanLang === "english";

    let baseModelId = "Xenova/whisper-base";
    if (model === "whisper-small") {
      baseModelId = "Xenova/whisper-small";
    }
    const modelName = isEnglish ? `${baseModelId}.en` : baseModelId;

    const transcriber = await PipelineSingleton.getInstance(
      (data) => {
        self.postMessage({
          type: "progress",
          id,
          data: {
            status: data["status"],
            file: data["file"],
            progress: data["progress"],
            loaded: data["loaded"],
            total: data["total"],
          },
        });
      },
      device,
      modelName,
    );

    self.postMessage({
      type: "status",
      id,
      status: "transcribing",
      message: `Transcribing audio (${PipelineSingleton.currentDevice?.toUpperCase() || "WASM"})…`,
    });

    const transcribeOpts: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    };

    if (!isEnglish) {
      transcribeOpts["language"] = cleanLang;
      transcribeOpts["task"] = "transcribe";
    }

    const output = await transcriber(audio as Float32Array, transcribeOpts);

    self.postMessage({
      type: "complete",
      id,
      result: output,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : "Transcription worker failed",
    });
  }
});
