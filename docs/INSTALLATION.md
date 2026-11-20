# Installation & Setup Guide

Complete setup reference for **TutIn v8.0 Beta** across Windows, macOS, and Linux.

---

## Requirements

| Component | Requirement | Needed For |
|---|---|---|
| **Node.js & npm** | Node.js **18+ LTS** (tested on Node 24) | Core desktop web workstation (Express 5 + SQLite + Vite 8 SPA) |
| **Python** *(optional)* | **Python 3.10 or 3.11** | Local `faster-whisper` transcription, `XTTS-v2` voice cloning, `edge-tts`, and `Demucs` stem separation |
| **FFmpeg** *(optional)* | Bundled via `imageio-ffmpeg` in `.venv`, or system `ffmpeg` on `PATH` | Audio extraction, dubbing alignment, and media inspection |
| **GPU** *(optional)* | NVIDIA CUDA GPU (or Apple MPS) | Hardware acceleration for `faster-whisper`, `XTTS-v2`, and `Demucs` (CPU fallback works automatically) |

---

## 1. Windows One-Click Launcher (Recommended)

Double-click [`start-dev.bat`](../start-dev.bat) in the repository root. It automatically:
1. Verifies Node.js and npm are installed.
2. Installs missing npm packages in the root workspace, `server/`, and `client/`.
3. Starts the Express backend (`http://127.0.0.1:9474`) and Vite frontend (`http://127.0.0.1:5173`).
4. Opens TutIn in your default browser.

---

## 2. Manual Node.js Setup (Windows / macOS / Linux)

```sh
git clone https://github.com/noureldenadel/TutIn.git
cd TutIn

# Install dependencies across all 3 workspaces
npm install
npm --prefix server install
npm --prefix client install

# Start development servers (API :9474 + SPA :5173)
npm start
```

### Production Build (Single-Port Serving)
Serve the compiled React SPA directly from Express on `http://127.0.0.1:9474`:

```sh
npm run build
npm run start:prod
```

### Workspace Scripts
| Command | Purpose |
|---|---|
| `npm start` | Runs `server/` (`:9474`) and `client/` (`:5173`) concurrently |
| `npm run server` / `npm run server:dev` | Runs only the Express + SQLite server (or with `--watch`) |
| `npm run client` | Runs only the Vite dev server (proxies `/api` and `/video`) |
| `npm run build` | Builds the production SPA bundle into `client/dist/` |
| `npm run start:prod` | Serves `client/dist/` directly from Express on `:9474` |
| `npm run typecheck` | Runs `tsc --noEmit` inside `client/` |
| `npm run lint` | Runs ESLint inside `client/` |

---

## 3. Optional Python AI Sidecar (`:9475`)

Even without Python, TutIn supports browser WebGPU/WASM `Whisper` transcription and local Node `NLLB-200` subtitle translation. Setting up the Python environment unlocks GPU-accelerated `faster-whisper`, neural `edge-tts`, local `XTTS-v2` instructor voice cloning, and `HTDemucs` background stem separation.

Create the virtual environment at the **repository root** (`.venv/`), which `server/services/dubbingService.js` detects and spawns on demand:

```sh
# From repository root (.TutIn/)
python -m venv .venv
```

Activate the environment:
- **Windows (PowerShell/CMD):** `.venv\Scripts\activate`
- **macOS / Linux:** `source .venv/bin/activate`

Install PyTorch (choose **CUDA** for NVIDIA GPUs or skip directly to `requirements.txt` for CPU/MPS) and sidecar dependencies:

```sh
# Optional: NVIDIA CUDA PyTorch build (adjust cu121/cu124 to match your driver)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install TutIn AI & dubbing dependencies
pip install -r server/python/requirements.txt
```

> [!NOTE]
> You do **not** need to start `server/python/dubbing_server.py` manually—the Node backend launches and monitors it automatically on `127.0.0.1:9475` whenever transcription or dubbing starts.

---

## 4. Optional Cloud API Keys

TutIn works offline out of the box. To enable cloud-assisted extras, open **Settings → AI & APIs**:

- **OpenRouter API Key** — Enables dialect-aware translation (`ar-eg` Egyptian & `ar-sa` Saudi Arabic) and optional OpenRouter model selection.
- **Google API Key** — Enables YouTube Data API v3 playlist/metadata lookups and Google Drive folder intake.

---

## 5. Storage Locations & Environment Variables

### Local Storage Paths
- **SQLite Database (`tutin.db`):**
  - Windows: `%APPDATA%\TutIn\`
  - macOS: `~/Library/Application Support/TutIn/`
  - Linux: `~/.config/TutIn/` (or `$XDG_CONFIG_HOME/TutIn/`)
- **Portable Course Vaults:** `<courseFolder>/.tutin/` (`notes/`, `subtitles/`, `dubs/`, `summaries/`, `canvas.json`)
- **Downloaded AI Model Weights:** `%APPDATA%\TutIn\models\` (`whisper/`, `translation/`, `tts/`, `demucs/`, `huggingface/`)

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `TUTIN_DATA_DIR` | OS app-data folder | Overrides where `tutin.db`, backups, and cloud course caches live |
| `TUTIN_MODELS_DIR` | `<DataDir>/models` | Overrides where local AI weights (`Whisper`, `XTTS-v2`, `Demucs`, `HF`) are stored |
| `VITE_API_TARGET` | `http://127.0.0.1:9474` | Backend proxy target used by the Vite dev server |
| `FFMPEG_PATH` | Auto-detected | Explicit path to an `ffmpeg` binary (falls back to `.venv` `imageio-ffmpeg` or `PATH`) |

---

## 6. Troubleshooting

- **Python sidecar not detected:** Verify `.venv` lives directly inside the repository root (`.venv\Scripts\python.exe` on Windows or `.venv/bin/python` on POSIX).
- **Port `9474` or `5173` busy:** Express automatically scans for the next open port starting at `9474`. If you move the backend port, pass `VITE_API_TARGET=http://127.0.0.1:<port>` when launching the client.
- **Slow AI downloads on first run:** First-time Whisper, NLLB-200, XTTS-v2, or Demucs runs download weights into `TUTIN_MODELS_DIR` once and reuse them offline afterward. Inspect disk usage anytime in **Settings → Voice**.
