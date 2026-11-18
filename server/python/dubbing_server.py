import os
import sys
import io
import re
import gc
import time
import uuid
import shutil
import asyncio
import tempfile
import threading
import traceback
import subprocess
import importlib
from typing import List, Optional, Dict, Any

# Auto-agree to Coqui Terms of Service for non-interactive server mode
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
if sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# Ensure static FFmpeg from imageio_ffmpeg is in PATH if available
try:
    imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if ffmpeg_exe and os.path.exists(ffmpeg_exe):
        ffmpeg_dir = os.path.dirname(ffmpeg_exe)
        if ffmpeg_dir not in os.environ["PATH"]:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
except Exception:
    pass

# Canonical AppData model paths
DEFAULT_MODELS_DIR = os.environ.get("TUTIN_MODELS_DIR") or os.path.join(
    os.environ.get("APPDATA") or os.path.expanduser("~"), "TutIn", "models"
)
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = os.path.join(DEFAULT_MODELS_DIR, "huggingface")
if "TTS_HOME" not in os.environ:
    # Coqui TTS appends /tts automatically to TTS_HOME -> <DEFAULT_MODELS_DIR>/tts
    os.environ["TTS_HOME"] = DEFAULT_MODELS_DIR
if "TORCH_HOME" not in os.environ:
    os.environ["TORCH_HOME"] = os.path.join(DEFAULT_MODELS_DIR, "demucs")

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydub import AudioSegment
import numpy as np
import torch

# Allowlist Coqui XTTS config classes for PyTorch 2.6+ torch.load
try:
    _orig_torch_load = torch.load
    def _safe_torch_load(*args, **kwargs):
        if "weights_only" not in kwargs:
            kwargs["weights_only"] = False
        return _orig_torch_load(*args, **kwargs)
    torch.load = _safe_torch_load
except Exception:
    pass

try:
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import XttsAudioConfig, XttsArgs
    if hasattr(torch.serialization, "add_safe_globals"):
        torch.serialization.add_safe_globals([XttsConfig, XttsAudioConfig, XttsArgs])
except Exception:
    pass

# Patch torchaudio.load to use soundfile (avoids torchcodec FFmpeg DLL issues on Windows)
try:
    import torchaudio
    import soundfile as sf

    def _soundfile_load(filepath, frame_offset=0, num_frames=-1, normalize=True, channels_first=True, format=None, backend=None):
        filepath = str(filepath)
        data, sample_rate = sf.read(filepath, dtype="float32", always_2d=True)
        if frame_offset > 0:
            data = data[frame_offset:]
        if num_frames > 0:
            data = data[:num_frames]
        waveform = torch.from_numpy(data)
        if channels_first:
            waveform = waveform.T
        return waveform, sample_rate

    torchaudio.load = _soundfile_load
except Exception as _patch_err:
    print(f"[TutIn AI] Warning: Could not patch torchaudio.load: {_patch_err}")

app = FastAPI(title="TutIn AI & Dubbing Service", version="7.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Global State & Idle VRAM Reaper
# ==========================================
TTS_MODEL = None
TTS_DEVICE = None
DEVICE_PREFERENCE = "auto"
IDLE_UNLOAD_ENABLED = True
IDLE_UNLOAD_SECONDS = 300  # 5 minutes
_idle_timer = None
_idle_lock = threading.Lock()
_job_lock = threading.Lock()
JOBS: Dict[str, dict] = {}


def cancel_idle_model_unload():
    global _idle_timer
    with _idle_lock:
        if _idle_timer is not None:
            _idle_timer.cancel()
            _idle_timer = None


def schedule_idle_model_unload(immediate: bool = False):
    global _idle_timer
    if not IDLE_UNLOAD_ENABLED and not immediate:
        return
    if immediate:
        auto_unload_model()
        return
    with _idle_lock:
        if _idle_timer is not None:
            _idle_timer.cancel()
        _idle_timer = threading.Timer(IDLE_UNLOAD_SECONDS, auto_unload_model)
        _idle_timer.daemon = True
        _idle_timer.start()


def auto_unload_model():
    global TTS_MODEL, TTS_DEVICE
    with _idle_lock:
        if TTS_MODEL is not None:
            print("[TutIn Dubbing] Releasing XTTS model from memory...")
            try:
                del TTS_MODEL
            except Exception:
                pass
            TTS_MODEL = None
            TTS_DEVICE = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("[TutIn Dubbing] XTTS model unloaded and VRAM freed.")


# ==========================================
# Voice Catalogs (Neural Edge-TTS & XTTS-v2)
# ==========================================

EDGE_NEURAL_VOICES: Dict[str, Dict[str, str]] = {
    "en": {"male": "en-US-AndrewMultilingualNeural", "female": "en-US-AvaMultilingualNeural"},
    "ar": {"male": "ar-SA-HamedNeural", "female": "ar-SA-ZariyahNeural"},
    "ar-eg": {"male": "ar-EG-ShakirNeural", "female": "ar-EG-SalmaNeural"},
    "ar-sa": {"male": "ar-SA-HamedNeural", "female": "ar-SA-ZariyahNeural"},
    "es": {"male": "es-ES-AlvaroNeural", "female": "es-ES-ElviraNeural"},
    "fr": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
    "de": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
    "pt": {"male": "pt-BR-AntonioNeural", "female": "pt-BR-FranciscaNeural"},
    "pt-br": {"male": "pt-BR-AntonioNeural", "female": "pt-BR-FranciscaNeural"},
    "it": {"male": "it-IT-DiegoNeural", "female": "it-IT-ElsaNeural"},
    "ja": {"male": "ja-JP-KeitaNeural", "female": "ja-JP-NanamiNeural"},
    "zh": {"male": "zh-CN-YunxiNeural", "female": "zh-CN-XiaoxiaoNeural"},
    "zh-cn": {"male": "zh-CN-YunxiNeural", "female": "zh-CN-XiaoxiaoNeural"},
    "zh-tw": {"male": "zh-TW-YunJheNeural", "female": "zh-TW-HsiaoChenNeural"},
    "ko": {"male": "ko-KR-InJoonNeural", "female": "ko-KR-SunHiNeural"},
    "ru": {"male": "ru-RU-DmitryNeural", "female": "ru-RU-SvetlanaNeural"},
    "hi": {"male": "hi-IN-MadhurNeural", "female": "hi-IN-SwaraNeural"},
    "tr": {"male": "tr-TR-AhmetNeural", "female": "tr-TR-EmelNeural"},
    "nl": {"male": "nl-NL-MaartenNeural", "female": "nl-NL-ColetteNeural"},
    "pl": {"male": "pl-PL-MarekNeural", "female": "pl-PL-ZofiaNeural"},
    "id": {"male": "id-ID-ArdiNeural", "female": "id-ID-GadisNeural"},
    "vi": {"male": "vi-VN-NamMinhNeural", "female": "vi-VN-HoaiMyNeural"},
    "th": {"male": "th-TH-NiwatNeural", "female": "th-TH-PremwadeeNeural"},
    "sv": {"male": "sv-SE-MattiasNeural", "female": "sv-SE-SofieNeural"},
    "da": {"male": "da-DK-JeppeNeural", "female": "da-DK-ChristelNeural"},
    "no": {"male": "nb-NO-FinnNeural", "female": "nb-NO-PernilleNeural"},
    "fi": {"male": "fi-FI-HarriNeural", "female": "fi-FI-NooraNeural"},
    "cs": {"male": "cs-CZ-AntoninNeural", "female": "cs-CZ-VlastaNeural"},
    "hu": {"male": "hu-HU-TamasNeural", "female": "hu-HU-NoemiNeural"},
    "uk": {"male": "uk-UA-OstapNeural", "female": "uk-UA-PolinaNeural"},
    "el": {"male": "el-GR-NestorasNeural", "female": "el-GR-AthinaNeural"},
    "he": {"male": "he-IL-AvriNeural", "female": "he-IL-HilaNeural"},
    "ro": {"male": "ro-RO-EmilNeural", "female": "ro-RO-AlinaNeural"},
}

XTTS_SUPPORTED_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr",
    "ru", "nl", "cs", "ar", "zh-cn", "hu", "ko", "ja", "hi"
}


