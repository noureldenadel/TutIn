import os
import sys

# Auto-agree to Coqui Terms of Service for non-interactive server mode
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

# Force UTF-8 encoding for stdout/stderr to fix print() errors with non-ASCII text on Windows
if sys.stdout.encoding.lower() != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding.lower() != 'utf-8':
    import io
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import uuid
import tempfile
import traceback
import subprocess
import shutil
import importlib

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

# Ensure default centralized AppData model paths for standalone executions
DEFAULT_MODELS_DIR = os.path.join(
    os.environ.get("APPDATA") or os.path.expanduser("~"), "TutIn", "models"
)
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = os.path.join(DEFAULT_MODELS_DIR, "huggingface")
if "TTS_HOME" not in os.environ:
    os.environ["TTS_HOME"] = DEFAULT_MODELS_DIR
    os.environ["XDG_DATA_HOME"] = DEFAULT_MODELS_DIR

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from pydub import AudioSegment
import torch
import gc

# PyTorch 2.6+ changed torch.load default to weights_only=True, which breaks Coqui XTTS checkpoints.
# Allowlist Coqui config classes and ensure weights_only=False fallback for XTTS checkpoint unpickling.
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

# ==========================================
# CRITICAL FIX: Monkey-patch torchaudio.load to use soundfile
# ==========================================
# torchaudio 2.9+ now defaults to torchcodec which requires FFmpeg shared DLLs
# on Windows. Since we only need to load WAV files for the XTTS voice reference,
# we replace torchaudio.load with a soundfile-based implementation that works
# without any FFmpeg DLLs. This is applied before TTS is imported.
try:
    import torchaudio
    import soundfile as sf
    import numpy as np

    def _soundfile_load(filepath, frame_offset=0, num_frames=-1, normalize=True, channels_first=True, format=None, backend=None):
        """Drop-in replacement for torchaudio.load using soundfile (no FFmpeg/torchcodec required)."""
        filepath = str(filepath)
        data, sample_rate = sf.read(filepath, dtype='float32', always_2d=True)
        # data shape: [frames, channels]
        if frame_offset > 0:
            data = data[frame_offset:]
        if num_frames > 0:
            data = data[:num_frames]
        # Normalize to [-1, 1] range (soundfile already does this for float32)
        waveform = torch.from_numpy(data)  # [frames, channels]
        if channels_first:
            waveform = waveform.T  # -> [channels, frames]
        return waveform, sample_rate

    torchaudio.load = _soundfile_load
    print("[TutIn] torchaudio.load patched to use soundfile (bypasses torchcodec/FFmpeg DLLs)")
except Exception as _patch_err:
    print(f"[TutIn] Warning: Could not patch torchaudio.load: {_patch_err}")


app = FastAPI(title="TutIn Dubbing Service", version="1.0.0")

# Enable CORS for local companion server & frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import threading
import io

# Global state
TTS_MODEL = None
TTS_DEVICE = None  # Track what device the model is currently on
DEVICE_PREFERENCE = "auto"  # User preference: 'auto', 'gpu', 'cpu'
JOBS: Dict[str, dict] = {}  # job_id -> {status, step, progress, error, audio_path, created_at}

# ==========================================
# VRAM Idle Reaper: Automatically unloads XTTS from GPU VRAM after inactivity
# ==========================================
IDLE_UNLOAD_SECONDS = 600  # 10 minutes
_idle_timer = None
_idle_lock = threading.Lock()
_job_lock = threading.Lock()

def cancel_idle_model_unload():
    global _idle_timer
    with _idle_lock:
        if _idle_timer is not None:
            _idle_timer.cancel()
            _idle_timer = None

def schedule_idle_model_unload():
    global _idle_timer
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
            print(f"[XTTS Dubbing] Idle timeout reached ({IDLE_UNLOAD_SECONDS // 60} min). Unloading model to reclaim VRAM/RAM...")
            try:
                del TTS_MODEL
            except Exception:
                pass
            TTS_MODEL = None
            TTS_DEVICE = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("[XTTS Dubbing] Model successfully unloaded. VRAM freed.")

# ==========================================
# Models & Configuration
# ==========================================

class SegmentInput(BaseModel):
    start: Optional[float] = None
    end: Optional[float] = None
    timestamp: Optional[List[float]] = None  # fallback for [start, end]
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
    voiceReferencePath: Optional[str] = None
    voice_reference_path: Optional[str] = None
    modelsDir: Optional[str] = None
    device: Optional[str] = None  # 'auto', 'gpu', 'cpu' — overrides global preference for this job
    preserveBackgroundAudio: Optional[bool] = False
    preserve_background_audio: Optional[bool] = False

    def resolved_video_path(self) -> Optional[str]:
        return self.videoPath or self.video_path

    def resolved_target_lang(self) -> str:
        return self.targetLang or self.target_lang or "en"

    def resolved_voice_ref(self) -> Optional[str]:
        return self.voiceReferencePath or self.voice_reference_path

    def resolved_segments(self) -> List[SegmentInput]:
        return self.segments or self.chunks or []

    def should_preserve_background(self) -> bool:
        return bool(self.preserveBackgroundAudio or self.preserve_background_audio)


def get_ffmpeg_bin() -> str:
    try:
        imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            return ffmpeg_exe
    except Exception:
        pass
    return "ffmpeg"


# Configure Pydub to use resolved FFmpeg binary
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
    """Resolve device based on user preference.
    preference: 'auto' | 'gpu' | 'cpu' | None
    """
    pref = (preference or DEVICE_PREFERENCE or "auto").lower().strip()
    if pref == "cpu":
        return "cpu"
    if pref == "gpu" or pref == "cuda":
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        # GPU requested but not available — fall back to CPU
        print("[XTTS Dubbing] GPU requested but no CUDA/MPS device available. Falling back to CPU.")
        return "cpu"
    # auto: use best available
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_gpu_info() -> dict:
    """Return detailed GPU information for the settings UI."""
    info = {
        "cuda_available": torch.cuda.is_available(),
        "mps_available": hasattr(torch.backends, "mps") and torch.backends.mps.is_available(),
        "gpu_available": False,
        "gpu_name": None,
        "gpu_memory_total_mb": None,
        "gpu_memory_free_mb": None,
        "current_device": TTS_DEVICE or get_device(),
        "device_preference": DEVICE_PREFERENCE
    }
    if torch.cuda.is_available():
        info["gpu_available"] = True
        try:
            info["gpu_name"] = torch.cuda.get_device_name(0)
            mem = torch.cuda.get_device_properties(0).total_mem
            info["gpu_memory_total_mb"] = round(mem / (1024 * 1024))
            free_mem = torch.cuda.mem_get_info(0)[0]
            info["gpu_memory_free_mb"] = round(free_mem / (1024 * 1024))
        except Exception:
            pass
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        info["gpu_available"] = True
        info["gpu_name"] = "Apple Silicon (MPS)"
    return info


