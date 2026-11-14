# TutIn v6 (`new ui`) Technical Architecture

## System Overview

```mermaid
flowchart LR
    Client["React 19 + TanStack Router SPA (:5173)"] -->|"REST JSON /api/* & /video/*"| Server["Express 5 + sql.js Server (:9474)"]
    Server -->|"Migrations 001-007"| DB["SQLite (%APPDATA%/TutIn/tutin.db)"]
    Server -->|"Vault sync & streaming"| Vault["Course Folders (.tutin/ + local videos)"]
```

## Backend (`new ui/server`)

### Entry & Networking (`index.js`)
- Binds exclusively to `127.0.0.1` starting at `DEFAULT_PORT = 9474` (`findAvailablePort`), serving CORS-allowed localhost requests and range-requested video streams (`/video/*filePath`).
- In production (`client/dist/` present), serves the built SPA fallback directly on the backend port.

### Database & Migrations (`database.js`)
Uses `sql.js` persisted to `%APPDATA%/TutIn/tutin.db` (or `$TUTIN_DATA_DIR/tutin.db`):
- **001:** Core tables (`courses`, `modules`, `videos`, `notes`, `watch_sessions`, `analytics`, `instructors`, `roadmaps`, `settings`).
- **002–006:** Subtitle sources, `canvas_nodes`/`canvas_edges`/`canvas_viewports`, dubbed track columns, course language, and primary transcript tracking.
- **007 (Canvas v2):** Adds `canvas_groups` (video/custom artboards), `canvas_strokes` (freehand vector ink), `canvas_course_meta` (`dismissed_note_ids`, sync revision), and rich node/edge metadata (`origin_lesson_idx`, `origin_video_id`, `timestamp`, `membership_state`, `is_canvas_only`, `image_src`, `caption`, `accent_index`, `edge_kind`, `from_side`, `to_side`, `style`, `label`).

### API Surface (`server/routes/`)
- **`/api/courses`, `/api/modules`, `/api/videos`:** Course CRUD (`POST /api/courses` keeps `last_accessed_click_time` null until engaged), explicit engagement logging (`POST /api/courses/:id/access` for `'player'` or `'external'` visits), progress calculation (`videos` or `duration` mode via `/api/courses/recalculate-progress`), qualified history/resume updates (`PUT /api/videos/:id/progress` updates playback progress and only sets `videos.last_watched_at` and `courses.last_accessed` when `recordHistory === true`), folder scanning/resync (`services/courseScanner.js`), path relinking (`services/pathRepair.js`), custom thumbnail upload, and external URL metadata updates.
- **`/api/notes`:** Timestamped note CRUD (`formatNoteRow` returning both SQLite `snake_case` columns and normalized `camelCase` aliases + parsed `images`/`tags` arrays), `.tutin/notes/` vault JSON export sync, and screenshot storage (`POST /api/notes/media`, `GET /api/notes/media/:courseId/:filename` serving with `{ dotfiles: 'allow' }`) writing files into `<courseFolder>/.tutin/notes/screenshots/` (or AppData `screenshots/` fallback for non-folder courses).
- **`/api/canvas`:** Reads/writes Canvas v2 snapshots (`GET/PUT /api/canvas/:courseId`, `POST /api/canvas/:courseId/sync-notes`) across SQLite (`canvas_groups`, `canvas_nodes`, `canvas_edges`, `canvas_strokes`, `canvas_viewports`, `canvas_course_meta`), uses course-scoped Video Artboard IDs (`vgroup-${courseId}-${lessonIdx}`, normalizing legacy unscoped `vgroup-<n>` payloads on write to prevent global `canvas_groups.id` primary-key collisions), self-heals legacy `'canvas-only'` `membershipState` on video-linked cards, and syncs `<courseFolder>/.tutin/canvas.json`.
- **`/api/transcripts` & `/api/summaries`:** AI speech-to-text transcription (`POST /:videoId/transcribe` via Python `faster-whisper` + Silero VAD word timestamps with automatic browser WebGPU/WASM `whisper-worker.ts` fallback), 27-language subtitle translation (`POST /:videoId/translate` using offline `Xenova/nllb-200-distilled-600M` worker threads + OpenRouter sliding-window isochrony translation for `ar-eg` Egyptian and `ar-sa` Saudi dialects), clause-level cue normalization (`normalizeCuesIntoClauses`, `1.5s–6.5s`, max ~84 chars), strict `.tutin/captions/` two-origin (`Uploaded` vs `AI`) multi-version track storage (`<videoBase>[|-u<N>|-generated].<lang>.vtt`, IDs `<lang>:uploaded`, `<lang>:uploaded:<n>`, `<lang>:generated` — legacy `Captions/`, `.source.vtt`, `-uploaded.`, `.tts.json`, and `origin: 'existing'` shims removed), per-language `Master` (`POST /:videoId/set-master`) & translation `Source` (`POST /:videoId/make-source`) flags, exact-track deletion (`DELETE /:videoId?id=<trackId>`), smart batch-apply across sibling lessons, and reading/serving existing `.tutin/summaries/*.md` files.
- **`/api/dub`:** Dubbed audio discovery (`GET /video/:videoId/languages` checking `.tutin/dubs/<relModulePath>/<videoBase>.<lang>.mp3`, verified `dub_jobs`, and verified `videos.dubbed_tracks`) and HTTP `Range` (`206 Partial Content`) `audio/mpeg` playback (`GET /audio/:videoId?lang=`).
- **`/api/analytics` & `/api/roadmaps` & `/api/instructors`:** Watch-session logging, calendar history feed (`GET /api/analytics/history` scoping `_ext_mock` rows strictly to direct external-link courses rather than `youtube`/`google-drive` courses with URLs) & delete/clear endpoints (`DELETE /api/analytics/history*`), global roadmap CRUD, and persistent instructor avatar profiles.
- **`/api/settings` & `/api/data` & `/api/fs` & `/api/youtube` & `/api/search`:** Server-persisted app settings (`GET/PUT /api/settings`, `DELETE /api/settings/reset`), full SQLite + Canvas v2 JSON backup/restore (`/api/data/export`, `/api/data/import`, `/api/data/reset`, `/api/data/detect-durations`), native OS folder/image pickers & `Show in Explorer` (`POST /api/fs/open-folder`), YouTube playlist import & clause-normalized caption fetching (`GET /api/youtube/transcript`), and catalog search.

