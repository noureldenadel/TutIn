import os
import sys
import uuid
import tempfile
import traceback
import subprocess
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from pydub import AudioSegment
import torch
import gc

app = FastAPI(title="TutIn Dubbing Service")

# Global state
TTS_MODEL = None
JOBS: Dict[str, dict] = {}  # job_id -> {status, step, progress, error, audio_path}

# ==========================================
# Models & Configuration
# ==========================================

class Chunk(BaseModel):
    timestamp: List[float]  # [start, end]
    text: str

class DubRequest(BaseModel):
    videoPath: str
    chunks: List[Chunk]
    targetLang: str
    modelsDir: Optional[str] = None

def get_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"

def map_xtts_lang(lang: str) -> str:
    # XTTS v2 supported languages: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
    if lang == 'zh': return 'zh-cn'
    return lang

def load_model():
    global TTS_MODEL
    if TTS_MODEL is not None:
        return

    # Import locally to avoid crashing if TTS is not installed
    from TTS.api import TTS
    
    # We use coqui/XTTS-v2 for high quality zero-shot cloning
    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    device = get_device()
    print(f"Loading {model_name} on {device}...")
    
    # Load model
    TTS_MODEL = TTS(model_name).to(device)
    print("Model loaded successfully.")

# ==========================================
# Processing Pipeline
# ==========================================

def extract_reference_audio(video_path: str, temp_dir: str) -> str:
    """Extract a 6-second clean voice sample from the start of the video."""
    ref_path = os.path.join(temp_dir, "reference.wav")
    
    # Extract audio, downmix to mono, 24kHz for XTTS
    cmd = [
        "ffmpeg", "-y", "-i", video_path, 
        "-t", "10",  # Take first 10 seconds
        "-vn", "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1",
        ref_path
    ]
    
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(ref_path):
            raise Exception("FFmpeg failed to create reference audio.")
        return ref_path
    except Exception as e:
        raise Exception(f"Failed to extract reference audio: {str(e)}")

def process_dubbing_job(job_id: str, req: DubRequest):
    global JOBS
    
    job = JOBS[job_id]
    job["status"] = "running"
    
    temp_dir = tempfile.mkdtemp(prefix="tutin_dub_")
    output_path = os.path.join(temp_dir, "final_dub.mp3")
    
    try:
        # 1. Load Model
        job["step"] = "Loading XTTS v2 model"
        load_model()
        
        # 2. Extract Reference Audio
        job["step"] = "Extracting reference voice"
        job["progress"] = 5
        ref_audio_path = extract_reference_audio(req.videoPath, temp_dir)
        
        # 3. Process Chunks
        target_lang = map_xtts_lang(req.targetLang)
        total_chunks = len(req.chunks)
        
        # Create an empty audio canvas. We'll find the max duration.
        max_duration_ms = int(req.chunks[-1].timestamp[1] * 1000) if total_chunks > 0 else 0
        final_audio = AudioSegment.silent(duration=max_duration_ms + 2000) # add 2s buffer
        
        for i, chunk in enumerate(req.chunks):
            if job["status"] == "cancelled":
                raise Exception("Job cancelled by user")
                
            start_ms = int(chunk.timestamp[0] * 1000)
            text = chunk.text.strip()
            
            job["step"] = f"Synthesizing {i+1}/{total_chunks}"
            job["progress"] = 10 + int((i / total_chunks) * 80)
            
            if not text:
                continue
                
            # Generate speech
            chunk_wav_path = os.path.join(temp_dir, f"chunk_{i}.wav")
            
            # Run TTS
            TTS_MODEL.tts_to_file(
                text=text,
                speaker_wav=ref_audio_path,
                language=target_lang,
                file_path=chunk_wav_path
            )
            
            # Overlay onto final audio track
            if os.path.exists(chunk_wav_path):
                segment = AudioSegment.from_wav(chunk_wav_path)
                final_audio = final_audio.overlay(segment, position=start_ms)
                os.remove(chunk_wav_path)
        
        # 4. Export Final Audio
        job["step"] = "Exporting MP3"
        job["progress"] = 95
        
        # Normalize volume
        final_audio = final_audio.normalize()
        final_audio.export(output_path, format="mp3", bitrate="192k")
        
        job["status"] = "done"
        job["step"] = "Complete"
        job["progress"] = 100
        job["audio_path"] = output_path
        
    except Exception as e:
        print("Dubbing error:", traceback.format_exc())
        job["status"] = "failed"
        job["error"] = str(e)
    finally:
        # Cleanup memory
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
        "gpu_available": torch.cuda.is_available(),
        "device": get_device(),
        "model_loaded": TTS_MODEL is not None
    }

@app.post("/dub")
def submit_dub(req: DubRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    
    JOBS[job_id] = {
        "status": "queued",
        "step": "Waiting to start...",
        "progress": 0,
        "error": None,
        "audio_path": None
    }
    
    background_tasks.add_task(process_dubbing_job, job_id, req)
    
    return {"job_id": job_id}

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
        raise HTTPException(status_code=400, detail="Audio not ready")
        
    if not os.path.exists(job["audio_path"]):
        raise HTTPException(status_code=500, detail="Audio file lost")
        
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