XTTS_SUPPORTED_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr",
    "ru", "nl", "cs", "ar", "zh-cn", "hu", "ko", "ja", "hi"
}


def map_xtts_lang(lang: str) -> str:
    # XTTS v2 supported languages: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
    l = (lang or "").lower().strip()
    if l in ("zh", "zh-cn", "zh-tw"):
        return "zh-cn"
    if l in ("ar", "ar-eg", "ar-sa"):
        return "ar"
    if l in ("pt", "pt-br"):
        return "pt"
    return l


def load_model(device_preference: str = None):
    """Load the XTTS v2 model onto the specified device.
    If a model is already loaded on a different device, move it."""
    global TTS_MODEL, TTS_DEVICE

    cancel_idle_model_unload()
    target_device = get_device(device_preference)

    if TTS_MODEL is not None:
        # Model is loaded — check if we need to move it to a different device
        if TTS_DEVICE == target_device:
            return TTS_MODEL
        # Move model to the new device
        print(f"[XTTS Dubbing] Moving model from {TTS_DEVICE.upper()} to {target_device.upper()}...")
        try:
            TTS_MODEL = TTS_MODEL.to(target_device)
            TTS_DEVICE = target_device
            if target_device == "cpu" and torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
            print(f"[XTTS Dubbing] Model successfully moved to {target_device.upper()}.")
        except Exception as e:
            print(f"[XTTS Dubbing] Failed to move model to {target_device}: {e}")
            # Stay on current device
        return TTS_MODEL

    from TTS.api import TTS
    
    if "TTS_HOME" not in os.environ:
        default_models = os.path.join(
            os.environ.get("APPDATA") or os.path.expanduser("~"), "TutIn", "models"
        )
        os.environ["TTS_HOME"] = default_models
        os.environ["XDG_DATA_HOME"] = default_models

    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    print(f"[XTTS Dubbing] Initializing model '{model_name}' on device: {target_device.upper()} (CUDA Available: {torch.cuda.is_available()})...")
    
    # Load model and cache in global state
    TTS_MODEL = TTS(model_name).to(target_device)
    TTS_DEVICE = target_device
    print(f"[XTTS Dubbing] Model loaded successfully and ready on {target_device.upper()}.")
    return TTS_MODEL


# ==========================================
# Audio Processing Pipeline
# ==========================================

