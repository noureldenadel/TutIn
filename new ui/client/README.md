# TutIn v6 Study Companion (`new ui/client`)

Local-first Vite + React + TanStack Router SPA client powered by the Express + SQLite backend in `new ui/server/` (v6.0.0).

## Directory Structure

```text
new ui/
├── start-dev.bat            # Windows launcher for TutIn v6 (install check + server + client + browser)
├── CHANGELOG.md             # Release notes & version history for TutIn v6
├── server/                  # Express 5 + SQLite (sql.js) backend (:9474)
├── client/                  # Vite 8 + React 19 + TanStack Router SPA (:5173)
│   └── src/
│       ├── assets/          # Bundled static assets
│       ├── components/      # canvas/, layout/, modals/, notes/, pages/, player/, ui/
│       ├── lib/             # API client, domain state/events, settings hydration, SVG artwork engine
│       ├── routes/          # TanStack Router file-based SPA routes
│       ├── main.tsx         # Client entry point
│       ├── router.tsx       # Router & TanStack Query client setup
│       └── styles.css       # OKLCH tokens & Tailwind v4 CSS theme
└── docs/
    ├── USER_GUIDE.md        # User manual & keyboard shortcut guide
    ├── ARCHITECTURE.md      # Technical architecture, SQLite schema & .tutin vault design
    └── UI_UX_SYSTEM.md      # Living UI/UX design system specification
```

## Workspace Routes

- `/` — Course Library grid wired to SQLite (`/api/courses`) with Add/Edit Course modals, Folder & Vault Sync preview, Welcome Guide, Settings workspace, Show in Explorer, and resume cards
- `/learn/$courseId` — Course Player (`mp4`/`.ts` via `mpegts.js`, Browser PiP) with multi-module playlist, `.srt`/`.vtt` subtitles + Smart Captions batch import, and rich timestamped Notes (`.tutin/notes/screenshots/` via `/api/notes/media`, inline cropper, smart pause, and transcript autocomplete)
- `/canvas/$courseId` — Dedicated Course Notes Whiteboard Canvas persisted to SQLite (`migration007`) and `<course>/.tutin/canvas.json`, featuring lesson Video Artboards, chronological arrows, two-way synced note editing, deep-links back to lesson timestamps, and `perfect-freehand` drawing
- `/roadmap` — Multi-course learning pathway graph persisted to SQLite (`/api/roadmaps`) with direct mouse-wheel cursor zoom
- `/instructors` — Instructor directory and course views backed by SQLite (`/api/instructors`) with inline avatar uploads
- `/history` & `/analytics` — Watch history log (`/api/analytics/history`) with single/all clear actions and Statistics dashboard with tag-weighted study telemetry
- `/manage/$courseId` — Course curriculum manager, `.srt`/`.vtt` subtitle upload, and vault rescan trigger (AI transcription/dubbing actions are intentionally disabled pending rebuild)

## Development

Run the full stack from `new ui/` via `npm start`, or run client-only commands from `new ui/client/`:

```sh
cd "new ui/client"
npm run dev        # Vite dev server on http://localhost:5173 (proxies /api and /video -> VITE_API_TARGET || http://127.0.0.1:9474)
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run lint       # ESLint check
npm run build      # Production static SPA bundle in dist/
```