def resolve_edge_voice(target_lang: str, gender: str = "male") -> str:
    lang_key = (target_lang or "en").lower().strip()
    g_key = "female" if (gender or "male").lower().strip() == "female" else "male"
    entry = EDGE_NEURAL_VOICES.get(lang_key) or EDGE_NEURAL_VOICES.get(lang_key.split("-")[0]) or EDGE_NEURAL_VOICES["en"]
    return entry.get(g_key, entry["male"])


def map_xtts_lang(lang: str) -> str:
    l = (lang or "en").lower().strip()
    if l in ("zh", "zh-cn", "zh-tw"):
        return "zh-cn"
    if l in ("ar", "ar-eg", "ar-sa"):
        return "ar"
    if l in ("pt", "pt-br"):
        return "pt"
    return l.split("-")[0]


# ==========================================
# Request Models
# ==========================================

class SegmentInput(BaseModel):
    start: Optional[float] = None
    end: Optional[float] = None
    timestamp: Optional[List[float]] = None
    text: str

    def get_start(self) -> float:
        if self.start is not None:
            return float(self.start)
        if self.timestamp and len(self.timestamp) >= 1:
            return float(self.timestamp[0])
        return 0.0

    def get_end(self) -> float:
        if self.end is not None:
            return float(self.end)
        if self.timestamp and len(self.timestamp) >= 2:
            return float(self.timestamp[1])
        return self.get_start() + 2.0


class DubRequest(BaseModel):
    videoPath: Optional[str] = None
    video_path: Optional[str] = None
    segments: Optional[List[SegmentInput]] = None
    chunks: Optional[List[SegmentInput]] = None
    targetLang: Optional[str] = None
    target_lang: Optional[str] = None
    engine: Optional[str] = "neural"  # "neural" (Fast Edge-TTS) | "clone" (XTTS-v2)
    voiceGender: Optional[str] = "male"  # "male" | "female"
    bgMode: Optional[str] = "ducking"  # "ducking" (Pure voice + Live player ducking) | "demucs" (Separate music stems)
    preserveBackgroundAudio: Optional[bool] = False
    voiceReferencePath: Optional[str] = None
    voiceProfileDir: Optional[str] = None
    device: Optional[str] = None
    unloadIdleModel: Optional[bool] = True

    def resolved_video_path(self) -> Optional[str]:
        return self.videoPath or self.video_path

    def resolved_target_lang(self) -> str:
        return (self.targetLang or self.target_lang or "en").lower().strip()

    def resolved_segments(self) -> List[SegmentInput]:
        return self.segments or self.chunks or []

    def resolved_engine(self) -> str:
        e = (self.engine or "neural").lower().strip()
        return "clone" if e == "clone" else "neural"

    def resolved_bg_mode(self) -> str:
        if self.bgMode and self.bgMode.lower().strip() in ("demucs", "separate"):
            return "demucs"
        if self.preserveBackgroundAudio:
            return "demucs"
        return "ducking"


# ==========================================
# FFmpeg & Hardware Utilities
# ==========================================

def get_ffmpeg_bin() -> str:
    try:
        imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            return ffmpeg_exe
    except Exception:
        pass
    return "ffmpeg"


try:
    _ffmpeg_path = get_ffmpeg_bin()
    AudioSegment.converter = _ffmpeg_path
    AudioSegment.ffmpeg = _ffmpeg_path
except Exception:
    pass


