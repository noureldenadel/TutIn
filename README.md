# TutIn v7

Local-first desktop web workstation for organizing, studying, and annotating local video courses, YouTube playlists, Google Drive collections, and external course links.

> [!NOTE]
> AI speech-to-text transcription (Python `faster-whisper` + Silero VAD with automatic WebGPU/WASM browser fallback), 29-language subtitle translation (offline `Xenova/nllb-200-distilled-600M` worker + OpenRouter dialect translation for Egyptian & Saudi Arabic), clause-level cue normalization, dual-engine AI voice dubbing (fast `edge-tts` neural voices + local Coqui `XTTS-v2` instructor voice cloning with course-level voice profiles and selectable `Auto-duck` / `Separate music` background modes), and two-origin (`Uploaded` vs `AI`) multi-track subtitle management (`Master` & `Source` selection) are active across the Video Player, Curriculum Manager, and Settings (`AI & APIs` / `Voice` tabs). AI lecture summarization remains deferred to a future phase.

## Quick Start

### Windows Launcher
Double-click [`start-dev.bat`](./start-dev.bat) in the repository root:
- Checks for Node.js and npm.
- Installs missing dependencies in the root workspace, `server/`, and `client/`.
- Launches the Express + SQLite backend (`127.0.0.1:9474`) and Vite SPA client (`127.0.0.1:5173`) concurrently and opens your browser.

### Manual CLI
```sh
npm start
```

Available npm scripts in `package.json`:
- `npm start` — Starts `server/` (`:9474`) and `client/` (`:5173`) concurrently.
- `npm run server` / `npm run server:dev` — Runs the Express backend standalone (or with `--watch`).
- `npm run client` — Runs only the Vite client dev server (proxies `/api` and `/video` to `VITE_API_TARGET` or `http://127.0.0.1:9474`).
- `npm run build` — Builds the client SPA bundle into `client/dist`.
- `npm run start:prod` — Serves the built SPA directly from Express on `127.0.0.1:9474`.
- `npm run typecheck` — Runs `tsc --noEmit` in `client/`.
- `npm run lint` — Runs ESLint in `client/`.

## Directory Structure

```text
.TutIn/
├── start-dev.bat            # Windows one-click launcher (install check + start + browser launch)
├── package.json             # TutIn v7.0.0 workspace scripts
├── CHANGELOG.md             # Release notes & version history for TutIn v7
├── server/                  # Express 5 + SQLite (sql.js) API & range-request video server (:9474)
│   ├── index.js             # Entry point, /api/health (7.0.0), static SPA serving, route mounting
│   ├── database.js          # SQLite persistence in %APPDATA%/TutIn/tutin.db (or TUTIN_DATA_DIR), migrations 001–008
│   ├── routes/              # REST API routes (/api/courses, /api/notes, /api/canvas, /api/transcripts, /api/dub, ...)
│   ├── services/            # Course folder scanner, video range streamer, Python AI sidecar client, path repair
│   ├── python/              # FastAPI AI sidecar (:9475) for Edge-TTS neural & XTTS-v2 voice dubbing, Demucs & Faster-Whisper
│   └── utils/               # Caption parser, .tutin vault helpers, centralized AI model manager, MP4/TS duration & FFmpeg helpers
├── client/                  # Vite 8 + React 19 + TanStack Router + Tailwind v4 SPA (:5173)
│   ├── README.md            # Frontend module & route quick reference
│   └── src/
│       ├── components/      # canvas/, layout/, modals/, notes/, pages/, player/, shared/, ui/
│       ├── lib/             # API helpers, domain state hooks, settings sync, SVG artwork engine
│       └── routes/          # TanStack Router SPA routes (/, /learn/$courseId, /canvas/$courseId, ...)
└── docs/
    ├── USER_GUIDE.md        # User manual & keyboard shortcut guide
    ├── ARCHITECTURE.md      # Backend/frontend architecture, database migrations & .tutin vault spec
    └── UI_UX_SYSTEM.md      # Living UI/UX design system and decision log
```

## Documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — Version history for TutIn v7.
- [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) — Walkthrough of course intake, playback, notes, canvas whiteboards, analytics, and backups.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Database schema (`001`–`008`), API routes, `.tutin/` vault layout, and sync architecture.
- [`docs/UI_UX_SYSTEM.md`](./docs/UI_UX_SYSTEM.md) — OKLCH design tokens, component conventions, and UI decision log.
- [`client/README.md`](./client/README.md) — Client route map and frontend development scripts.
