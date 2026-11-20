<div align="center">

<img src="./client/public/tutin-icon.svg" width="76" height="76" alt="TutIn logo" />

# TutIn `v8.0 Beta`

**Local-first video learning workstation for self-paced courses, Obsidian-grade notes, 2D spatial whiteboards, and offline AI dubbing.**

[![Version](https://img.shields.io/badge/version-8.0.0--beta-blue?style=flat-square)](./CHANGELOG.md)
[![Stage](https://img.shields.io/badge/stage-public%20beta-orange?style=flat-square)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![Stack](https://img.shields.io/badge/React_19-Express_5-111111?style=flat-square)](./docs/ARCHITECTURE.md)
[![AI](https://img.shields.io/badge/AI-Faster--Whisper_%7C_XTTS--v2_%7C_NLLB--200-5b5bd6?style=flat-square)](./docs/INSTALLATION.md)

[Features](#features) · [Quick Start](#quick-start) · [AI & Vault](#portable-vault--local-ai) · [Documentation](#documentation)

</div>

> [!IMPORTANT]
> **Public Beta (`8.0.0-beta`):** TutIn is in active v8 Beta while keeping your courses, SQLite database, notes, and `.tutin/` vaults **100% local on your machine**. See [`CHANGELOG.md`](./CHANGELOG.md) for everything new since `v7.0.0`.

<!-- Screenshot slot: export showcase to docs/screenshots/hero-workspace.png and uncomment:
<p align="center">
  <img src="./docs/screenshots/hero-workspace.png" alt="TutIn v8.0 Beta Workspace" width="100%" />
</p>
-->

---

## Why TutIn?

Video courses live scattered across folders, YouTube playlists, and cloud drives—while your notes sit trapped in unrelated apps. **TutIn** brings everything into one calm, local-first study studio: stream local `.mp4`/`.ts` lectures or online courses, take timestamped Markdown notes with cropped video frames, organize ideas on a 2D spatial canvas, and generate offline subtitles or dubbed audio in your own language.

---

## Features

| Pillar | What You Get |
|---|---|
| **Unified Course Library** | Import local course folders, YouTube playlists, Google Drive folders, or external links. Deterministic geometric covers, instructor profiles, tag filters, and folder resync (`SyncPreviewModal`) keep moved files intact. |
| **Distraction-Free Study Player** | Plays `.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`, and MPEG-TS (`.ts`) streams plus YouTube/Drive embeds. Includes hold-to-`2×` speed boost, 3-second `Up next` countdown, native PiP, and full keyboard navigation. |
| **Broadcast Captions & Transcripts** | Viewport-scaled draggable captions (`S`/`M`/`L`, `Box`/`Outline`), half-open `[start, end)` timestamp seeking, hover copy, and bidirectional drag-to-copy across cues. |
| **29-Language AI Subtitles & Dubbing** | Local `faster-whisper` transcription (with WebGPU/WASM browser fallback), offline `NLLB-200` + OpenRouter Arabic dialect (`ar-eg` / `ar-sa`) translation, and dual-engine voice dubbing (`edge-tts` neural voices or local `XTTS-v2` instructor voice cloning with `Off` / `Music & SFX` Demucs stems). |
| **Obsidian-Style Notes & 2D Canvas** | Timestamped Live-Preview Markdown notes with video frame capture, in-place freehand image cropping, and BiDi image alignment. Open `/canvas/:courseId` for 2D auto-organized Video Artboards (`Modules` / `Rows` / `Masonry`), chronological arrows, `Alt+Drag` duplication, `Ctrl+C`/`V`, `10%–300%` SVG dot grid, and `perfect-freehand` ink. |
| **Learning OS & Privacy** | Multi-course prerequisite Roadmaps, calendar Watch History, tag-weighted Statistics & streaks, 6 OKLCH theme presets (`Light`/`Dark`/`System`), and full JSON workspace export/import. |

<!-- Screenshot slots: add exported PNGs under docs/screenshots/ and uncomment when ready:
<p align="center">
  <img src="./docs/screenshots/player-notes.png" alt="TutIn Study Player and Rich Notes" width="49%" />
  <img src="./docs/screenshots/course-canvas.png" alt="TutIn 2D Course Notes Canvas" width="49%" />
</p>
-->

---

## Portable Vault & Local AI

Every local course folder stays self-contained inside `<courseFolder>/.tutin/`—copy a course folder to another machine and your notes, screenshots, subtitles, dubbed `.mp3` tracks, generation `.meta.json` sidecars, and whiteboard `canvas.json` travel right along with it.

```text
<courseFolder>/.tutin/
├── notes/          # Markdown/JSON notes + deduplicated screenshots/
├── subtitles/      # Two-origin (.vtt) subtitles + .meta.json provenance sidecars
├── dubs/           # Dubbed .mp3 tracks + cached instructor _voice_profile/
├── summaries/      # Course summary markdown files
└── canvas.json     # 2D Course Notes Canvas v2 snapshot
```

---

## Quick Start

**Prerequisites:** **Node.js 18+ LTS** *(optional: Python 3.10–3.11 + FFmpeg for local Whisper/XTTS/Demucs AI)*.

### Option A — Windows One-Click Launcher
Double-click [`start-dev.bat`](./start-dev.bat). It checks Node.js, installs missing workspace packages automatically, launches Express (`:9474`) + Vite (`:5173`), and opens your browser.

### Option B — Manual CLI
```sh
git clone https://github.com/noureldenadel/TutIn.git
cd TutIn
npm install && npm --prefix server install && npm --prefix client install
npm start
```

<details>
<summary><strong>Optional: Enable Python AI Sidecar (Faster-Whisper, XTTS-v2 Voice Cloning & Demucs)</strong></summary>

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r server/python/requirements.txt
```
See [`docs/INSTALLATION.md`](./docs/INSTALLATION.md) for NVIDIA CUDA PyTorch wheels, FFmpeg detection, API keys, production mode (`npm run build && npm run start:prod`), and environment variables.

</details>

---

## Documentation

| Guide | Covers |
|---|---|
| [`docs/INSTALLATION.md`](./docs/INSTALLATION.md) | Full manual install, Python `.venv` & CUDA setup, env vars, and troubleshooting |
| [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) | Walkthrough of library intake, player shortcuts, rich notes, 2D Canvas, and backups |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Express 5 + SQLite (`001`–`009`) schema, API routes, `.tutin/` vault, and FastAPI AI pipeline |
| [`docs/UI_UX_SYSTEM.md`](./docs/UI_UX_SYSTEM.md) | OKLCH theme tokens, copy economy, and UI/UX decision history |
| [`client/README.md`](./client/README.md) | Frontend route map, folder layout, and client dev scripts |
| [`CHANGELOG.md`](./CHANGELOG.md) | Full version history and `v8.0 Beta` (`8.0.0-beta`) release notes |

---

<div align="center">
  MIT License · Copyright © 2026 <a href="./LICENSE">noor</a>
</div>
