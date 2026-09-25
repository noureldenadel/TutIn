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

    def resolved_video_path(self) -> Optional[str]:
        return self.videoPath or self.video_path

    def resolved_target_lang(self) -> str:
        return self.targetLang or self.target_lang or "en"

    def resolved_voice_ref(self) -> Optional[str]:
        return self.voiceReferencePath or self.voice_reference_path

    def resolved_segments(self) -> List[SegmentInput]:
        return self.segments or self.chunks or []


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

        # 1. Load XTTS Model (respect per-job device override or global preference)
        job["step"] = "Loading XTTS v2 model..."
        job["progress"] = 5
        device_pref = req.device or DEVICE_PREFERENCE
        load_model(device_pref)

        # 2. Extract Reference Audio
        job["step"] = "Extracting reference speaker voice..."
        job["progress"] = 10
        video_path = req.resolved_video_path()
        ref_voice_path = extract_reference_audio(
            video_path=video_path,
            temp_dir=temp_dir,
            explicit_ref_path=req.resolved_voice_ref(),
            segments=segments
        )

        # 3. Process Segments
        target_lang = map_xtts_lang(req.resolved_target_lang())
        total_segments = len(segments)
        
        # Calculate timeline end time
        last_seg_end = max([s.get_end() for s in segments], default=0.0)
        max_duration_ms = int(last_seg_end * 1000)
        
        # Create silent master canvas
        master_audio = AudioSegment.silent(duration=max_duration_ms + 3000)  # +3s safety buffer
        
        last_end_ms = 0
        
        print(f"[XTTS Dubbing] Starting job {job_id} | Segments: {len(segments)} | Target Lang: {target_lang}")
        for i, seg in enumerate(segments):
            if job["status"] == "cancelled":
                raise Exception("Job cancelled by user.")

            start_sec = seg.get_start()
            end_sec = seg.get_end()
            target_window_sec = max(0.2, end_sec - start_sec)
            start_ms = int(start_sec * 1000)
            text = seg.text.strip()
            
            job["step"] = f"Synthesizing segment {i+1} of {total_segments}..."
            job["progress"] = 12 + int((i / total_segments) * 80)
            
            if not text:
                continue

            raw_chunk_path = os.path.join(temp_dir, f"raw_chunk_{i}.wav")
            fitted_chunk_path = os.path.join(temp_dir, f"fitted_chunk_{i}.wav")
            
            # Synthesize segment speech
            seg_start_t = __import__('time').time()
            TTS_MODEL.tts_to_file(
                text=text,
                speaker_wav=ref_voice_path,
                language=target_lang,
                file_path=raw_chunk_path
            )
            seg_latency = round((__import__('time').time() - seg_start_t) * 1000)

            if not os.path.exists(raw_chunk_path):
                continue

            # Check duration and apply FFmpeg atempo if it exceeds window by >15%
            chunk_audio = AudioSegment.from_wav(raw_chunk_path)
            natural_duration_sec = len(chunk_audio) / 1000.0

            final_segment_audio = chunk_audio

            # Timing Fit:
            # If duration exceeds target window by more than 15% tolerance:
            if natural_duration_sec > (target_window_sec * 1.15):
                speed_factor = natural_duration_sec / target_window_sec
                try:
                    apply_atempo_filter(raw_chunk_path, fitted_chunk_path, speed_factor)
                    if os.path.exists(fitted_chunk_path):
                        final_segment_audio = AudioSegment.from_wav(fitted_chunk_path)
                        os.remove(fitted_chunk_path)
                        print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Sped up {speed_factor:.2f}x to fit {target_window_sec:.2f}s window")
                except Exception as tempo_err:
                    print(f"[XTTS Dubbing] Warning: atempo compression failed for segment {i}: {tempo_err}")
            else:
                print(f"[XTTS Dubbing] Segment {i+1}/{total_segments} ({seg_latency}ms): Natural duration {natural_duration_sec:.2f}s (window: {target_window_sec:.2f}s)")

            # Prevent overlapping by shifting start_ms if previous segment is still playing
            if start_ms < last_end_ms:
                start_ms = last_end_ms + 50
                
            # Ensure master canvas is long enough (in case we shifted past its end)
            required_length = start_ms + len(final_segment_audio)
            if required_length > len(master_audio):
                master_audio += AudioSegment.silent(duration=(required_length - len(master_audio) + 1000))

            # Apply a short 20ms fade in/out to remove clicking/harsh starts
            final_segment_audio = final_segment_audio.fade_in(20).fade_out(20)

            # Place onto master audio canvas at target start time
            master_audio = master_audio.overlay(final_segment_audio, position=start_ms)
            last_end_ms = start_ms + len(final_segment_audio)
            
            if os.path.exists(raw_chunk_path):
                os.remove(raw_chunk_path)

        # 4. Final Export
        job["step"] = "Exporting MP3 audio track..."
        job["progress"] = 95

        # Normalize audio levels
        master_audio = master_audio.normalize()
        # Export as 128k mono MP3 — high quality for speech, ~50% smaller than 192k stereo
        master_audio.export(output_path, format="mp3", bitrate="128k", parameters=["-ac", "1"])
        print(f"[XTTS Dubbing] Exported final dubbed MP3 (128k Mono) -> {output_path}")

        job["status"] = "done"
        job["step"] = "Complete"
        job["progress"] = 100
        job["audio_path"] = output_path
        job["error"] = None

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


if __name__ == "__main__":
    import uvicorn
    # Start the server on port 9475
    uvicorn.run(app, host="127.0.0.1", port=9475)