def check_ffmpeg() -> bool:
    ffmpeg_bin = get_ffmpeg_bin()
    try:
        res = subprocess.run([ffmpeg_bin, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False


def get_device(preference: str = None) -> str:
    pref = (preference or DEVICE_PREFERENCE or "auto").lower().strip()
    if pref == "cpu":
        return "cpu"
    if pref in ("gpu", "cuda"):
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_gpu_info() -> dict:
    info = {
        "cuda_available": torch.cuda.is_available(),
        "mps_available": hasattr(torch.backends, "mps") and torch.backends.mps.is_available(),
        "gpu_available": False,
        "gpu_name": None,
        "gpu_memory_total_mb": None,
        "gpu_memory_free_mb": None,
        "current_device": TTS_DEVICE or get_device(),
        "device_preference": DEVICE_PREFERENCE,
    }
    if torch.cuda.is_available():
        info["gpu_available"] = True
        try:
            info["gpu_name"] = torch.cuda.get_device_name(0)
            mem = torch.cuda.get_device_properties(0).total_memory
            info["gpu_memory_total_mb"] = round(mem / (1024 * 1024))
            free_mem = torch.cuda.mem_get_info(0)[0]
            info["gpu_memory_free_mb"] = round(free_mem / (1024 * 1024))
        except Exception:
            pass
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        info["gpu_available"] = True
        info["gpu_name"] = "Apple Silicon (MPS)"
    return info


def load_xtts_model(device_preference: str = None):
    global TTS_MODEL, TTS_DEVICE
    cancel_idle_model_unload()
    target_device = get_device(device_preference)

    if TTS_MODEL is not None:
        if TTS_DEVICE == target_device:
            return TTS_MODEL
        try:
            TTS_MODEL = TTS_MODEL.to(target_device)
            TTS_DEVICE = target_device
            if target_device == "cpu" and torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
        except Exception as e:
            print(f"[TutIn Dubbing] Warning moving XTTS to {target_device}: {e}")
        return TTS_MODEL

    from TTS.api import TTS
    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    print(f"[TutIn Dubbing] Loading XTTS-v2 on {target_device.upper()}...")
    TTS_MODEL = TTS(model_name).to(target_device)
    TTS_DEVICE = target_device
    print(f"[TutIn Dubbing] XTTS-v2 ready on {target_device.upper()}.")
    return TTS_MODEL


# ==========================================
# Audio Trimming, Tempo & Reference Helpers
# ==========================================

def strip_leading_trailing_silence(seg: AudioSegment, silence_thresh_dbfs: float = -42.0, pad_ms: int = 18) -> AudioSegment:
    """
    Strips synthetic leading/trailing dead air added by neural TTS engines (e.g. edge-tts adds ~120ms each side)
    while retaining a natural 18ms breath pad so consonants are never clipped.
    """
    if len(seg) <= 160:
        return seg
    try:
        from pydub.silence import detect_nonsilent
        nonsilent = detect_nonsilent(seg, min_silence_len=25, silence_thresh=silence_thresh_dbfs)
        if not nonsilent:
            return seg
        start_trim = max(0, nonsilent[0][0] - pad_ms)
        end_trim = min(len(seg), nonsilent[-1][1] + pad_ms)
        if end_trim - start_trim >= 120:
            return seg[start_trim:end_trim]
    except Exception:
        pass
    return seg


def trim_internal_silence(audio_segment: AudioSegment, max_reduction_ms: int = 350) -> AudioSegment:
    """
    Shortens internal pauses (>140ms) inside a multi-clause segment before touching voiced phonemes.
    """
    if len(audio_segment) < 600 or max_reduction_ms <= 30:
        return audio_segment
    try:
        from pydub.silence import detect_silence
        silences = detect_silence(audio_segment, min_silence_len=135, silence_thresh=-38)
        if not silences:
            return audio_segment
        internal = [s for s in silences if s[0] > 90 and s[1] < (len(audio_segment) - 90)]
        if not internal:
            return audio_segment

        shave_per_silence = max_reduction_ms // len(internal)
        if shave_per_silence < 25:
            return audio_segment

        slices = []
        last_pos = 0
        total_trimmed = 0
        for start_s, end_s in internal:
            silence_dur = end_s - start_s
            if silence_dur > 105 and total_trimmed < max_reduction_ms:
                trim_amt = min(silence_dur - 65, shave_per_silence, max_reduction_ms - total_trimmed)
                if trim_amt > 20:
                    slices.append(audio_segment[last_pos:start_s + (silence_dur - trim_amt)])
                    last_pos = end_s
                    total_trimmed += trim_amt
        if slices:
            slices.append(audio_segment[last_pos:])
            result = slices[0]
            for sl in slices[1:]:
                result += sl
            return result
    except Exception:
        pass
    return audio_segment


def apply_tempo_filter_bytes(input_wav_bytes: bytes, speed_factor: float) -> bytes:
    """
    In-memory time-compression using FFmpeg rubberband (crisp transients) with atempo fallback.
    Clamped to [0.85, 1.32] to preserve natural human vocal formants.
    """
    factor = max(0.85, min(speed_factor, 1.32))
    ffmpeg_bin = get_ffmpeg_bin()
    cmd_rb = [
        ffmpeg_bin, "-y",
        "-f", "wav", "-i", "pipe:0",
        "-filter:a", f"rubberband=tempo={factor:.4f}:transients=crisp:detector=compound",
        "-f", "wav", "pipe:1"
    ]
    try:
        proc = subprocess.run(cmd_rb, input=input_wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return proc.stdout
    except Exception:
        cmd_at = [
            ffmpeg_bin, "-y",
            "-f", "wav", "-i", "pipe:0",
            "-filter:a", f"atempo={factor:.4f}",
            "-f", "wav", "pipe:1"
        ]
        proc = subprocess.run(cmd_at, input=input_wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return proc.stdout


def extract_or_load_course_voice_profile(
    video_path: Optional[str],
    temp_dir: str,
    xtts_model: Any,
    voice_profile_dir: Optional[str] = None,
    explicit_ref_path: Optional[str] = None,
    segments: Optional[List[SegmentInput]] = None,
    vocals_stem_path: Optional[str] = None,
):
    """
    Course-level voice profile cache for Clone Instructor mode:
    1. If `voice_profile_dir` already has `instructor_latents.pt` (and no explicit override was passed),
       loads `(gpt_cond_latent, speaker_embedding)` in <20ms for 100% consistent timbre across all course lessons.
    2. Otherwise extracts the highest-SNR 24kHz reference clip (with only an 80Hz highpass—no 8kHz lowpass muffler),
       computes the conditioning latents, and persists them to `voice_profile_dir`.
    """
    cached_latents_path = os.path.join(voice_profile_dir, "instructor_latents.pt") if voice_profile_dir else None
    cached_ref_wav = os.path.join(voice_profile_dir, "instructor_ref.wav") if voice_profile_dir else None

    if not explicit_ref_path and cached_latents_path and os.path.exists(cached_latents_path):
        try:
            saved = torch.load(cached_latents_path, map_location=TTS_DEVICE or "cpu")
            gpt_cond = saved.get("gpt_cond_latent")
            spk_emb = saved.get("speaker_embedding")
            if gpt_cond is not None and spk_emb is not None:
                if TTS_DEVICE:
                    gpt_cond = gpt_cond.to(TTS_DEVICE)
                    spk_emb = spk_emb.to(TTS_DEVICE)
                print(f"[TutIn Dubbing] Loaded cached course voice profile from {cached_latents_path}")
                return gpt_cond, spk_emb, cached_ref_wav
        except Exception as e:
            print(f"[TutIn Dubbing] Cached voice profile reload warning: {e}")

    source_media = explicit_ref_path if (explicit_ref_path and os.path.exists(explicit_ref_path)) else (
        vocals_stem_path if (vocals_stem_path and os.path.exists(vocals_stem_path)) else video_path
    )
    if not source_media or not os.path.exists(source_media):
        raise Exception("Local video or audio reference file required for voice cloning.")

    ffmpeg_bin = get_ffmpeg_bin()
    candidate_starts = []
    if segments:
        valid_segs = [
            s for s in segments
            if (s.get_end() - s.get_start()) >= 2.2 and len(s.text.strip().split()) >= 4
        ]
        if valid_segs:
            n = len(valid_segs)
            for frac in (0.18, 0.40, 0.62, 0.78):
                cand = valid_segs[min(int(n * frac), n - 1)]
                candidate_starts.append(max(0.0, cand.get_start()))

    if not candidate_starts:
        candidate_starts = [15.0, 30.0, 5.0, 0.0]
    candidate_starts = list(dict.fromkeys(candidate_starts))

    scored_candidates = []
    for idx, c_start in enumerate(candidate_starts):
        cand_path = os.path.join(temp_dir, f"cand_ref_{idx}.wav")
        # Full 24kHz vocal clarity: only remove sub-80Hz rumble; never apply an 8kHz lowpass filter
        cmd = [
            ffmpeg_bin, "-y",
            "-ss", str(c_start),
            "-i", source_media,
            "-t", "9",
            "-vn",
            "-af", "highpass=f=80",
            "-acodec", "pcm_s16le",
            "-ar", "24000",
            "-ac", "1",
            cand_path
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(cand_path) and os.path.getsize(cand_path) > 5000:
                audio_slice = AudioSegment.from_wav(cand_path)
                dbfs = audio_slice.dBFS
                if -40.0 <= dbfs <= -2.5 and len(audio_slice) >= 2000:
                    score = -abs(dbfs - (-19.0))
                    try:
                        from pydub.silence import detect_silence
                        silences = detect_silence(audio_slice, min_silence_len=240, silence_thresh=-38)
                        silent_ms = sum((e - s) for s, e in silences)
                        active_ratio = max(0.0, 1.0 - (silent_ms / max(1, len(audio_slice))))
                        score += active_ratio * 9.0
                    except Exception:
                        pass
                    scored_candidates.append((score, cand_path))
        except Exception:
            continue

    ref_files = []
    if scored_candidates:
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        ref_files = [p for _, p in scored_candidates[:2]]
    else:
        fallback_ref = os.path.join(temp_dir, "fallback_ref.wav")
        for fb_start in ("10.0", "0.0"):
            cmd = [
                ffmpeg_bin, "-y", "-ss", fb_start, "-i", source_media,
                "-t", "9", "-vn", "-af", "highpass=f=80",
                "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", fallback_ref
            ]
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.exists(fallback_ref) and os.path.getsize(fallback_ref) > 2000:
                    ref_files = [fallback_ref]
                    break
            except Exception:
                continue

    if not ref_files:
        raise Exception("Could not extract a valid voice reference sample from video audio.")

    primary_ref = ref_files[0]
    if voice_profile_dir:
        os.makedirs(voice_profile_dir, exist_ok=True)
        if cached_ref_wav:
            try:
                shutil.copyfile(primary_ref, cached_ref_wav)
            except Exception:
                pass

    gpt_cond_latent, speaker_embedding = None, None
    if xtts_model is not None:
        gpt_cond_latent, speaker_embedding = xtts_model.get_conditioning_latents(
            audio_path=ref_files,
            sound_norm_refs=True
        )
        if cached_latents_path and not explicit_ref_path:
            try:
                torch.save(
                    {
                        "gpt_cond_latent": gpt_cond_latent.detach().cpu(),
                        "speaker_embedding": speaker_embedding.detach().cpu(),
                    },
                    cached_latents_path,
                )
                print(f"[TutIn Dubbing] Saved course voice profile -> {cached_latents_path}")
            except Exception as save_err:
                print(f"[TutIn Dubbing] Voice profile save warning: {save_err}")

    return gpt_cond_latent, speaker_embedding, primary_ref


def extract_full_audio(video_path: str, temp_dir: str) -> str:
    ffmpeg_bin = get_ffmpeg_bin()
    audio_out = os.path.join(temp_dir, "original_audio.wav")
    cmd = [
        ffmpeg_bin, "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        audio_out
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return audio_out


def separate_stems_demucs(audio_path: str, temp_dir: str, device: str = "auto") -> tuple:
    demucs_out = os.path.join(temp_dir, "demucs")
    os.makedirs(demucs_out, exist_ok=True)
    dev = "cuda" if (device in ("cuda", "gpu", "auto") and torch.cuda.is_available()) else "cpu"
    cmd = [
        sys.executable, "-m", "demucs",
        "--two-stems=vocals",
        "-n", "htdemucs",
        "-d", dev,
        "-o", demucs_out,
        audio_path
    ]
    print(f"[TutIn Dubbing] Running Demucs stem separation on {dev.upper()}...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    base_name = os.path.splitext(os.path.basename(audio_path))[0]
    stem_dir = os.path.join(demucs_out, "htdemucs", base_name)
    vocals_wav = os.path.join(stem_dir, "vocals.wav")
    no_vocals_wav = os.path.join(stem_dir, "no_vocals.wav")
    if not os.path.exists(vocals_wav) or not os.path.exists(no_vocals_wav):
        raise Exception("Demucs did not produce expected vocals/no_vocals stems.")
    return vocals_wav, no_vocals_wav


def mix_dub_with_background(dialogue_wav: str, background_wav: str, output_path: str):
    """
    Clean broadcast sidechain ducking without artificial looped room-tone hum.
    Dips the separated music/SFX stem smoothly when dialogue is active.
    """
    ffmpeg_bin = get_ffmpeg_bin()
    filter_complex = (
        "[0:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[bg_raw];"
        "[1:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,apad[dlg_pad];"
        "[bg_raw][dlg_pad]sidechaincompress=threshold=0.03:ratio=6:attack=60:release=320[bg_ducked];"
        "[bg_ducked][dlg_pad]amix=inputs=2:duration=first:weights=0.78 1.0:dropout_transition=2:normalize=0[out]"
    )
    cmd = [
        ffmpeg_bin, "-y",
        "-i", background_wav,
        "-i", dialogue_wav,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-ac", "2",
        "-b:a", "192k",
        output_path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def sanitize_dub_text(text: str) -> str:
    if not text:
        return ""
    t = re.sub(r"<[^>]+>", "", text)
    t = re.sub(r"[♪♫#]+", "", t)
    t = re.sub(r"\[[^\]]*\]", "", t)
    t = re.sub(r"\([^)]*(?:music|applause|laughter|silence|noise|audio)[^)]*\)", "", t, flags=re.IGNORECASE)
    # Strip Arabic diacritics / tashkeel
    t = re.sub(r"[\u0617-\u061A\u064B-\u065F\u0670]", "", t)
    t = re.sub(r"([.?!؟,،;:])\1+", r"\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def estimate_speech_duration_sec(text: str, target_lang: str) -> float:
    clean = re.sub(r'[\s.,?!؟،;:—\-"()\[\]\']+', "", text)
    char_count = max(1, len(clean))
    word_count = max(1, len(text.split()))
    l = target_lang.lower()
    if l.startswith(("zh", "ja", "ko")):
        return char_count / 4.3
    if l.startswith("ar"):
        return max(word_count / 2.15, char_count / 12.0)
    return max(word_count / 2.65, char_count / 14.5)


# ==========================================
# Concurrent Edge Neural TTS Synthesis
# ==========================================

async def _synthesize_edge_batch_async(
    tasks_spec: List[Dict[str, Any]],
    voice_id: str,
    temp_dir: str,
    job: dict,
    base_prog: int,
    avail_prog: int,
) -> Dict[int, AudioSegment]:
    import edge_tts
    sem = asyncio.Semaphore(6)
    results: Dict[int, AudioSegment] = {}
    total = max(1, len(tasks_spec))
    completed = 0

    async def _worker(item: Dict[str, Any]):
        nonlocal completed
        if job.get("status") == "cancelled":
            return
        idx = item["index"]
        text = item["text"]
        rate_pct = item["rate_pct"]
        rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
        out_mp3 = os.path.join(temp_dir, f"edge_seg_{idx}.mp3")

        async with sem:
            if job.get("status") == "cancelled":
                return
            last_err = None
            for attempt in range(2):
                try:
                    comm = edge_tts.Communicate(text=text, voice=voice_id, rate=rate_str)
                    await comm.save(out_mp3)
                    if os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 100:
                        seg_audio = AudioSegment.from_file(out_mp3).set_frame_rate(24000).set_channels(1)
                        results[idx] = strip_leading_trailing_silence(seg_audio)
                        break
                except Exception as e:
                    last_err = e
                    await asyncio.sleep(0.25 * (attempt + 1))
            else:
                print(f"[TutIn Dubbing] Edge-TTS segment {idx + 1} warning: {last_err}")

            completed += 1
            job["step"] = f"Synthesizing neural voice ({completed}/{total})…"
            job["progress"] = base_prog + int((completed / total) * avail_prog)

    await asyncio.gather(*[_worker(item) for item in tasks_spec])
    return results


# ==========================================
# Core Dubbing Job Orchestrator
# ==========================================

def process_dubbing_job(job_id: str, req: DubRequest):
    global JOBS
    job = JOBS.get(job_id)
    if not job or job.get("status") == "cancelled":
        return

    with _job_lock:
        if job.get("status") == "cancelled":
            return
        job["status"] = "running"

        temp_dir = tempfile.mkdtemp(prefix="tutin_dub_")
        job["temp_dir"] = temp_dir
        output_path = os.path.join(temp_dir, "final_dub.mp3")

        try:
            if not check_ffmpeg():
                raise Exception("FFmpeg is not installed or not found.")

            segments = req.resolved_segments()
            if not segments:
                raise Exception("No subtitle segments provided for dubbing.")

            target_lang = req.resolved_target_lang()
            engine = req.resolved_engine()
            bg_mode = req.resolved_bg_mode()
            voice_gender = (req.voiceGender or "male").lower().strip()
            video_path = req.resolved_video_path()
            device_pref = req.device or DEVICE_PREFERENCE

            if engine == "clone":
                xtts_lang = map_xtts_lang(target_lang)
                if xtts_lang not in XTTS_SUPPORTED_LANGS:
                    raise Exception(
                        f"Language '{target_lang}' is not supported by local voice cloning. Use Neural Voice instead."
                    )

            t_job_start = time.time()
            no_vocals_stem_path = None
            vocals_stem_path = None

            # 1. Optional Demucs Stem Separation
            if bg_mode == "demucs":
                if not video_path or not os.path.exists(video_path):
                    raise Exception("Local video file required for background music separation.")
                job["step"] = "Separating background music & vocals (Demucs)…"
                job["progress"] = 8
                orig_audio_path = extract_full_audio(video_path, temp_dir)
                vocals_stem_path, no_vocals_stem_path = separate_stems_demucs(orig_audio_path, temp_dir, device_pref)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()

            # 2. Prepare Segments & Elastic Pause Budgets
            total_segments = len(segments)
            prepared_items = []
            for i, seg in enumerate(segments):
                text = sanitize_dub_text(seg.text)
                if not text:
                    continue
                start_sec = max(0.0, seg.get_start())
                end_sec = max(start_sec + 0.25, seg.get_end())
                if i < total_segments - 1:
                    next_start = max(start_sec + 0.15, segments[i + 1].get_start())
                    eff_end = min(end_sec, next_start) if next_start > start_sec else end_sec
                    gap_to_next = max(0.0, next_start - eff_end)
                    absorbed_gap = min(gap_to_next * 0.85, 1.40)
                else:
                    eff_end = end_sec
                    gap_to_next = 2.0
                    absorbed_gap = 0.80

                nominal_win = max(0.35, eff_end - start_sec)
                budget_win = nominal_win + absorbed_gap
                est_sec = estimate_speech_duration_sec(text, target_lang)

                rate_pct = 0
                if est_sec > budget_win * 1.04:
                    needed_ratio = min(1.22, est_sec / budget_win)
                    rate_pct = int(round((needed_ratio - 1.0) * 100))

                prepared_items.append({
                    "index": i,
                    "start_sec": start_sec,
                    "eff_end_sec": eff_end,
                    "gap_to_next": gap_to_next,
                    "absorbed_gap": absorbed_gap,
                    "nominal_win": nominal_win,
                    "budget_win": budget_win,
                    "text": text,
                    "rate_pct": rate_pct,
                })

            if not prepared_items:
                raise Exception("No speakable text found in subtitle segments.")

            base_progress = 20 if bg_mode == "demucs" else 10
            avail_progress = 68 if bg_mode == "demucs" else 78
            synthesized_clips: Dict[int, AudioSegment] = {}

            # 3A. Fast Neural Voice Engine (Edge-TTS)
            if engine == "neural":
                voice_id = resolve_edge_voice(target_lang, voice_gender)
                job["step"] = f"Synthesizing neural voice ({voice_id})…"
                job["progress"] = base_progress
                synthesized_clips = asyncio.run(
                    _synthesize_edge_batch_async(
                        prepared_items,
                        voice_id,
                        temp_dir,
                        job,
                        base_progress,
                        avail_progress,
                    )
                )

            # 3B. Zero-Shot Voice Cloning Engine (XTTS-v2 with Course Voice Profile Cache)
            else:
                xtts_lang = map_xtts_lang(target_lang)
                job["step"] = "Loading voice cloning model…"
                job["progress"] = base_progress
                load_xtts_model(device_pref)

                xtts_model = getattr(getattr(TTS_MODEL, "synthesizer", None), "tts_model", None)
                job["step"] = "Loading instructor voice profile…"
                job["progress"] = base_progress + 6
                gpt_cond_latent, speaker_embedding, primary_ref_path = extract_or_load_course_voice_profile(
                    video_path=video_path,
                    temp_dir=temp_dir,
                    xtts_model=xtts_model,
                    voice_profile_dir=req.voiceProfileDir,
                    explicit_ref_path=req.voiceReferencePath,
                    segments=segments,
                    vocals_stem_path=vocals_stem_path,
                )

                torch.manual_seed(42)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(42)

                for count_idx, item in enumerate(prepared_items):
                    if job.get("status") == "cancelled":
                        raise Exception("Job cancelled by user.")

                    idx = item["index"]
                    text = re.sub(r"[,،;:—\-]+$", ".", item["text"]).strip()
                    if text and text[-1] not in (".", "!", "?", "؟", "。", "！", "？", "…"):
                        text += "."

                    speed = 1.0 + (item["rate_pct"] / 100.0)
                    job["step"] = f"Cloning voice ({count_idx + 1}/{len(prepared_items)})…"
                    job["progress"] = base_progress + 8 + int(((count_idx + 1) / len(prepared_items)) * (avail_progress - 8))

                    try:
                        if xtts_model is not None and gpt_cond_latent is not None and speaker_embedding is not None:
                            out = xtts_model.inference(
                                text=text,
                                language=xtts_lang,
                                gpt_cond_latent=gpt_cond_latent,
                                speaker_embedding=speaker_embedding,
                                speed=min(1.24, max(1.0, speed)),
                                temperature=0.60,
                                length_penalty=1.0,
                                repetition_penalty=2.5,
                                enable_text_splitting=False,
                            )
                            raw_wav = out.get("wav", None)
                            if isinstance(raw_wav, torch.Tensor):
                                raw_wav = raw_wav.detach().cpu().numpy()
                            else:
                                raw_wav = np.asarray(raw_wav, dtype=np.float32)
                        else:
                            wav_list = TTS_MODEL.tts(
                                text=text,
                                speaker_wav=primary_ref_path,
                                language=xtts_lang,
                                speed=min(1.24, max(1.0, speed)),
                            )
                            raw_wav = np.asarray(wav_list, dtype=np.float32)

                        pcm16 = (np.clip(raw_wav, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
                        seg_audio = AudioSegment(data=pcm16, sample_width=2, frame_rate=24000, channels=1)
                        synthesized_clips[idx] = strip_leading_trailing_silence(seg_audio)
                    except Exception as seg_err:
                        print(f"[TutIn Dubbing] XTTS segment {idx + 1} warning: {seg_err}")

            if not synthesized_clips:
                raise Exception("Voice synthesis produced 0 audio segments.")

            # 4. Elastic Timeline Assembly & Gentle Tempo Alignment (<= 1.28x)
            job["step"] = "Aligning timeline & mastering audio…"
            job["progress"] = 90

            SAMPLE_RATE = 24000
            last_seg_end = max([s.get_end() for s in segments], default=0.0)
            max_duration_ms = int(last_seg_end * 1000)
            total_canvas_samples = int((max_duration_ms / 1000.0 + 8.0) * SAMPLE_RATE)
            master_canvas = np.zeros(total_canvas_samples, dtype=np.float32)
            last_end_sample = 0
            min_gap_samples = int(0.035 * SAMPLE_RATE)  # 35ms clean breathing gap between utterances
            speech_intervals: List[List[float]] = []

            # Compute median clip loudness for gentle leveling (avoids per-cue +10dB volume pumping)
            valid_dbfs = [
                c.dBFS for c in synthesized_clips.values()
                if len(c) > 100 and -45.0 < c.dBFS < -1.0
            ]
            target_dbfs = float(np.median(valid_dbfs)) if valid_dbfs else -18.5
            target_dbfs = max(-21.0, min(-16.5, target_dbfs))

            for pos_idx, item in enumerate(prepared_items):
                idx = item["index"]
                clip = synthesized_clips.get(idx)
                if not clip or len(clip) < 60:
                    continue

                nominal_start_sample = int(item["start_sec"] * SAMPLE_RATE)
                earliest_allowed = (last_end_sample + min_gap_samples) if last_end_sample > 0 else 0
                start_sample = max(nominal_start_sample, earliest_allowed)
                actual_start_sec = start_sample / float(SAMPLE_RATE)

                # Look ahead: allow up to 0.40s elastic spill if downstream gap exists
                next_item = prepared_items[pos_idx + 1] if (pos_idx + 1) < len(prepared_items) else None
                elastic_bonus = 0.0
                if next_item and next_item["gap_to_next"] >= 0.45:
                    elastic_bonus = min(0.40, next_item["gap_to_next"] * 0.45)

                hard_limit_sec = (
                    next_item["start_sec"] + next_item["absorbed_gap"] * 0.35 + elastic_bonus
                    if next_item
                    else (item["eff_end_sec"] + 1.2)
                )
                avail_window_sec = max(
                    0.45,
                    min(item["budget_win"] + elastic_bonus, hard_limit_sec - actual_start_sec)
                )

                nat_dur_sec = len(clip) / 1000.0
                if nat_dur_sec > avail_window_sec * 1.03:
                    excess_ms = int((nat_dur_sec - avail_window_sec) * 1000)
                    clip = trim_internal_silence(clip, max_reduction_ms=min(420, excess_ms))
                    nat_dur_sec = len(clip) / 1000.0

                if nat_dur_sec > avail_window_sec * 1.04:
                    speed_factor = min(1.28, nat_dur_sec / avail_window_sec)
                    if speed_factor > 1.03:
                        try:
                            buf = io.BytesIO()
                            clip.export(buf, format="wav")
                            stretched = apply_tempo_filter_bytes(buf.getvalue(), speed_factor)
                            clip = AudioSegment.from_file(io.BytesIO(stretched), format="wav")
                        except Exception as t_err:
                            print(f"[TutIn Dubbing] Tempo alignment warning on segment {idx + 1}: {t_err}")

                # Gentle clamped gain leveling (max ±3.5 dB per segment to prevent loudness pumping)
                if len(clip) > 0 and clip.dBFS > -45.0:
                    gain_delta = max(-3.5, min(3.5, target_dbfs - clip.dBFS))
                    clip = clip.apply_gain(gain_delta)

                fade_ms = min(16, max(2, len(clip) // 8))
                clip = clip.fade_in(fade_ms).fade_out(fade_ms)

                seg_samples = np.array(clip.get_array_of_samples(), dtype=np.float32) / 32768.0
                end_sample = start_sample + len(seg_samples)
                if end_sample > len(master_canvas):
                    master_canvas = np.pad(master_canvas, (0, end_sample - len(master_canvas) + SAMPLE_RATE * 2))

                master_canvas[start_sample:end_sample] += seg_samples
                last_end_sample = end_sample

                actual_end_sec = end_sample / float(SAMPLE_RATE)
                # Merge contiguous or near-contiguous speech intervals (< 380ms gap) for smooth player auto-ducking
                if speech_intervals and (actual_start_sec - speech_intervals[-1][1]) <= 0.38:
                    speech_intervals[-1][1] = round(actual_end_sec, 2)
                else:
                    speech_intervals.append([round(actual_start_sec, 2), round(actual_end_sec, 2)])

            # 5. Master Export & Optional Background Mixdown
            job["step"] = "Exporting dubbed audio track…"
            job["progress"] = 95

            peak = float(np.max(np.abs(master_canvas))) if len(master_canvas) > 0 else 0.0
            if peak <= 1e-4:
                raise Exception("Synthesized audio track is silent.")
            master_canvas = (master_canvas / peak) * 0.92
            canvas_pcm16 = (np.clip(master_canvas, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
            master_audio = AudioSegment(
                data=canvas_pcm16,
                sample_width=2,
                frame_rate=SAMPLE_RATE,
                channels=1
            )

            if bg_mode == "demucs" and no_vocals_stem_path and os.path.exists(no_vocals_stem_path):
                job["step"] = "Mixing separated background music with dialogue…"
                raw_dialogue_path = os.path.join(temp_dir, "dialogue_master.wav")
                master_audio.export(raw_dialogue_path, format="wav")
                mix_dub_with_background(
                    dialogue_wav=raw_dialogue_path,
                    background_wav=no_vocals_stem_path,
                    output_path=output_path,
                )
            else:
                master_audio.export(output_path, format="mp3", bitrate="128k", parameters=["-ac", "1"])

            total_sec = round(time.time() - t_job_start, 2)
            print(
                f"[TutIn Dubbing] Completed job {job_id} in {total_sec}s "
                f"(engine={engine}, bgMode={bg_mode}, lang={target_lang}, segments={len(synthesized_clips)})"
            )

            job["status"] = "done"
            job["step"] = "Complete"
            job["progress"] = 100
            job["audio_path"] = output_path
            job["error"] = None
            job["engine"] = engine
            job["bg_mode"] = bg_mode
            job["voice_gender"] = voice_gender
            job["speech_intervals"] = speech_intervals
            job["timings"] = {"total_seconds": total_sec, "segments_synthesized": len(synthesized_clips)}

        except Exception as e:
            print("[TutIn Dubbing] Job error:", traceback.format_exc())
            if job.get("status") != "cancelled":
                job["status"] = "failed"
            job["error"] = str(e)
            job["step"] = f"Error: {str(e)}"
        finally:
            try:
                if job.get("status") == "done" and os.path.exists(output_path):
                    for entry in os.listdir(temp_dir):
                        entry_path = os.path.join(temp_dir, entry)
                        if os.path.abspath(entry_path) != os.path.abspath(output_path):
                            if os.path.isdir(entry_path):
                                shutil.rmtree(entry_path, ignore_errors=True)
                            else:
                                try:
                                    os.remove(entry_path)
                                except Exception:
                                    pass
                else:
                    shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

            if req.unloadIdleModel is not False:
                schedule_idle_model_unload()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()


# ==========================================
# API Endpoints
# ==========================================

@app.get("/health")
def health_check():
    gpu_info = get_gpu_info()
    return {
        "status": "ok",
        "ffmpeg_available": check_ffmpeg(),
        "model_loaded": TTS_MODEL is not None,
        "model_device": TTS_DEVICE,
        "device_preference": DEVICE_PREFERENCE,
        "idle_unload_enabled": IDLE_UNLOAD_ENABLED,
        **gpu_info,
    }


class DeviceRequest(BaseModel):
    device: str
    unloadIdleModel: Optional[bool] = None


@app.post("/set-device")
def set_device(req: DeviceRequest):
    global DEVICE_PREFERENCE, IDLE_UNLOAD_ENABLED
    DEVICE_PREFERENCE = req.device.lower().strip()
    if req.unloadIdleModel is not None:
        IDLE_UNLOAD_ENABLED = bool(req.unloadIdleModel)
    resolved = get_device(DEVICE_PREFERENCE)
    if TTS_MODEL is not None:
        try:
            load_xtts_model(DEVICE_PREFERENCE)
        except Exception as e:
            return {"success": False, "error": str(e), "device": TTS_DEVICE}
    return {
        "success": True,
        "preference": DEVICE_PREFERENCE,
        "resolved_device": resolved,
        **get_gpu_info(),
    }


@app.post("/unload-models")
def unload_models():
    auto_unload_model()
    return {"success": True, "model_loaded": TTS_MODEL is not None}


@app.post("/dub")
def submit_dub(req: DubRequest, background_tasks: BackgroundTasks):
    if not check_ffmpeg():
        raise HTTPException(status_code=500, detail="FFmpeg binary was not found.")

    segments = req.resolved_segments()
    if not segments:
        raise HTTPException(status_code=400, detail="No subtitle segments provided.")

    engine = req.resolved_engine()
    target_lang = req.resolved_target_lang()
    if engine == "clone" and map_xtts_lang(target_lang) not in XTTS_SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{target_lang}' is not supported by voice cloning. Use Neural Voice instead.",
        )

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "id": job_id,
        "status": "queued",
        "step": "Waiting in queue…",
        "progress": 0,
        "error": None,
        "audio_path": None,
        "total_segments": len(segments),
        "target_lang": target_lang,
        "engine": engine,
        "bg_mode": req.resolved_bg_mode(),
        "voice_gender": req.voiceGender or "male",
        "speech_intervals": [],
    }
    background_tasks.add_task(process_dubbing_job, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/status/{job_id}")
def get_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]


@app.get("/download/{job_id}")
def download_audio(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    job = JOBS[job_id]
    if job["status"] != "done" or not job["audio_path"] or not os.path.exists(job["audio_path"]):
        raise HTTPException(status_code=400, detail="Audio file is not ready")
    return FileResponse(job["audio_path"], media_type="audio/mpeg", filename=f"dub_{job_id}.mp3")


@app.delete("/job/{job_id}")
def cancel_job(job_id: str):
    if job_id in JOBS:
        job = JOBS[job_id]
        prev_status = job.get("status")
        job["status"] = "cancelled"
        temp_dir = job.get("temp_dir")
        if temp_dir and prev_status in ("done", "failed", "cancelled") and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Job not found")


# =====================================================================
# FASTER-WHISPER GPU/CPU TRANSCRIPTION ENGINE
# =====================================================================

WHISPER_MODELS: Dict[str, Any] = {}
WHISPER_MODELS_DIR = os.environ.get("TUTIN_WHISPER_DIR") or os.path.join(DEFAULT_MODELS_DIR, "whisper")
WHISPER_LOCK = threading.Lock()
os.makedirs(WHISPER_MODELS_DIR, exist_ok=True)


class TranscribeRequest(BaseModel):
    videoPath: Optional[str] = None
    video_path: Optional[str] = None
    audioPath: Optional[str] = None
    audio_path: Optional[str] = None
    language: Optional[str] = None
    modelName: Optional[str] = "large-v3-turbo"
    model_name: Optional[str] = "large-v3-turbo"
    wordTimestamps: Optional[bool] = True
    word_timestamps: Optional[bool] = True


def get_faster_whisper_model(model_name: str = "large-v3-turbo"):
    global WHISPER_MODELS
    resolved = model_name or "large-v3-turbo"
    if resolved in WHISPER_MODELS:
        return WHISPER_MODELS[resolved]

    from faster_whisper import WhisperModel
    import ctranslate2

    device = "cuda" if (torch.cuda.is_available() and ctranslate2.get_cuda_device_count() > 0) else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(f"[Faster-Whisper] Loading '{resolved}' on {device.upper()} ({compute_type}) from {WHISPER_MODELS_DIR}...")
    model = WhisperModel(
        resolved,
        device=device,
        compute_type=compute_type,
        download_root=WHISPER_MODELS_DIR,
    )
    WHISPER_MODELS[resolved] = model
    return model


@app.post("/transcribe")
def transcribe_media(req: TranscribeRequest):
    source = req.videoPath or req.video_path or req.audioPath or req.audio_path
    if not source or not os.path.exists(source):
        raise HTTPException(status_code=400, detail=f"Source media file not found: {source}")

    model_name = req.modelName or req.model_name or "large-v3-turbo"
    lang = req.language
    if lang:
        lang = lang.lower().split("-")[0].strip()
        if lang in ("auto", "source", ""):
            lang = None

    t0 = time.time()
    temp_dir = tempfile.mkdtemp(prefix="tutin_whisper_")
    try:
        audio_target = source
        is_video = source.lower().endswith((".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".m4v", ".ts"))
        if is_video or not source.lower().endswith(".wav"):
            audio_target = os.path.join(temp_dir, "extracted_16k.wav")
            ffmpeg_bin = get_ffmpeg_bin()
            cmd = [
                ffmpeg_bin, "-y", "-i", source,
                "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                audio_target,
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)

        with WHISPER_LOCK:
            model = get_faster_whisper_model(model_name)
            word_ts = req.wordTimestamps if req.wordTimestamps is not None else (req.word_timestamps or True)
            segments, info = model.transcribe(
                audio_target,
                language=lang,
                word_timestamps=word_ts,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )
            segments = list(segments)

        chunks = []
        full_text_list = []
        for s in segments:
            cue_text = s.text.strip()
            if not cue_text:
                continue
            full_text_list.append(cue_text)
            chunk_obj = {
                "text": cue_text,
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "timestamp": [round(s.start, 2), round(s.end, 2)],
            }
            if s.words:
                chunk_obj["words"] = [
                    {
                        "word": w.word,
                        "start": round(w.start, 2),
                        "end": round(w.end, 2),
                        "probability": round(w.probability, 2),
                    }
                    for w in s.words
                ]
            chunks.append(chunk_obj)

        elapsed = round(time.time() - t0, 2)
        return {
            "text": " ".join(full_text_list),
            "chunks": chunks,
            "language": info.language,
            "language_probability": round(info.language_probability, 2) if hasattr(info, "language_probability") else 1.0,
            "duration": round(info.duration, 2),
            "elapsed_seconds": elapsed,
            "model": model_name,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


@app.get("/models/whisper")
def list_whisper_models():
    models = []
    if os.path.exists(WHISPER_MODELS_DIR):
        for item in os.listdir(WHISPER_MODELS_DIR):
            p = os.path.join(WHISPER_MODELS_DIR, item)
            if os.path.isdir(p):
                size_bytes = sum(
                    os.path.getsize(os.path.join(root, f))
                    for root, _, files in os.walk(p)
                    for f in files
                )
                models.append({
                    "name": item,
                    "sizeMb": round(size_bytes / (1024 * 1024), 1),
                    "isLoaded": item in WHISPER_MODELS,
                })
    return {"models": models, "loaded_models": list(WHISPER_MODELS.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9475)