def extract_reference_audio(video_path: str, temp_dir: str, explicit_ref_path: Optional[str] = None, segments: Optional[List[SegmentInput]] = None) -> str:
    """
    Extract a clean 8-10 second voice sample from the video or vocal stem.
    If explicit_ref_path is provided and is already a short reference sample (<= 15s), use it directly.
    If explicit_ref_path is a full audio track (e.g. Demucs vocals stem), use it as the source media.
    Otherwise, intelligently scan candidate subtitle segments to locate a window with
    optimal speech energy (good conversational RMS dBFS) and minimal background noise/silence.
    """
    source_media = video_path
    if explicit_ref_path and os.path.exists(explicit_ref_path):
        try:
            sample_seg = AudioSegment.from_file(explicit_ref_path)
            if len(sample_seg) <= 15000:
                print(f"[XTTS Dubbing] Using direct reference voice sample: {explicit_ref_path} ({len(sample_seg)/1000.0:.1f}s)")
                return explicit_ref_path
            source_media = explicit_ref_path
        except Exception:
            source_media = explicit_ref_path

    if not check_ffmpeg():
        raise Exception("FFmpeg was not found in system PATH. Please install FFmpeg to use AI Dubbing.")

    if not source_media or not os.path.exists(source_media):
        raise Exception(f"Source media file not found at path: {source_media}")

    ref_path = os.path.join(temp_dir, "reference_voice.wav")
    ffmpeg_bin = get_ffmpeg_bin()
    
    candidate_start_times = []

    # 1. Identify candidate start times from speech segments (between 12% and 80% of video)
    if segments and len(segments) > 0:
        valid_segs = []
        for s in segments:
            dur = s.get_end() - s.get_start()
            txt = s.text.strip()
            has_speech_content = (len(txt.split()) >= 3 or len(txt) >= 8) and not txt.startswith('[') and not txt.startswith('(')
            if dur >= 2.0 and has_speech_content:
                valid_segs.append(s)

        if not valid_segs:
            for s in segments:
                dur = s.get_end() - s.get_start()
                txt = s.text.strip()
                if dur >= 1.0 and len(txt) >= 2 and not txt.startswith('[') and not txt.startswith('('):
                    valid_segs.append(s)

        if valid_segs:
            n = len(valid_segs)
            indices = [int(n * 0.20), int(n * 0.45), int(n * 0.65), int(n * 0.80)]
            for idx in indices:
                cand = valid_segs[min(idx, n - 1)]
                candidate_start_times.append(max(0.0, cand.get_start()))

    if not candidate_start_times:
        candidate_start_times = [15.0, 30.0, 5.0, 0.0]

    # Deduplicate candidate start times
    candidate_start_times = list(dict.fromkeys(candidate_start_times))

    scored_candidates = []

    for idx, c_start in enumerate(candidate_start_times):
        cand_path = os.path.join(temp_dir, f"cand_ref_{idx}.wav")
        cmd = [
            ffmpeg_bin, "-y",
            "-ss", str(c_start),
            "-i", source_media,
            "-t", "9",  # 9-second clean voice sample
            "-vn",
            "-af", "highpass=f=80,lowpass=f=8000",
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
                # Ideal conversational dialogue lies between -28 dBFS and -14 dBFS.
                # Penalize silence (< -42 dBFS) or clipped distorted audio (> -3 dBFS).
                if -42.0 <= dbfs <= -3.0 and len(audio_slice) >= 1500:
                    score = -abs(dbfs - (-20.0))  # Target standard broadcast -20 dBFS
                    if dbfs > -35.0:
                        score += 5.0
                    # Penalize candidates with long dead silence gaps
                    try:
                        from pydub.silence import detect_silence
                        silences = detect_silence(audio_slice, min_silence_len=250, silence_thresh=-38)
                        silent_ms = sum((e - s) for s, e in silences)
                        active_ratio = max(0.0, 1.0 - (silent_ms / max(1, len(audio_slice))))
                        score += active_ratio * 8.0
                    except Exception:
                        pass
                    scored_candidates.append((score, cand_path))
        except Exception:
            continue

    if scored_candidates:
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        # Select up to top 3 distinct candidate windows for multi-reference latent averaging
        top_candidates = [p for _, p in scored_candidates[:3]]
        if top_candidates[0] != ref_path:
            shutil.copyfile(top_candidates[0], ref_path)
        print(f"[XTTS Dubbing] Selected {len(top_candidates)} high-SNR voice reference sample(s) from {os.path.basename(source_media)}")
        return top_candidates

    # Fallback: try 15s mark first, then 0s mark for short videos (<15s)
    for fallback_start in ("15.0", "0.0"):
        cmd = [
            ffmpeg_bin, "-y",
            "-ss", fallback_start,
            "-i", source_media,
            "-t", "9",
            "-vn",
            "-af", "highpass=f=80,lowpass=f=8000",
            "-acodec", "pcm_s16le",
            "-ar", "24000",
            "-ac", "1",
            ref_path
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(ref_path) and os.path.getsize(ref_path) > 2000:
                break
        except Exception:
            continue
    return ref_path


def apply_atempo_filter(input_wav: str, output_wav: str, speed_factor: float):
    """
    Apply FFmpeg atempo filter to speed up audio clip.
    FFmpeg atempo filter accepts 0.5 to 2.0. If speed_factor > 2.0, chain filters.
    """
    factor = max(0.5, min(speed_factor, 2.5))
    filter_chain = []
    current_factor = factor
    while current_factor > 2.0:
        filter_chain.append("atempo=2.0")
        current_factor /= 2.0
    filter_chain.append(f"atempo={current_factor:.4f}")
    filter_str = ",".join(filter_chain)
    ffmpeg_bin = get_ffmpeg_bin()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", input_wav,
        "-filter:a", filter_str,
        "-vn",
        output_wav
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def apply_rubberband_filter(input_wav: str, output_wav: str, speed_factor: float):
    """
    Apply FFmpeg rubberband filter to adjust tempo with crisp speech transients.
    Falls back to atempo if rubberband fails for any reason.
    """
    factor = max(0.75, min(speed_factor, 1.85))
    ffmpeg_bin = get_ffmpeg_bin()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", input_wav,
        "-filter:a", f"rubberband=tempo={factor:.4f}:transients=crisp:detector=compound",
        "-vn",
        output_wav
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except Exception as err:
        print(f"[XTTS Dubbing] Rubberband filter warning ({err}), falling back to atempo")
        apply_atempo_filter(input_wav, output_wav, speed_factor)


def apply_rubberband_filter_bytes(input_wav_bytes: bytes, speed_factor: float) -> bytes:
    """
    Apply FFmpeg rubberband filter in-memory via stdin/stdout pipes,
    avoiding all disk write/read cycles.
    """
    factor = max(0.75, min(speed_factor, 1.85))
    ffmpeg_bin = get_ffmpeg_bin()
    cmd = [
        ffmpeg_bin, "-y",
        "-f", "wav",
        "-i", "pipe:0",
        "-filter:a", f"rubberband=tempo={factor:.4f}:transients=crisp:detector=compound",
        "-f", "wav",
        "pipe:1"
    ]
    try:
        proc = subprocess.run(cmd, input=input_wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return proc.stdout
    except Exception as err:
        print(f"[XTTS Dubbing] In-memory rubberband filter warning ({err}), falling back to atempo")
        return apply_atempo_filter_bytes(input_wav_bytes, speed_factor)


def apply_atempo_filter_bytes(input_wav_bytes: bytes, speed_factor: float) -> bytes:
    """Apply FFmpeg atempo filter in-memory via stdin/stdout pipes."""
    factor = max(0.5, min(speed_factor, 2.5))
    filter_chain = []
    current_factor = factor
    while current_factor > 2.0:
        filter_chain.append("atempo=2.0")
        current_factor /= 2.0
    filter_chain.append(f"atempo={current_factor:.4f}")
    filter_str = ",".join(filter_chain)
    ffmpeg_bin = get_ffmpeg_bin()
    cmd = [
        ffmpeg_bin, "-y",
        "-f", "wav",
        "-i", "pipe:0",
        "-filter:a", filter_str,
        "-f", "wav",
        "pipe:1"
    ]
    proc = subprocess.run(cmd, input=input_wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return proc.stdout


def trim_internal_silence(audio_segment: AudioSegment, max_reduction_ms: int = 350) -> AudioSegment:
    """
    Detects internal silence pauses (>120ms) and trims excess pause duration,
    absorbing timing slack into natural speech pauses before altering voiced phonemes.
    """
    if len(audio_segment) < 600 or max_reduction_ms <= 30:
        return audio_segment
    try:
        from pydub.silence import detect_silence
        silences = detect_silence(audio_segment, min_silence_len=120, silence_thresh=-36)
        if not silences:
            return audio_segment

        # Ignore pauses in the first 100ms and last 100ms
        internal = [s for s in silences if s[0] > 100 and s[1] < (len(audio_segment) - 100)]
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
            if silence_dur > 100 and total_trimmed < max_reduction_ms:
                trim_amt = min(silence_dur - 60, shave_per_silence, max_reduction_ms - total_trimmed)
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
    except Exception as e:
        print(f"[XTTS Dubbing] Silence trimming warning: {e}")
    return audio_segment


def extract_full_audio(video_path: str, temp_dir: str) -> str:
    """Extract clean 44.1kHz stereo audio from video for Demucs and room-tone analysis."""
    ffmpeg_bin = get_ffmpeg_bin()
    audio_out = os.path.join(temp_dir, "original_audio.wav")
    cmd = [
        ffmpeg_bin, "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        audio_out
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return audio_out


def separate_stems_demucs(audio_path: str, temp_dir: str, device: str = "auto") -> tuple:
    """
    Separates vocals and background audio (music/sfx) using Demucs htdemucs.
    Returns (vocals_wav_path, no_vocals_wav_path).
    """
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
    print(f"[XTTS Dubbing] Running Demucs separation on {dev.upper()}...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    base_name = os.path.splitext(os.path.basename(audio_path))[0]
    stem_dir = os.path.join(demucs_out, "htdemucs", base_name)
    vocals_wav = os.path.join(stem_dir, "vocals.wav")
    no_vocals_wav = os.path.join(stem_dir, "no_vocals.wav")
    if not os.path.exists(vocals_wav) or not os.path.exists(no_vocals_wav):
        raise Exception("Demucs did not produce expected stems (vocals.wav, no_vocals.wav)")
    return vocals_wav, no_vocals_wav


def extract_room_tone_bed(audio_path: str, segments: List[SegmentInput], total_duration_ms: int, temp_dir: str) -> Optional[str]:
    """
    Scans original audio for clean, low-energy intervals outside of dialogue,
    and builds a subtle continuous crossfade-looped ambient bed.
    Returns bed WAV path or None if skipped.
    """
    try:
        audio = AudioSegment.from_file(audio_path)
        if len(audio) < 3000:
            return None

        speech_intervals = []
        for s in segments:
            speech_intervals.append((int(s.get_start() * 1000), int(s.get_end() * 1000)))
        speech_intervals.sort(key=lambda x: x[0])

        gaps = []
        if speech_intervals and speech_intervals[0][0] > 1500:
            gaps.append((200, speech_intervals[0][0] - 200))
        for j in range(len(speech_intervals) - 1):
            gap_start = speech_intervals[j][1] + 250
            gap_end = speech_intervals[j + 1][0] - 250
            if gap_end - gap_start >= 1200:
                gaps.append((gap_start, gap_end))

        candidate_sample = None
        for g_start, g_end in gaps:
            sample_len = min(2500, g_end - g_start)
            slice_seg = audio[g_start:g_start + sample_len]
            dbfs = slice_seg.dBFS
            if -52.0 <= dbfs <= -30.0:
                candidate_sample = slice_seg
                break

        if candidate_sample is None:
            print("[XTTS Dubbing] Room tone: No clean silent room tone candidate found. Skipping ambience bed.")
            return None

        # Attenuate candidate sample to subtle ambient background (-32 dBFS)
        target_gain = -32.0 - candidate_sample.dBFS
        candidate_sample = candidate_sample.apply_gain(target_gain)

        crossfade_ms = 80
        bed = candidate_sample
        while len(bed) < total_duration_ms + 2000:
            bed = bed.append(candidate_sample, crossfade=crossfade_ms)

        bed = bed[:total_duration_ms]
        bed_path = os.path.join(temp_dir, "room_tone_bed.wav")
        bed.export(bed_path, format="wav")
        print(f"[XTTS Dubbing] Generated continuous room tone bed -> {bed_path}")
        return bed_path
    except Exception as e:
        print(f"[XTTS Dubbing] Room tone extraction warning: {e}")
        return None


def mix_dub_with_background(dialogue_wav: str, background_wav: str, output_path: str, room_tone_wav: Optional[str] = None):
    """
    Applies broadcast-grade sidechain ducking in FFmpeg, dipping the background music/sfx
    by ~16 dB when dialogue is spoken, and layers the room tone bed if available.
    Pads dialogue with silence so sidechaincompress never truncates the background outro early,
    and disables amix auto-normalization so dialogue retains 100% loudness.
    """
    ffmpeg_bin = get_ffmpeg_bin()
    if room_tone_wav and os.path.exists(room_tone_wav):
        filter_complex = (
            "[0:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[bg_raw];"
            "[1:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,apad[dlg_pad];"
            "[2:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,apad[rt_pad];"
            "[bg_raw][rt_pad]amix=inputs=2:duration=first:weights=1.0 0.35:dropout_transition=2:normalize=0[bg_full];"
            "[bg_full][dlg_pad]sidechaincompress=threshold=0.035:ratio=6:attack=80:release=350[bg_ducked];"
            "[bg_ducked][dlg_pad]amix=inputs=2:duration=first:weights=0.80 1.0:dropout_transition=2:normalize=0[out]"
        )
        cmd = [
            ffmpeg_bin, "-y",
            "-i", background_wav,
            "-i", dialogue_wav,
            "-i", room_tone_wav,
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-ac", "2",
            "-b:a", "192k",
            output_path
        ]
    else:
        filter_complex = (
            "[0:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo[bg_raw];"
            "[1:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,apad[dlg_pad];"
            "[bg_raw][dlg_pad]sidechaincompress=threshold=0.035:ratio=6:attack=80:release=350[bg_ducked];"
            "[bg_ducked][dlg_pad]amix=inputs=2:duration=first:weights=0.80 1.0:dropout_transition=2:normalize=0[out]"
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
    print(f"[XTTS Dubbing] Mixed ducked background audio -> {output_path}")


def sanitize_dub_text(text: str) -> str:
    if not text:
        return ""
    import re
    # Strip HTML tags
    t = re.sub(r'<[^>]+>', '', text)
    # Strip music notes and special audio symbols
    t = re.sub(r'[♪♫#]+', '', t)
    # Strip bracketed sound descriptors like [Music], [Applause], (Laughter), [Silence]
    t = re.sub(r'\[[^\]]*\]', '', t)
    t = re.sub(r'\([^)]*\)', '', t)
    # Strip all Arabic tashkeel / harakat diacritics (dense diacritics cause catastrophic XTTS BPE failure / alien gibberish)
    t = re.sub(r'[\u0617-\u061A\u064B-\u065F\u0670]', '', t)
    # Normalize corrupted pseudo-phonetic glottal-stop dialect words that choke XTTS tokenizer
    corrupted_words = {
        'طريء': 'طريق',
        'فوء': 'فوق',
        'وإع': 'وقع',
        'وئع': 'وقع',
        'وإعت': 'وقعت',
        'وئعت': 'وقعت',
        'أاعد': 'قاعد',
        'دلأتي': 'دلوقتي',
        'دلوأتي': 'دلوقتي',
        'ألتله': 'قلتله',
        'ألتلها': 'قلتلها',
        'ألتلك': 'قلتلك',
        'ألتلهم': 'قلتلهم',
        'ألت': 'قلت',
        'أريب': 'قريب',
        'أدام': 'قدام',
        'أُدام': 'قدام',
        'أفل': 'قفل',
        'أدر': 'قدر',
        'يبأى': 'يبقى',
        'كِدا': 'كده',
        'كدا': 'كده',
    }
    tokens = t.split()
    tokens = [corrupted_words.get(w, w) for w in tokens]
    t = ' '.join(tokens)
    # Collapse repeated punctuation
    t = re.sub(r'([.?!؟,،;:])\1+', r'\1', t)
    # Collapse multiple whitespaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def estimate_speech_duration_sec(text: str, target_lang: str) -> float:
    """
    Language-aware speech duration estimator for Stage 2 native speed pre-biasing.
    Handles CJK character scripts, Arabic morphology, and Latin/Cyrillic word rates.
    """
    import re
    clean = re.sub(r'[\s.,?!؟،;:—\-"\'()\[\]]+', '', text)
    char_count = max(1, len(clean))
    word_count = max(1, len(text.split()))
    if target_lang in ("zh-cn", "ja", "ko"):
        return char_count / 4.2
    if target_lang == "ar":
        return max(word_count / 2.0, char_count / 11.5)
    return max(word_count / 2.6, char_count / 14.5)


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
            # Validate FFmpeg
            if not check_ffmpeg():
                raise Exception("FFmpeg is not installed or not in PATH. Please install FFmpeg.")

            segments = req.resolved_segments()
            if not segments:
                raise Exception("No subtitle segments provided for dubbing.")

            target_lang = map_xtts_lang(req.resolved_target_lang())
            if target_lang not in XTTS_SUPPORTED_LANGS:
                raise Exception(
                    f"Language '{req.resolved_target_lang()}' (mapped: '{target_lang}') is not supported by XTTS v2. "
                    f"Supported languages: {', '.join(sorted(XTTS_SUPPORTED_LANGS))}"
                )

            # Check background audio preservation preference
            preserve_bg = req.should_preserve_background()
            no_vocals_stem_path = None
            orig_audio_path = None
            video_path = req.resolved_video_path()
            explicit_voice_ref = req.resolved_voice_ref()
            device_pref = req.device or DEVICE_PREFERENCE

            t_job_start = __import__('time').time()
            demucs_sec = 0.0
            model_sec = 0.0
            voice_ref_sec = 0.0
            tts_sec = 0.0
            mix_sec = 0.0
            total_seg_synthesized = 0
            segment_errors = []

            # 1. Demucs Stem Separation (if opt-in requested)
            if preserve_bg:
                if not video_path or not os.path.exists(video_path):
                    raise Exception(f"Video file not found at path: {video_path}")
                job["step"] = "Preserving background audio: Running Demucs separation..."
                job["progress"] = 6
                t_demucs_start = __import__('time').time()
                orig_audio_path = extract_full_audio(video_path, temp_dir)
                vocals_stem_path, no_vocals_stem_path = separate_stems_demucs(orig_audio_path, temp_dir, device_pref)
                demucs_sec = __import__('time').time() - t_demucs_start
                if not explicit_voice_ref and os.path.exists(vocals_stem_path):
                    explicit_voice_ref = vocals_stem_path
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()

            # 2. Load XTTS Model
            job["step"] = "Loading XTTS v2 model..."
            job["progress"] = 12 if preserve_bg else 5
            t_model_start = __import__('time').time()
            load_model(device_pref)
            model_sec = __import__('time').time() - t_model_start

            # 3. Extract Reference Audio
            job["step"] = "Extracting reference speaker voice..."
            job["progress"] = 18 if preserve_bg else 10
            t_ref_start = __import__('time').time()
            ref_voice_paths = extract_reference_audio(
                video_path=video_path,
                temp_dir=temp_dir,
                explicit_ref_path=explicit_voice_ref,
                segments=segments
            )
            voice_ref_sec = __import__('time').time() - t_ref_start

            if isinstance(ref_voice_paths, list):
                primary_ref_path = ref_voice_paths[0]
                latents_ref_paths = ref_voice_paths
            else:
                primary_ref_path = ref_voice_paths
                latents_ref_paths = [ref_voice_paths]

            # 4. Process Segments with Intelligent Time-Fitting
            total_segments = len(segments)

            # Calculate timeline end time
            last_seg_end = max([s.get_end() for s in segments], default=0.0)
            max_duration_ms = int(last_seg_end * 1000)

            # Pre-compute speaker conditioning latents once to eliminate 30%–40% synthesis latency
            # Averaging latents across candidate speech clips creates a consistent acoustic timbre
            xtts_model = None
            gpt_cond_latent = None
            speaker_embedding = None
            if hasattr(TTS_MODEL, "synthesizer") and hasattr(TTS_MODEL.synthesizer, "tts_model"):
                xtts_model = TTS_MODEL.synthesizer.tts_model
                try:
                    t_latent_start = __import__('time').time()
                    print(f"[XTTS Dubbing] Pre-computing speaker conditioning latents from: {latents_ref_paths}...")
                    gpt_cond_latent, speaker_embedding = xtts_model.get_conditioning_latents(
                        audio_path=latents_ref_paths,
                        sound_norm_refs=True
                    )
                    print(f"[XTTS Dubbing] Speaker latents pre-computed in {(__import__('time').time() - t_latent_start):.2f}s (reused across all {len(segments)} cues)")
                except Exception as latent_err:
                    print(f"[XTTS Dubbing] Warning: Could not pre-compute conditioning latents ({latent_err}). Falling back to standard inference.")
                    xtts_model = None

            # Pre-allocate 1D NumPy float32 master canvas at 24,000 Hz
            # Eliminates 190+ GB of Pydub immutable AudioSegment.overlay() memory churn
            SAMPLE_RATE = 24000
            total_canvas_samples = int((max_duration_ms / 1000.0 + 5.0) * SAMPLE_RATE)
            master_canvas = np.zeros(total_canvas_samples, dtype=np.float32)
            last_end_sample = 0

            print(f"[XTTS Dubbing] Starting job {job_id} | Segments: {len(segments)} | Target Lang: {target_lang} | Preserve BG: {preserve_bg}")
            base_progress = 20 if preserve_bg else 12
            available_progress = 70 if preserve_bg else 80

            def synthesize_chunk_in_memory(chunk_text, speed):
                if xtts_model is not None and gpt_cond_latent is not None and speaker_embedding is not None:
                    out = xtts_model.inference(
                        text=chunk_text,
                        language=target_lang,
                        gpt_cond_latent=gpt_cond_latent,
                        speaker_embedding=speaker_embedding,
                        speed=speed,
                        temperature=0.20,
                        length_penalty=1.0,
                        repetition_penalty=2.5,
                        enable_text_splitting=True
                    )
                    raw_wav = out.get("wav", None)
                    if isinstance(raw_wav, torch.Tensor):
                        raw_wav = raw_wav.detach().cpu().numpy()
                    else:
                        raw_wav = np.asarray(raw_wav, dtype=np.float32)
                    pcm16 = (np.clip(raw_wav, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
                    return AudioSegment(data=pcm16, sample_width=2, frame_rate=SAMPLE_RATE, channels=1)
                else:
                    wav_list = TTS_MODEL.tts(
                        text=chunk_text,
                        speaker_wav=primary_ref_path,
                        language=target_lang,
                        speed=speed
                    )
                    raw_wav = np.asarray(wav_list, dtype=np.float32)
                    pcm16 = (np.clip(raw_wav, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
                    return AudioSegment(data=pcm16, sample_width=2, frame_rate=SAMPLE_RATE, channels=1)

            # Seed RNG for deterministic voice timbre and rock-solid acoustic consistency across all cues
            torch.manual_seed(42)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(42)

            import re
            crossfade_samples = int(0.015 * SAMPLE_RATE)  # Max 15ms tail crossfade (never overlap voiced words)

            for i, seg in enumerate(segments):
                if job["status"] == "cancelled":
                    raise Exception("Job cancelled by user.")

                start_sec = max(0.0, seg.get_start())
                end_sec = max(start_sec + 0.2, seg.get_end())

                # Bound end_sec if source subtitle cues overlap
                if i < len(segments) - 1:
                    next_start_sec = max(start_sec + 0.1, segments[i + 1].get_start())
                    effective_end_sec = min(end_sec, next_start_sec) if next_start_sec > start_sec else end_sec
                    gap = max(0.0, next_start_sec - effective_end_sec)
                    absorbed_gap = min(gap, 0.45)
                else:
                    effective_end_sec = end_sec
                    absorbed_gap = 0.60

                nominal_window = max(0.25, effective_end_sec - start_sec)

                # Determine actual start sample BEFORE synthesis so we NEVER overlap voiced audio on top of previous segment
                nominal_start_sample = int(start_sec * SAMPLE_RATE)
                min_allowed_start = max(0, last_end_sample - crossfade_samples) if last_end_sample > 0 else 0
                start_sample = max(nominal_start_sample, min_allowed_start)
                actual_start_sec = start_sample / float(SAMPLE_RATE)

                # Dynamic window recovery: if previous segment pushed actual_start_sec late, tighten current window to recover sync
                available_until_next = (effective_end_sec + absorbed_gap) - actual_start_sec
                target_window_sec = max(max(0.35, nominal_window * 0.55), available_until_next)

                text = sanitize_dub_text(seg.text)

                job["step"] = f"Synthesizing segment {i+1} of {total_segments}..."
                job["progress"] = base_progress + int((i / total_segments) * available_progress)

                if not text:
                    continue

                # Replace any trailing non-terminal punctuation (, ، ; : — -) with a terminal period
                # so XTTS v2 cleanly emits its EOS token instead of hallucinating trailing breaths/groans
                text = re.sub(r'[,،;:—\-]+$', '.', text).strip()
                if text and text[-1] not in ('.', '!', '?', '؟', '。', '！', '？', '…'):
                    text = text + '.'

                # 4a. Language-Aware Native Speed Pre-Biasing (never artificially slow down < 1.0x)
                estimated_sec = estimate_speech_duration_sec(text, target_lang)
                initial_speed = 1.0
                if estimated_sec > target_window_sec * 1.06:
                    initial_speed = min(1.30, estimated_sec / target_window_sec)

                seg_start_t = __import__('time').time()
                try:
                    chunk_audio = synthesize_chunk_in_memory(text, initial_speed)
                except Exception as seg_err:
                    err_msg = f"Segment {i+1} ('{text[:30]}...'): {seg_err}"
                    print(f"[XTTS Dubbing] Warning: {err_msg}")
                    segment_errors.append(err_msg)
                    continue

                seg_elapsed = __import__('time').time() - seg_start_t
                tts_sec += seg_elapsed
                total_seg_synthesized += 1
                seg_latency = round(seg_elapsed * 1000)

                natural_duration_sec = len(chunk_audio) / 1000.0

                # 4b. Adaptive Single Retry (if still significantly exceeding window by >25%)
                if natural_duration_sec > (target_window_sec * 1.25) and initial_speed < 1.30:
                    retry_speed = min(1.38, initial_speed * (natural_duration_sec / target_window_sec))
                    try:
                        r_start = __import__('time').time()
                        chunk_audio = synthesize_chunk_in_memory(text, retry_speed)
                        tts_sec += (__import__('time').time() - r_start)
                        natural_duration_sec = len(chunk_audio) / 1000.0
                        print(f"[XTTS Dubbing] Segment {i+1}: Adaptive retry with speed={retry_speed:.2f} -> {natural_duration_sec:.2f}s")
                    except Exception as retry_err:
                        print(f"[XTTS Dubbing] Adaptive retry warning: {retry_err}")

                # 4c. Internal Silence Truncation (absorb slack into internal pauses in-memory)
                if natural_duration_sec > (target_window_sec * 1.03):
                    excess_ms = int((natural_duration_sec - target_window_sec) * 1000)
                    chunk_audio = trim_internal_silence(chunk_audio, max_reduction_ms=excess_ms)
                    natural_duration_sec = len(chunk_audio) / 1000.0

                final_segment_audio = chunk_audio

                # 4d. Rubber Band / Atempo Fine-Tuning in memory via pipe
                if natural_duration_sec > (target_window_sec * 1.03):
                    speed_factor = natural_duration_sec / target_window_sec
                    try:
                        buf = io.BytesIO()
                        chunk_audio.export(buf, format="wav")
                        if speed_factor <= 1.85:
                            filtered_bytes = apply_rubberband_filter_bytes(buf.getvalue(), speed_factor)
                        else:
                            filtered_bytes = apply_atempo_filter_bytes(buf.getvalue(), speed_factor)
                        final_segment_audio = AudioSegment.from_file(io.BytesIO(filtered_bytes), format="wav")
                        print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Tempo {speed_factor:.2f}x to fit {target_window_sec:.2f}s window")
                    except Exception as tempo_err:
                        print(f"[XTTS Dubbing] Warning: Tempo compression failed for segment {i}: {tempo_err}")
                else:
                    print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Natural duration {natural_duration_sec:.2f}s (window: {target_window_sec:.2f}s)")

                # Normalize per-segment loudness to a consistent conversational level (-18 dBFS)
                if len(final_segment_audio) > 0 and final_segment_audio.dBFS > -45.0:
                    gain_needed = max(-10.0, min(10.0, -18.0 - final_segment_audio.dBFS))
                    final_segment_audio = final_segment_audio.apply_gain(gain_needed)

                fade_ms = min(20, max(1, len(final_segment_audio) // 6))
                final_segment_audio = final_segment_audio.fade_in(fade_ms).fade_out(fade_ms)
                seg_samples = np.array(final_segment_audio.get_array_of_samples(), dtype=np.float32) / 32768.0

                end_sample = start_sample + len(seg_samples)
                if end_sample > len(master_canvas):
                    master_canvas = np.pad(master_canvas, (0, end_sample - len(master_canvas) + SAMPLE_RATE * 2))

                master_canvas[start_sample:end_sample] += seg_samples
                last_end_sample = end_sample

            if total_seg_synthesized == 0:
                first_err = segment_errors[0] if segment_errors else "All segments were empty or failed synthesis."
                raise Exception(f"Dubbing synthesis produced 0 audio segments. Last error: {first_err}")

            # 5. Final Export & Background Mixdown
            job["step"] = "Exporting final dubbed audio..."
            job["progress"] = 93

            t_mix_start = __import__('time').time()

            # Convert master canvas once to AudioSegment
            peak = float(np.max(np.abs(master_canvas))) if len(master_canvas) > 0 else 0.0
            if peak <= 1e-4:
                raise Exception("Synthesized audio track is completely silent (peak amplitude <= 0.0001).")
            if peak > 0.99:
                master_canvas = (master_canvas / peak) * 0.95
            canvas_pcm16 = (np.clip(master_canvas, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
            master_audio = AudioSegment(
                data=canvas_pcm16,
                sample_width=2,
                frame_rate=SAMPLE_RATE,
                channels=1
            ).normalize()

            if preserve_bg and no_vocals_stem_path and os.path.exists(no_vocals_stem_path):
                job["step"] = "Mixing background audio & room tone with ducking..."
                raw_dialogue_path = os.path.join(temp_dir, "dialogue_master.wav")
                master_audio.export(raw_dialogue_path, format="wav")

                # Extract subtle room tone bed
                room_bed_path = extract_room_tone_bed(
                    orig_audio_path or no_vocals_stem_path,
                    segments,
                    max_duration_ms,
                    temp_dir
                )

                # Sidechain ducking mixdown
                mix_dub_with_background(
                    dialogue_wav=raw_dialogue_path,
                    background_wav=no_vocals_stem_path,
                    output_path=output_path,
                    room_tone_wav=room_bed_path
                )
            else:
                # Fast mono dialogue export
                master_audio.export(output_path, format="mp3", bitrate="128k", parameters=["-ac", "1"])
                print(f"[XTTS Dubbing] Exported final dubbed MP3 (128k Mono) -> {output_path}")

            mix_sec = __import__('time').time() - t_mix_start
            total_sec = round(__import__('time').time() - t_job_start, 2)
            avg_seg_ms = round((tts_sec / max(1, total_seg_synthesized)) * 1000)

            job_timings = {
                "total_seconds": total_sec,
                "demucs_separation_seconds": round(demucs_sec, 2),
                "model_load_seconds": round(model_sec, 2),
                "voice_reference_seconds": round(voice_ref_sec, 2),
                "tts_synthesis_seconds": round(tts_sec, 2),
                "mix_export_seconds": round(mix_sec, 2),
                "segments_synthesized": total_seg_synthesized,
                "avg_ms_per_segment": avg_seg_ms
            }

            def fmt_sec(s):
                if s >= 60:
                    m = int(s // 60)
                    sec_rem = int(s % 60)
                    return f"{s/60:.1f} min ({m}m {sec_rem}s)"
                return f"{s:.2f}s"

            print("\n" + "=" * 80)
            print(" [XTTS DUBBING PIPELINE TIMING DEBUGGER]")
            print("=" * 80)
            print(f" Total Pipeline Duration      : {fmt_sec(total_sec):<18} | Full end-to-end voice dubbing process")
            if preserve_bg:
                print(f" Demucs Vocal Separation      : {fmt_sec(demucs_sec):<18} | Isolates speaker vocals from background music & SFX")
            print(f" XTTS Model Warmup/Load       : {fmt_sec(model_sec):<18} | Loads neural synthesis weights into GPU VRAM")
            print(f" Voice Reference Extraction   : {fmt_sec(voice_ref_sec):<18} | Captures speaker vocal timbre & acoustic profile")
            print(f" Neural Synthesis ({total_seg_synthesized:>3} cues)   : {fmt_sec(tts_sec):<18} | Clones voice & synthesizes speech ({avg_seg_ms}ms/cue)")
            print(f" Normalization & Mixdown      : {fmt_sec(mix_sec):<18} | Sidechain ducking, room-tone bed & MP3 export")
            print("=" * 80 + "\n")

            job["status"] = "done"
            job["step"] = "Complete"
            job["progress"] = 100
            job["audio_path"] = output_path
            job["error"] = None
            job["timings"] = job_timings

        except Exception as e:
            print("[XTTS Dubbing] Dubbing job error:", traceback.format_exc())
            if job.get("status") != "cancelled":
                job["status"] = "failed"
            job["error"] = str(e)
            job["step"] = f"Error: {str(e)}"
        finally:
            # Clean up intermediate WAVs/stems immediately; remove entire temp_dir if job did not succeed
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

            # Schedule VRAM idle reaper and release unused CUDA cache
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
        **gpu_info
    }


class DeviceRequest(BaseModel):
    device: str  # 'auto', 'gpu', 'cpu'


@app.post("/set-device")
def set_device(req: DeviceRequest):
    global DEVICE_PREFERENCE
    old_pref = DEVICE_PREFERENCE
    DEVICE_PREFERENCE = req.device.lower().strip()
    resolved = get_device(DEVICE_PREFERENCE)
    print(f"[XTTS Dubbing] Device preference changed: {old_pref} -> {DEVICE_PREFERENCE} (resolved: {resolved})")
    
    # If model is loaded, move it to the new device
    if TTS_MODEL is not None:
        try:
            load_model(DEVICE_PREFERENCE)
        except Exception as e:
            return {"success": False, "error": str(e), "device": TTS_DEVICE, "preference": DEVICE_PREFERENCE}
    
    return {
        "success": True,
        "preference": DEVICE_PREFERENCE,
        "resolved_device": resolved,
        "model_moved": TTS_MODEL is not None,
        "current_model_device": TTS_DEVICE,
        **get_gpu_info()
    }


@app.post("/dub")
def submit_dub(req: DubRequest, background_tasks: BackgroundTasks):
    if not check_ffmpeg():
        raise HTTPException(
            status_code=500,
            detail="FFmpeg binary was not found in system PATH. Please install FFmpeg to use AI Dubbing."
        )

    segments = req.resolved_segments()
    if not segments:
        raise HTTPException(status_code=400, detail="No segments or chunks provided in dub request.")

    mapped_lang = map_xtts_lang(req.resolved_target_lang())
    if mapped_lang not in XTTS_SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{req.resolved_target_lang()}' is not supported by XTTS v2."
        )

    job_id = str(uuid.uuid4())
    
    JOBS[job_id] = {
        "id": job_id,
        "status": "queued",
        "step": "Waiting in queue...",
        "progress": 0,
        "error": None,
        "audio_path": None,
        "total_segments": len(segments),
        "target_lang": req.resolved_target_lang()
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
    if job["status"] != "done" or not job["audio_path"]:
        raise HTTPException(status_code=400, detail="Audio file is not ready")
        
    if not os.path.exists(job["audio_path"]):
        raise HTTPException(status_code=500, detail="Audio file was not found on disk")
        
    return FileResponse(
        job["audio_path"], 
        media_type="audio/mpeg", 
        filename=f"dub_{job_id}.mp3"
    )


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
# MODULAR ON-DEMAND PUNCTUATION RESTORATION ENGINE
# =====================================================================

PUNCT_PIPELINES: Dict[str, Any] = {}
PUNCT_MODELS_DIR = os.environ.get("PUNCT_MODELS_DIR") or os.path.join(
    os.environ.get("APPDATA") or os.path.expanduser("~"), "TutIn", "models", "punctuation"
)

class PunctuateRequest(BaseModel):
    text: str
    lang: Optional[str] = "en"


def get_punctuation_pipeline(lang: str):
    norm_lang = (lang or "en").lower().split("-")[0].strip()
    
    # Model selection: Dedicated Arabic Naqta vs Multilingual/Latin
    if norm_lang == "ar":
        model_name = "MostafaMaroof/Naqta"
        cache_key = "ar"
    else:
        model_name = "oliverguhr/fullstop-punctuation-multilang-large"
        cache_key = "multilingual"

    if cache_key in PUNCT_PIPELINES:
        return PUNCT_PIPELINES[cache_key], norm_lang

    try:
        from transformers import pipeline
        lang_cache_dir = os.path.join(PUNCT_MODELS_DIR, norm_lang)
        os.makedirs(lang_cache_dir, exist_ok=True)
        print(f"[Punctuation] Loading on-demand model for '{norm_lang}' ({model_name}) into {lang_cache_dir}...")
        
        # Force CPU execution (device = -1) for punctuation models.
        # Punctuation inference takes < 0.3s on CPU and saves ~1.5–2.0 GB of GPU VRAM for XTTS and Demucs.
        device = -1
        
        pipe = pipeline(
            "token-classification",
            model=model_name,
            device=device,
            aggregation_strategy="first",
            model_kwargs={"cache_dir": lang_cache_dir}
        )
        PUNCT_PIPELINES[cache_key] = pipe
        PUNCT_PIPELINES[norm_lang] = pipe
        print(f"[Punctuation] Model for '{norm_lang}' successfully loaded into memory.")
        return pipe, norm_lang
    except Exception as e:
        print(f"[Punctuation] Failed to load pipeline for '{norm_lang}': {e}")
        raise e


def apply_token_punctuation(text: str, pipe, norm_lang: str) -> str:
    """
    Applies token classification punctuation marks to raw text,
    chunking into safe token windows to respect transformer length limits.
    """
    if not text or not text.strip():
        return text

    words = text.strip().split()
    if not words:
        return text

    chunk_size = 180
    punctuated_chunks = []

    for i in range(0, len(words), chunk_size):
        chunk_text = " ".join(words[i:i + chunk_size])
        try:
            results = pipe(chunk_text)
            
            reconstructed = []
            last_end = 0
            
            for item in results:
                start = item.get("start", 0)
                end = item.get("end", 0)
                label = str(item.get("entity_group", "") or item.get("entity", "")).strip()
                
                # Append text leading up to this token
                if start > last_end:
                    reconstructed.append(chunk_text[last_end:start])
                
                word_part = chunk_text[start:end]
                reconstructed.append(word_part)
                
                # Check if label represents a punctuation mark
                if label not in ("0", "O", "LABEL_0", ""):
                    punct = label
                    label_map = {"LABEL_1": ".", "LABEL_2": ",", "LABEL_3": "?", "LABEL_4": "!"}
                    punct = label_map.get(punct, punct)
                    # Valid punctuation marks across Arabic and Latin
                    if punct in (".", ",", "?", "!", "-", ":", ";", "،", "؟", "؛"):
                        reconstructed.append(punct)
                
                last_end = end
                
            if last_end < len(chunk_text):
                reconstructed.append(chunk_text[last_end:])
                
            punctuated_chunks.append("".join(reconstructed).strip())
        except Exception as chunk_err:
            print(f"[Punctuation] Chunk inference warning: {chunk_err}")
            punctuated_chunks.append(chunk_text)

    return " ".join(punctuated_chunks).strip()


@app.post("/punctuate")
def punctuate_text(req: PunctuateRequest):
    if not req.text or not req.text.strip():
        return {"punctuated_text": req.text, "model_used": "none", "elapsed_seconds": 0.0}

    t0 = __import__('time').time()
    norm_lang = (req.lang or "en").lower().split("-")[0].strip()
    try:
        pipe, resolved_lang = get_punctuation_pipeline(norm_lang)
        punctuated = apply_token_punctuation(req.text, pipe, resolved_lang)
        elapsed = round(__import__('time').time() - t0, 3)
        word_count = len(req.text.split())
        print(f"[Punctuation Debugger] Restored punctuation for {word_count} words ({resolved_lang}) in {elapsed}s")
        return {
            "punctuated_text": punctuated,
            "lang": resolved_lang,
            "model_used": "neural",
            "elapsed_seconds": elapsed,
            "word_count": word_count
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Punctuation restoration failed: {str(e)}")


@app.get("/models/punctuation")
def list_punctuation_models():
    loaded = []
    for k in PUNCT_PIPELINES.keys():
        if k in ("ar", "en", "es", "fr", "de", "it"):
            loaded.append(k)
        elif k == "multilingual":
            loaded.extend(["en", "es", "fr", "de", "it"])
    return {
        "loaded_models": list(set(loaded)),
        "available_languages": ["en", "ar", "es", "fr", "de", "it"]
    }


@app.delete("/models/punctuation/{lang}")
def unload_punctuation_model(lang: str):
    norm = lang.lower().split("-")[0].strip()
    unloaded = []
    if norm in PUNCT_PIPELINES:
        del PUNCT_PIPELINES[norm]
        unloaded.append(norm)
    cache_key = "ar" if norm == "ar" else "multilingual"
    if cache_key in PUNCT_PIPELINES:
        del PUNCT_PIPELINES[cache_key]
        unloaded.append(cache_key)
    if unloaded:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return {"success": True, "unloaded": unloaded}
    return {"success": False, "message": f"Model for '{norm}' was not loaded in memory"}


# =====================================================================
# FASTER-WHISPER GPU TRANSCRIPTION ENGINE
# =====================================================================

WHISPER_MODELS: Dict[str, Any] = {}
WHISPER_MODELS_DIR = os.path.join(DEFAULT_MODELS_DIR, "whisper")
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

    print(f"[Faster-Whisper] Loading model '{resolved}' on {device.upper()} ({compute_type}) into {WHISPER_MODELS_DIR}...")
    model = WhisperModel(
        resolved,
        device=device,
        compute_type=compute_type,
        download_root=WHISPER_MODELS_DIR
    )
    WHISPER_MODELS[resolved] = model
    print(f"[Faster-Whisper] Model '{resolved}' loaded successfully.")
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

    t0 = __import__('time').time()
    temp_dir = tempfile.mkdtemp(prefix="tutin_whisper_")
    try:
        audio_target = source
        is_video = source.lower().endswith(('.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.m4v', '.ts'))
        if is_video or not source.lower().endswith('.wav'):
            audio_target = os.path.join(temp_dir, "extracted_16k.wav")
            cmd = [
                "ffmpeg", "-y", "-i", source,
                "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                audio_target
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)

        model = get_faster_whisper_model(model_name)
        word_ts = req.wordTimestamps if req.wordTimestamps is not None else (req.word_timestamps or True)

        segments, info = model.transcribe(
            audio_target,
            language=lang,
            word_timestamps=word_ts,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

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
                "timestamp": [round(s.start, 2), round(s.end, 2)]
            }
            if s.words:
                chunk_obj["words"] = [
                    {
                        "word": w.word,
                        "start": round(w.start, 2),
                        "end": round(w.end, 2),
                        "probability": round(w.probability, 2)
                    }
                    for w in s.words
                ]
            chunks.append(chunk_obj)

        elapsed = round(__import__('time').time() - t0, 2)
        print(f"[Faster-Whisper] Transcribed {info.duration:.1f}s audio in {elapsed}s ({len(chunks)} cues) using '{model_name}'.")

        return {
            "text": " ".join(full_text_list),
            "chunks": chunks,
            "language": info.language,
            "language_probability": round(info.language_probability, 2) if hasattr(info, 'language_probability') else 1.0,
            "duration": round(info.duration, 2),
            "elapsed_seconds": elapsed,
            "model": model_name
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
                size_bytes = sum(os.path.getsize(os.path.join(root, f)) for root, _, files in os.walk(p) for f in files)
                models.append({
                    "name": item,
                    "sizeMb": round(size_bytes / (1024 * 1024), 1),
                    "isLoaded": item in WHISPER_MODELS
                })
    return {
        "models": models,
        "loaded_models": list(WHISPER_MODELS.keys())
    }


if __name__ == "__main__":
    import uvicorn
    # Start the server on port 9475
    uvicorn.run(app, host="127.0.0.1", port=9475)

