# TutIn v8.0 Beta Study Companion (`client/`)

Local-first Vite + React + TanStack Router SPA client powered by the Express + SQLite backend in `server/` (`8.0.0-beta`).

## Directory Structure

```text
.TutIn/
├── start-dev.bat            # Windows launcher for TutIn v8.0 Beta (install check + server + client + browser)
├── CHANGELOG.md             # Release notes & version history
├── server/                  # Express 5 + SQLite (sql.js) backend (:9474) + FastAPI AI sidecar (:9475)
├── client/                  # Vite 8 + React 19 + TanStack Router SPA (:5173)
│   └── src/
│       ├── components/      # canvas/, layout/, modals/, notes/, pages/, player/, shared/, ui/
│       ├── lib/             # API client, domain state/events, settings hydration, SVG artwork engine
│       ├── routes/          # TanStack Router file-based SPA routes
│       ├── main.tsx         # Client entry point
│       ├── router.tsx       # Router & TanStack Query client setup
│       └── styles.css       # OKLCH tokens & Tailwind v4 CSS theme
└── docs/
    ├── INSTALLATION.md      # Full Node.js, Python .venv / CUDA & env setup guide
    ├── USER_GUIDE.md        # User manual & keyboard shortcut guide
    ├── ARCHITECTURE.md      # Technical architecture, SQLite schema & .tutin vault design
    └── UI_UX_SYSTEM.md      # Living UI/UX design system specification
```

## Workspace Routes

- `/` — Course Library grid wired to SQLite (`/api/courses`) with Add/Edit Course modals, Folder & Vault Sync preview, Welcome Guide, Settings workspace, Show in Explorer, and resume cards
- `/learn/$courseId` — Course Player (`mp4`/`.ts` via lazy `mpegts.js`, YouTube, Google Drive, Browser PiP, `Up next` autoplay countdown + readiness-gated transitions) with multi-module playlist, AI & manual subtitles + Smart Captions batch import, selectable/drag-copyable transcripts, dual-engine AI voice dubbing (`Off` / `Music & SFX`), and rich timestamped Notes (`.tutin/notes/screenshots/` via `/api/notes/media`, inline cropper, and smart pause)
- `/canvas/$courseId` — Dedicated Course Notes Whiteboard Canvas persisted to SQLite (`migration008`) and `<course>/.tutin/canvas.json`, featuring lesson Video Artboards, chronological arrows, two-way synced note editing, deep-links back to lesson timestamps, and `perfect-freehand` drawing
- `/roadmap` — Multi-course learning pathway graph persisted to SQLite (`/api/roadmaps`) with direct mouse-wheel cursor zoom
- `/instructors` — Instructor directory and course views backed by SQLite (`/api/instructors`) with inline avatar uploads
- `/history` & `/analytics` — Watch history log (`/api/analytics/history`) with single/all clear actions and Statistics dashboard with tag-weighted study telemetry
- `/manage/$courseId` — Course curriculum manager, bulk AI transcription/translation/dubbing, `.srt`/`.vtt` subtitle upload, and vault rescan trigger

## Development

Run the full stack from the repository root via `npm start`, or run client-only commands from `client/`:

```sh
cd client
npm run dev        # Vite dev server on http://127.0.0.1:5173 (proxies /api and /video -> VITE_API_TARGET || http://127.0.0.1:9474)
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run lint       # ESLint check
npm run build      # Production static SPA bundle in dist/
```
