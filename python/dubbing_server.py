import os
import sys
import uuid
import tempfile
import traceback
import subprocess
import shutil
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from pydub import AudioSegment
import torch
import gc

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

    def resolved_video_path(self) -> Optional[str]:
        return self.videoPath or self.video_path

    def resolved_target_lang(self) -> str:
        return self.targetLang or self.target_lang or "en"

    def resolved_voice_ref(self) -> Optional[str]:
        return self.voiceReferencePath or self.voice_reference_path

    def resolved_segments(self) -> List[SegmentInput]:
        return self.segments or self.chunks or []


def check_ffmpeg() -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False


def get_device():
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def map_xtts_lang(lang: str) -> str:
    # XTTS v2 supported languages: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
    l = lang.lower().strip()
    if l == 'zh': return 'zh-cn'
    if l == 'ar': return 'ar'
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


def load_model():
    global TTS_MODEL
    if TTS_MODEL is not None:
        return TTS_MODEL

    from TTS.api import TTS
    
    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    device = get_device()
    print(f"[DubbingServer] Loading {model_name} on {device}...")
    
    # Load model and cache in global state
    TTS_MODEL = TTS(model_name).to(device)
    print("[DubbingServer] Model loaded successfully.")
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
    
    # Determine sample start time (avoid first 10 seconds of intro/music)
    start_time = 15.0
    if segments and len(segments) > 0:
        # Find a segment in the 30% - 60% range of subtitles
        mid_idx = len(segments) // 2
        candidate_seg = segments[mid_idx]
        start_time = max(5.0, candidate_seg.get_start())
    
    cmd = [
        "ffmpeg", "-y",
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
                "ffmpeg", "-y",
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
    # Clamp speed factor between 0.5 and 2.5
    factor = max(0.5, min(speed_factor, 2.5))
    
    filter_chain = []
    current_factor = factor
    while current_factor > 2.0:
        filter_chain.append("atempo=2.0")
        current_factor /= 2.0
    filter_chain.append(f"atempo={current_factor:.4f}")
    
    filter_str = ",".join(filter_chain)
    
    cmd = [
        "ffmpeg", "-y",
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

        # 1. Load XTTS Model
        job["step"] = "Loading XTTS v2 model..."
        job["progress"] = 5
        load_model()

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
            TTS_MODEL.tts_to_file(
                text=text,
                speaker_wav=ref_voice_path,
                language=target_lang,
                file_path=raw_chunk_path
            )

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
                except Exception as tempo_err:
                    print(f"Warning: atempo compression failed for segment {i}: {tempo_err}")
            # If shorter, do NOT stretch to fill (leave as natural speech)

            # Place onto master audio canvas at target start time
            master_audio = master_audio.overlay(final_segment_audio, position=start_ms)
            
            if os.path.exists(raw_chunk_path):
                os.remove(raw_chunk_path)

        # 4. Final Export
        job["step"] = "Exporting MP3 audio track..."
        job["progress"] = 95

        # Normalize audio levels
        master_audio = master_audio.normalize()
        master_audio.export(output_path, format="mp3", bitrate="192k")

        job["status"] = "done"
        job["step"] = "Complete"
        job["progress"] = 100
        job["audio_path"] = output_path
        job["error"] = None

    except Exception as e:
        print("Dubbing job error:", traceback.format_exc())
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
    return {
        "status": "ok",
        "ffmpeg_available": check_ffmpeg(),
        "gpu_available": torch.cuda.is_available(),
        "device": get_device(),
        "model_loaded": TTS_MODEL is not None
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