### Deferred Future Modules
OpenRouter note/lecture summarization and Python/CUDA XTTS voice dubbing generation routes remain deferred to a dedicated future phase (while playback switching for existing `.tutin/dubs/*.mp3` files is wired via `/api/dub` and `CoursePlayer`); the subtitle & translation pipeline (`normalizeCuesIntoClauses`, per-language `is_master`, and `durationSec` isochrony translation) is already structured to feed directly into future XTTS dubbing synthesis.

## Frontend (`new ui/client`)

- **Routing:** File-based TanStack Router SPA (`src/routes/`) with `autoCodeSplitting` (`/` library, `/learn/$courseId` player with `?lesson`, `?videoId`, `?t`, `?tab` deep-links, `/canvas/$courseId`, `/roadmap`, `/instructors`, `/history`, `/analytics`, `/manage/$courseId`).
- **Playback & Qualified Watch History:** HTML5 `<video>` paired with `mpegts.js` (`tsParser.js` + `videoStreamer.js`) for `.ts` MPEG-TS streams, YouTube `enablejsapi=1` `postMessage` playback state/time sync (`?start=` resume), Google Drive visibility-aware dwell tracking, and external-link bounce filtering (`src/lib/watch-history.ts`). Active engagement must cross `getHistoryThresholdSeconds(duration)` (up to `15s`, `3s`–`15s` scaled for short clips, `8s` off-tab sustain for external links) before committing Watch History or updating `last_accessed`, with `visibilitychange` + `pagehide` `keepalive` flushes.
- **State & Sync:**
  - `src/lib/courses.ts`, `course-lessons.ts`, `watch-history.ts`, `course-notes.ts`, `course-canvas.ts`: SQLite-backed hooks and custom window event buses (`tutin:courses_changed`, `tutin:course_updated`, `tutin:course_deleted`, `tutin:notes_changed`, `tutin:curriculum_changed`).
  - `src/lib/app-settings.ts`: Hydrates and debounces `AppSettings` (`theme`, `resumePlayback`, `autoMarkCompleteAt`, `progressCalculationMode`, `autoDetectThumbnails`, `playerShortcutsEnabled`, `welcomeGuideSeen`) against `/api/settings`, keeping lightweight localStorage mirrors strictly for instant startup styling/keys.
  - Note screenshots upload through `/api/notes/media` (keeping IndexedDB helpers in `media-store.ts` strictly for local blob image compression helpers and offline cleanup).

