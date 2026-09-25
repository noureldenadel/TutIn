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

# Global state
TTS_MODEL = None
TTS_DEVICE = None  # Track what device the model is currently on
DEVICE_PREFERENCE = "auto"  # User preference: 'auto', 'gpu', 'cpu'
JOBS: Dict[str, dict] = {}  # job_id -> {status, step, progress, error, audio_path, created_at}

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


def map_xtts_lang(lang: str) -> str:
    # XTTS v2 supported languages: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
    l = lang.lower().strip()
    if l == 'zh': return 'zh-cn'
    if l in ('ar', 'ar-eg', 'ar-sa'): return 'ar'
    if l == 'es': return 'es'
    if l == 'fr': return 'fr'
    if l == 'de': return 'de'
    if l == 'it': return 'it'
    if l == 'pt': return 'pt'
    if l == 'pl': return 'pl'
    if l == 'tr': return 'tr'
    if l == 'ru': return 'ru'
    if l == 'nl': return 'nl'
    if l == 'cs': return 'cs'
    if l == 'hu': return 'hu'
    if l == 'ko': return 'ko'
    if l == 'ja': return 'ja'
    if l == 'hi': return 'hi'
    return l


def load_model(device_preference: str = None):
    """Load the XTTS v2 model onto the specified device.
    If a model is already loaded on a different device, move it."""
    global TTS_MODEL, TTS_DEVICE

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
    Extract a clean 8-10 second voice sample from the video.
    If explicit_ref_path is provided and exists, use it.
    Otherwise, pick a window from the middle of the video where subtitles indicate speech.
    """
    if explicit_ref_path and os.path.exists(explicit_ref_path):
        return explicit_ref_path

    if not check_ffmpeg():
        raise Exception("FFmpeg was not found in system PATH. Please install FFmpeg to use AI Dubbing.")

    if not video_path or not os.path.exists(video_path):
        raise Exception(f"Video file not found at path: {video_path}")

    ref_path = os.path.join(temp_dir, "reference_voice.wav")
    ffmpeg_bin = get_ffmpeg_bin()
    
    # Determine sample start time (avoid first 10 seconds of intro/music)
    start_time = 15.0
    if segments and len(segments) > 0:
        # Find a segment in the 30% - 60% range of subtitles
        mid_idx = len(segments) // 2
        candidate_seg = segments[mid_idx]
        start_time = max(5.0, candidate_seg.get_start())
    
    cmd = [
        ffmpeg_bin, "-y",
        "-ss", str(start_time),
        "-i", video_path,
        "-t", "9",  # 9-second clean voice sample
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "24000",
        "-ac", "1",
        ref_path
    ]

    try:
        res = subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if not os.path.exists(ref_path) or os.path.getsize(ref_path) < 1000:
            # Fallback to start of video if middle seek failed
            fallback_cmd = [
                ffmpeg_bin, "-y",
                "-i", video_path,
                "-t", "9",
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "24000",
                "-ac", "1",
                ref_path
            ]
            subprocess.run(fallback_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
        if not os.path.exists(ref_path):
            raise Exception("FFmpeg failed to extract reference audio.")
        return ref_path
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
        raise Exception(f"FFmpeg reference extraction error: {err_msg}")


def apply_atempo_filter(input_wav: str, output_wav: str, speed_factor: float):
    """
    Apply FFmpeg atempo filter to speed up audio clip.
    FFmpeg atempo filter accepts 0.5 to 2.0. If speed_factor > 2.0, chain filters.
    """
    # Clamp speed factor between 0.5 and 1.5 to avoid extreme robotic/metallic artifacts
    factor = max(0.5, min(speed_factor, 1.5))
    
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
    factor = max(0.60, min(speed_factor, 1.60))
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
        apply_atempo_filter(input_wav, output_wav, factor)


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
    """
    ffmpeg_bin = get_ffmpeg_bin()
    if room_tone_wav and os.path.exists(room_tone_wav):
        filter_complex = (
            "[0:a][2:a]amix=inputs=2:weights=1.0 0.35:dropout_transition=2[bg_full];"
            "[bg_full][1:a]sidechaincompress=threshold=0.035:ratio=6:attack=80:release=350[bg_ducked];"
            "[bg_ducked][1:a]amix=inputs=2:weights=0.80 1.0[out]"
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
            "[0:a][1:a]sidechaincompress=threshold=0.035:ratio=6:attack=80:release=350[bg_ducked];"
            "[bg_ducked][1:a]amix=inputs=2:weights=0.80 1.0[out]"
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
    # Collapse multiple whitespaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def process_dubbing_job(job_id: str, req: DubRequest):
    global JOBS
    
    job = JOBS[job_id]
    job["status"] = "running"
    
    temp_dir = tempfile.mkdtemp(prefix="tutin_dub_")
    output_path = os.path.join(temp_dir, "final_dub.mp3")
    
    try:
        # Validate FFmpeg
        if not check_ffmpeg():
            raise Exception("FFmpeg is not installed or not in PATH. Please install FFmpeg.")

        segments = req.resolved_segments()
        if not segments:
            raise Exception("No subtitle segments provided for dubbing.")

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
        ref_voice_path = extract_reference_audio(
            video_path=video_path,
            temp_dir=temp_dir,
            explicit_ref_path=explicit_voice_ref,
            segments=segments
        )
        voice_ref_sec = __import__('time').time() - t_ref_start

        # 4. Process Segments with Intelligent Time-Fitting
        target_lang = map_xtts_lang(req.resolved_target_lang())
        total_segments = len(segments)
        
        # Calculate timeline end time
        last_seg_end = max([s.get_end() for s in segments], default=0.0)
        max_duration_ms = int(last_seg_end * 1000)
        
        # Create silent master canvas
        master_audio = AudioSegment.silent(duration=max_duration_ms + 3000)
        last_end_ms = 0
        
        print(f"[XTTS Dubbing] Starting job {job_id} | Segments: {len(segments)} | Target Lang: {target_lang} | Preserve BG: {preserve_bg}")
        base_progress = 20 if preserve_bg else 12
        available_progress = 70 if preserve_bg else 80

        for i, seg in enumerate(segments):
            if job["status"] == "cancelled":
                raise Exception("Job cancelled by user.")

            start_sec = seg.get_start()
            end_sec = seg.get_end()
            nominal_window = max(0.2, end_sec - start_sec)

            # Inter-segment silence gap absorption (zero-stretch first)
            if i < len(segments) - 1:
                next_start_sec = segments[i + 1].get_start()
                gap = max(0.0, next_start_sec - end_sec)
                absorbed_gap = min(gap, 0.45)
                target_window_sec = nominal_window + absorbed_gap
            else:
                target_window_sec = nominal_window + 0.60

            start_ms = int(start_sec * 1000)
            text = sanitize_dub_text(seg.text)
            
            job["step"] = f"Synthesizing segment {i+1} of {total_segments}..."
            job["progress"] = base_progress + int((i / total_segments) * available_progress)
            
            if not text:
                continue

            raw_chunk_path = os.path.join(temp_dir, f"raw_chunk_{i}.wav")
            fitted_chunk_path = os.path.join(temp_dir, f"fitted_chunk_{i}.wav")

            # 4a. Native Speed Pre-Biasing
            words = text.split()
            word_count = max(1, len(words))
            estimated_sec = word_count / 2.6
            initial_speed = 1.0
            if estimated_sec > target_window_sec * 1.10:
                initial_speed = min(1.25, estimated_sec / target_window_sec)
            elif estimated_sec < target_window_sec * 0.75:
                initial_speed = max(0.88, estimated_sec / target_window_sec)

            seg_start_t = __import__('time').time()
            try:
                TTS_MODEL.tts_to_file(
                    text=text,
                    speaker_wav=ref_voice_path,
                    language=target_lang,
                    speed=initial_speed,
                    file_path=raw_chunk_path
                )
            except Exception as seg_err:
                print(f"[XTTS Dubbing] Warning: Segment {i+1} synthesis error ('{text[:30]}...'): {seg_err}")
                continue

            seg_elapsed = __import__('time').time() - seg_start_t
            tts_sec += seg_elapsed
            total_seg_synthesized += 1
            seg_latency = round(seg_elapsed * 1000)

            if not os.path.exists(raw_chunk_path):
                continue

            chunk_audio = AudioSegment.from_wav(raw_chunk_path)
            natural_duration_sec = len(chunk_audio) / 1000.0

            # 4b. Adaptive Single Retry (if still significantly exceeding window by >28%)
            if natural_duration_sec > (target_window_sec * 1.28) and initial_speed < 1.25:
                retry_speed = min(1.35, initial_speed * (natural_duration_sec / target_window_sec))
                try:
                    r_start = __import__('time').time()
                    TTS_MODEL.tts_to_file(
                        text=text,
                        speaker_wav=ref_voice_path,
                        language=target_lang,
                        speed=retry_speed,
                        file_path=raw_chunk_path
                    )
                    tts_sec += (__import__('time').time() - r_start)
                    chunk_audio = AudioSegment.from_wav(raw_chunk_path)
                    natural_duration_sec = len(chunk_audio) / 1000.0
                    print(f"[XTTS Dubbing] Segment {i+1}: Adaptive retry with speed={retry_speed:.2f} -> {natural_duration_sec:.2f}s")
                except Exception as retry_err:
                    print(f"[XTTS Dubbing] Adaptive retry warning: {retry_err}")

            # 4c. Internal Silence Truncation (absorb slack into internal pauses)
            if natural_duration_sec > (target_window_sec * 1.04):
                excess_ms = int((natural_duration_sec - target_window_sec) * 1000)
                chunk_audio = trim_internal_silence(chunk_audio, max_reduction_ms=excess_ms)
                natural_duration_sec = len(chunk_audio) / 1000.0
                chunk_audio.export(raw_chunk_path, format="wav")

            final_segment_audio = chunk_audio

            # 4d. Rubber Band Fine-Tuning (minor corrections only)
            if natural_duration_sec > (target_window_sec * 1.04):
                speed_factor = natural_duration_sec / target_window_sec
                try:
                    apply_rubberband_filter(raw_chunk_path, fitted_chunk_path, speed_factor)
                    if os.path.exists(fitted_chunk_path):
                        final_segment_audio = AudioSegment.from_wav(fitted_chunk_path)
                        os.remove(fitted_chunk_path)
                        print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Rubber Band {speed_factor:.2f}x to fit {target_window_sec:.2f}s window")
                except Exception as tempo_err:
                    print(f"[XTTS Dubbing] Warning: Rubber Band compression failed for segment {i}: {tempo_err}")
            else:
                print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Natural duration {natural_duration_sec:.2f}s (window: {target_window_sec:.2f}s)")

            # Prevent overlapping by shifting start_ms if previous segment is still playing
            if start_ms < last_end_ms:
                start_ms = last_end_ms + 50
                
            # Ensure master canvas is long enough
            required_length = start_ms + len(final_segment_audio)
            if required_length > len(master_audio):
                master_audio += AudioSegment.silent(duration=(required_length - len(master_audio) + 1000))

            # Apply a short 20ms fade in/out
            final_segment_audio = final_segment_audio.fade_in(20).fade_out(20)

            # Place onto master audio canvas at target start time
            master_audio = master_audio.overlay(final_segment_audio, position=start_ms)
            last_end_ms = start_ms + len(final_segment_audio)
            
            if os.path.exists(raw_chunk_path):
                os.remove(raw_chunk_path)

        # 5. Final Export & Background Mixdown
        job["step"] = "Exporting final dubbed audio..."
        job["progress"] = 93

        t_mix_start = __import__('time').time()
        master_audio = master_audio.normalize()

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

        print("\n" + "=" * 62)
        print(" [XTTS DUBBING PIPELINE TIMING DEBUGGER]")
        print("=" * 62)
        print(f" Total Dubbing Time           : {fmt_sec(total_sec)}")
        if preserve_bg:
            print(f" Demucs Vocal Separation      : {fmt_sec(demucs_sec)}")
        print(f" XTTS Model Warmup/Load       : {fmt_sec(model_sec)}")
        print(f" Voice Reference Extraction   : {fmt_sec(voice_ref_sec)}")
        print(f" Neural Synthesis ({total_seg_synthesized:>3} cues)   : {fmt_sec(tts_sec)} (avg {avg_seg_ms}ms/cue)")
        print(f" Normalization & Mixdown      : {fmt_sec(mix_sec)}")
        print("=" * 62 + "\n")

        job["status"] = "done"
        job["step"] = "Complete"
        job["progress"] = 100
        job["audio_path"] = output_path
        job["error"] = None
        job["timings"] = job_timings

    except Exception as e:
        print("[XTTS Dubbing] Dubbing job error:", traceback.format_exc())
        job["status"] = "failed"
        job["error"] = str(e)
        job["step"] = f"Error: {str(e)}"
    finally:
        # Cleanup GPU VRAM and RAM
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
        JOBS[job_id]["status"] = "cancelled"
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Job not found")


# =====================================================================
# MODULAR ON-DEMAND PUNCTUATION RESTORATION ENGINE
# =====================================================================

PUNCT_PIPELINES: Dict[str, Any] = {}
PUNCT_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "punctuation")

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
        
        # Use GPU if available and preferred, else CPU
        use_cuda = (TTS_DEVICE == "cuda" and torch.cuda.is_available())
        device = 0 if use_cuda else -1
        
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


if __name__ == "__main__":
    import uvicorn
    # Start the server on port 9475
    uvicorn.run(app, host="127.0.0.1", port=9475)

