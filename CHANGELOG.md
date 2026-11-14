# Changelog

## [Unreleased]

### Added & Changed
- **Non-Blocking Subtitle Generation: Inline Sidebar Composer, Separate `Master` + `Source` Badges, In-Dropdown Shimmer Placeholder & Multi-Color Top-Left `DotLogo` Activity LED (`new ui/client/src/components/layout/dot-logo.tsx`, `new ui/client/src/components/layout/app-shell.tsx`, `new ui/client/src/components/player/course-player.tsx`, `new ui/client/src/components/player/curriculum-manager.tsx`, `new ui/client/src/components/modals/transcript-translate-modal.tsx`, `new ui/client/src/styles.css`, `new ui/server/routes/transcripts.js`):**
  - Added `variant="inline"` to `TranscriptTranslateModal` and rendered it directly inside `TranscriptTab` (`CoursePlayer`) so opening `Generate / translate…` expands an inline card in the right sidebar without a full-screen dialog backdrop over the video player, and closes immediately when a job starts.
  - Restored distinct `Master` (`POST /api/transcripts/:videoId/set-master`) and `Source` (`POST /api/transcripts/:videoId/make-source`) badges and clickable dashed placeholders inside the Subtitles dropdowns across `CoursePlayer` and `CurriculumManager`.
  - Upgraded `DotLogo` with size variants (`xs`, `sm`, `md`, `lg`) and multi-color OKLCH 3D spherical wave (`mode="thinking"`) + radial celebration ripple (`mode="celebrate"`), paired with `.ai-shimmer-text`, `.ai-shimmer-row`, and `.t-resize` (`cubic-bezier(0.22, 1, 0.36, 1)`) in `styles.css`.
  - Replaced the standalone progress banner in `TranscriptTab` with a full-button shimmer animation on the Subtitles dropdown trigger and an in-dropdown shimmering placeholder row (`{Language} · AI`) with a bottom gradient progress hairline, click-to-reopen inline panel, and inline `X` cancel button (without extra trigger pills or mini matrix icons).
  - Connected the top-left `IconDock` `DotLogo` (`app-shell.tsx`) to `useTranscriptJobs` so background jobs animate the top-left LED across all tabs and routes, expose a hover/click progress popover with per-job jump links and cancel buttons, and pulse `mode="celebrate"` when all jobs finish.
- **Transcript Tab Dub Track Dropdown, Unified `Subtitles` Terminology, Anti-Drag Guards & Animated Theme Switching (`new ui/client/src/components/player/course-player.tsx`, `new ui/client/src/components/player/curriculum-manager.tsx`, `new ui/client/src/components/modals/transcript-translate-modal.tsx`, `new ui/client/src/components/modals/smart-captions-modal.tsx`, `new ui/client/src/components/modals/sync-preview-modal.tsx`, `new ui/client/src/components/modals/add-course-modal.tsx`, `new ui/client/src/lib/transcript-ai.ts`, `new ui/client/src/components/layout/app-shell.tsx`, `new ui/client/src/components/layout/course-thumbnail.tsx`, `new ui/client/src/components/layout/instructor-avatar.tsx`, `new ui/client/src/styles.css`, `new ui/server/routes/dubbing.js`):**
  - Removed the `Translate / AI` and `Summary` button row inside `TranscriptTab` (`CoursePlayer`) and added a second full-width **Dub / Audio Track** dropdown (`Mic` icon, `Original audio` + `${Language} · Dub` with inline `Trash2` track deletion backed by `DELETE /api/dub/video/:videoId?lang=...`) directly below the **Subtitles** track dropdown.
  - Unified mixed `Captions`, `Transcripts`, and `Subtitles` terminology across modals, menus, empty states, and progress/toast messages under `Subtitles` (with `Transcribe` and `Translate` as the two AI action verbs in `TranscriptTranslateModal` and `CurriculumManager`).
  - Prevented accidental ghost-image dragging and text selection across `CourseCard`, `CourseThumbnail`, `InstructorAvatar`, the `CoursePlayer` video stage/overlays, and interactive UI controls (`-webkit-user-drag: none`, `draggable={false}`, `onDragStart` prevention, and `user-select: none`).
  - Added smooth dark/light mode transitions (`html.theme-transitioning` `280ms cubic-bezier(0.22, 1, 0.36, 1)` surface/border/text/fill interpolation + `300ms` rotating/scaling `Sun`/`Moon` icon morph in `IconDock`).
- **Two-Column Player Audio & Subtitles Menu + Dubbed Audio Playback (`new ui/server/routes/dubbing.js`, `new ui/server/index.js`, `new ui/client/src/components/player/course-player.tsx`):**
  - Replaced the single-column player Audio & Subtitles dropdown with a side-by-side two-column `Popover` (`Audio` | `Subtitles`, independent scrollable lists) restricted strictly to switching audio (`Original` + available dubbed languages) and subtitle (`Off` + available tracks) playback, removing `Generate / translate…` and `Import subtitles…` from the video player bar while keeping them in `TranscriptTab` and `CurriculumManager`.
  - Added `/api/dub` (`GET /video/:videoId/languages` and HTTP `Range`-capable `GET /audio/:videoId?lang=`) backed by `.tutin/dubs/` vault discovery (`listDubLanguages`, `getDubFilePathForPlayback`), `dub_jobs`, and `videos.dubbed_tracks`, plus synchronized `<audio>` playback in `CoursePlayer` (auto-muting original `<video>` audio and syncing play, pause, buffering, seek, playback speed, mute/volume, and drift correction).
  - Removed the `Copy transcript` action from `TranscriptTab`'s track options menu in `CoursePlayer`.
- **Unified `Source` Badge, Inline Dropdown Track Actions & `Subtitles` Trigger Icon (`new ui/client/src/components/player/course-player.tsx`, `new ui/client/src/components/player/curriculum-manager.tsx`, `new ui/client/src/components/modals/transcript-translate-modal.tsx`, `new ui/server/utils/courseAssets.js`, `new ui/server/routes/transcripts.js`):**
  - Replaced `Globe2` with `Subtitles` on the `TranscriptTab` track selector, removed the external 3-dot (`MoreVertical`) menu and `.srt` download links across `TranscriptTab` and `CurriculumManager`, and moved per-track actions directly into the right side of each dropdown row (`Source` badge / clickable dashed `Source` placeholder + `Trash2` delete button).
  - Unified `Master` and `Source` in the UI into a single `Source` indicator (`normalizeSubtitleSources` always assigns a default `is_ai_source`, and `POST /:videoId/make-source` also marks the selected track `is_master: true` for its language).

### Fixed
- **Crash-Safe Translation Cancellation via Isolated Child Process (`new ui/server/utils/aiTranslation.js`, `new ui/server/workers/translationWorker.js`):**
  - Replaced `worker_threads.Worker` + `worker.terminate()` with an isolated `child_process.fork` process using IPC (`process.send` / `process.on('message')`), so cancelling NLLB-200 / `onnxruntime-node` mid-inference never tears down native ONNX C++ threads inside the Express host process (`3221226505` / `0xC0000409` server exit).
- **AI Transcription Progress, Completion Auto-Selection, Modal Auto-Close & GPU Lock (`new ui/client/src/lib/transcript-ai.ts`, `new ui/client/src/components/modals/transcript-translate-modal.tsx`, `new ui/client/src/components/player/course-player.tsx`, `python/dubbing_server.py`):**
  - Propagated `{ trackId, targetLang }` in `notifyTranscriptUpdated` and deferred queued track selection in `CoursePlayer` via `pendingTrackSelectionRef` so completed AI transcripts/translations deterministically switch the active player and transcript track to `<lang>:generated` instead of staying on an existing `<lang>:uploaded` Master track.
  - Added single-lesson modal auto-close on job completion (`sawActiveJobRef` in `TranscriptTranslateModal`), completion/error toast notifications in `processQueueLoop`, and progressive status updates (`15% -> 88%`) during backend `faster-whisper` requests.
  - Added `WHISPER_LOCK` (`threading.Lock()`) around `get_faster_whisper_model` and `transcribe_media` in `python/dubbing_server.py` so concurrent `/transcribe` requests serialize cleanly instead of racing on HuggingFace model downloads or CUDA initialization.
  - Fixed `POST /api/transcripts/:videoId/translate` in `new ui/server/routes/transcripts.js` listening to `res.on('close')` instead of `req.on('close')` (which in Node 18+/24 fires immediately after `express.json()` consumes the `POST` body and falsely aborted `translateChunks` with `Translation cancelled by user`), added a `settled` guard around worker termination in `new ui/server/utils/aiTranslation.js`, and moved `writeAppSettings(next)` outside the `setSettings(prev => ...)` render updater in `SettingsModal` (`new ui/client/src/components/modals/settings-modal.tsx`).
- **FFmpeg Virtualenv Resolution & 16kHz Transcription Audio Extraction (`new ui/server/utils/ffmpeg.js`, `new ui/server/routes/videos.js`, `new ui/server/services/dubbingService.js`, `python/dubbing_server.py`, `new ui/client/src/lib/transcript-ai.ts`):**
  - Fixed `getFfmpegPath()` resolving `.. / ..` (`new ui/`) instead of the workspace root `.venv/Lib/site-packages/imageio_ffmpeg/binaries`, and updated `/transcribe` in `python/dubbing_server.py` to call `get_ffmpeg_bin()` instead of bare `"ffmpeg"`.
  - Deferred `200 audio/wav` response headers in `GET /api/videos/:id/audio-16k` until FFmpeg outputs audio bytes so spawn or decoding failures return a structured `500` error, extended `ensureServiceRunning()` cold-boot wait to `60s`, and surfaced server extraction error details in `extract16kAudioFromServer`.
- **Opaque `TranscriptTranslateModal` Surface & Tokens (`new ui/client/src/components/modals/transcript-translate-modal.tsx`):**
  - Replaced unmapped legacy color/border/shadow classes (`bg-bg-elevated`, `bg-bg-surface`, `bg-bg-primary`, `bg-bg-hover`, `border-border-default`, `border-border-subtle`, `text-text-*`, `bg-accent-amber`, `shadow-modal`) with TutIn's active OKLCH semantic tokens (`bg-card`, `bg-secondary/*`, `border-border/50`, `bg-primary`/`bg-primary-soft`, `shadow-workspace`) and shared `<Button>`, `<DialogHeader>`, and `<DialogDescription>` primitives so the dialog, `<Select>` dropdowns, and `Generate` / `Translate` buttons render opaquely with readable contrast in both dark and light themes.

### Removed & Fixed
- **Legacy Caption Compatibility Removal & Vault/DB Migration (`new ui/server/utils/captionParser.js`, `new ui/server/utils/courseAssets.js`, `new ui/server/services/courseScanner.js`, `new ui/server/routes/transcripts.js`, `D:\Master Classes\**\.tutin\captions`, `%APPDATA%/TutIn/tutin.db`):**
  - Removed legacy `Captions/` directory fallbacks, `.source.vtt` / `-uploaded.` / `.tts.json` sidecar handling, and `origin: 'existing'` DB migration shims so backend caption discovery operates strictly on `.tutin/captions/<videoBase>[|-u<N>|-generated].<lang>.vtt` with sibling subtitle files clause-normalized on import (`normalizeCuesIntoClauses`).
  - Fixed `extractLangCode` diacritic folding and endonym recognition (`Deutsch`, `Español`, `Français`, `Italiano`, `Português`, `deu`) while preserving trailing-suffix matching to prevent video-title words (`"Acerca de"`, `"Modelado en"`, `"El corte"`) from being misdetected as ISO language codes.
  - Migrated existing courses under `D:\Master Classes` and SQLite (`tutin.db`, backed up to `tutin.db.pre-caption-migration.bak`): removed `5` byte-identical legacy `Captions/`/`captions/` directories, deleted `3` obsolete `.tts.json` sidecars and `10` duplicate `.source.vtt` files, converted `10` word-per-cue `.source.vtt` transcripts to clause-grouped `-generated.en.vtt`, renamed `10 - Diseña tu propio proceso creativo.ar.vtt` to `-generated.ar.vtt`, rescued mislabeled Spanish cues in `Mobiliario` lesson `001`, imported `27` `origin: 'existing'` sibling tracks into `.tutin/captions/`, and updated `108` DB video rows (`121` verified tracks across `66` videos).

### Added
- **Clickable Instructor Profile Links (`new ui/client/src/components/layout/app-shell.tsx`, `course-player.tsx`, `curriculum-manager.tsx`):**
  - Made the instructor avatar + name a direct `<Link to="/instructors" search={{ instructor: normalizeInstructorSlug(course.instructor) }}>` across `CourseCard` (`relative z-20` above the card link overlay), `CoursePlayer`, and `CurriculumManager`.

### Added & Changed
- **AI Transcript Generation, Clause-Level Subtitle Translation & Multi-Track Management (`new ui/server/routes/transcripts.js`, `new ui/server/utils/courseAssets.js`, `new ui/server/utils/aiTranslation.js`, `new ui/server/workers/translationWorker.js`, `new ui/server/services/dubbingService.js`, `new ui/server/services/courseScanner.js`, `new ui/client/src/lib/transcript-ai.ts`, `new ui/client/src/lib/whisper-worker.ts`, `new ui/client/src/lib/languages.ts`, `new ui/client/src/components/modals/transcript-translate-modal.tsx`, `new ui/client/src/components/player/course-player.tsx`, `new ui/client/src/components/player/curriculum-manager.tsx`, `new ui/client/src/components/modals/settings-modal.tsx`):**
  - Restored and refined AI speech-to-text transcription (`POST /api/transcripts/:videoId/transcribe` with backend `faster-whisper` + Silero VAD word timestamps and automatic WebGPU/WASM `whisper-worker.ts` fallback) and 27-language subtitle translation (`POST /api/transcripts/:videoId/translate` using offline `Xenova/nllb-200-distilled-600M` worker threads + OpenRouter sliding-window isochrony translation for `ar-eg` Egyptian and `ar-sa` Saudi dialects).
  - Replaced legacy 1.5 GB BERT punctuation models with zero-weight acoustic pause + discourse marker clause normalization (`normalizeCuesIntoClauses`, `1.5s–6.5s`, max ~84 chars) ready for both subtitles and future XTTS voice dubbing.
  - Simplified track origins strictly to `Uploaded` vs `AI` (copying pre-existing course folder captions into `.tutin/captions/` as `origin: 'uploaded'`), always displaying explicit origin labels (`English · Uploaded`, `English · Uploaded #2`, `English · AI`, `Arabic · AI`), supporting multiple uploaded versions per language (`<lang>:uploaded:<n>`) alongside a single regenerable AI slot (`<lang>:generated`), and enforcing per-language `is_master` (with automatic promotion on delete) plus `is_ai_source` translation source selection (`POST /:videoId/set-master`, `POST /:videoId/make-source`, `DELETE /:videoId?id=<trackId>`).
  - Wired single-lesson and batch background transcription/translation queues (`TranscriptTranslateModal`, `useTranscriptJobs`), track management menus, and live progress/cancel controls across `CoursePlayer`, `CurriculumManager`, and `SettingsModal` (`AI` tab).

### Added & Fixed
- **Qualified Watch History Across Local, YouTube, Google Drive & External Courses (`new ui/client/src/lib/watch-history.ts`, `course-player.tsx`, `app-shell.tsx`, `history-page.tsx`, `course-lessons.ts`, `courses.ts`, `new ui/server/routes/videos.js`, `courses.js`, `analytics.js`):**
  - Decoupled resume position updates from watch history stamps (`recordHistory` gate in `PUT /api/videos/:id/progress`) and added `POST /api/courses/:id/access`, stopped setting `last_accessed_click_time` when creating new courses, and scoped `/api/analytics/history` `_ext_mock` entries strictly to external-link courses.
  - Fixed `progressSaveTimerRef` initial zero bug, excluded pause/buffer/seek time from active playback accumulation, enforced `getHistoryThresholdSeconds(duration)` (`3s`–`15s` scaled, `10s` fallback), and flushed progress reliably with `visibilitychange` + `pagehide` `keepalive`.
  - Replaced YouTube & Google Drive `iframe onLoad` writes with YouTube `enablejsapi=1` `postMessage` playback tracking (`?start=` resume + `autoMarkCompleteAt`) and visibility-aware Drive dwell tracking, plus `8s` external-link bounce filtering (`trackExternalCourseOpen`) across `CourseCard`, `CourseMenu`, `HistoryRow`, and `CoursePlayer`.

### Fixed & Changed
- **Side-by-Side Canvas `Reset arrangement` & Freeform Zone Coexistence (`new ui/client/src/lib/course-canvas.ts`, `%APPDATA%/TutIn/tutin.db`, `Domestika/.tutin/canvas.json`):**
  - Fixed the stale group-reference mutation bug in `tidyAllCanvasArtboards` (where calling `tidyVideoArtboard` inside the `ordered` loop cloned `next.groups` after the first Artboard, leaving subsequent Artboards at their old positions) and reflowed all Artboards before running `fitArtboardsToChildren` so un-reflowed columns never stretch (`width: 754, y: -201`) to wrap stale card coordinates.
  - Arranged all Video Artboards strictly side-by-side (`y = 96`, `52px` gap) in chronological `lessonIdx` order without mid-row gaps, pruned empty legacy `cnode_group_*` shells, kept non-colliding loose user cards/strokes in place, and shifted any colliding loose cards or unparented strokes into a clean Freeform Zone immediately to the right of the Artboards.
  - Repaired *Design Your Own Creative Process* (`M1L3`–`M1L7` aligned side-by-side at `x = 80, 472, 864, 1256, 1648, y = 96`, with the user's standalone note and image placed cleanly at `x = 2040`).

### Changed & Fixed
- **Course Card Top-Right Frosted 3-Dots Menu (`new ui/client/src/components/layout/app-shell.tsx`):**
  - Returned `CourseCard`'s `CourseMenu` trigger (`MoreVertical`) to the top-right thumbnail corner (`top-3 right-3`) styled as translucent frosted glass (`bg-card/85 dark:bg-white/15 backdrop-blur-md`, visible on hover/focus/open) so thumbnails avoid dark black corner blocks and card titles use full width.
  - Configured `<DropdownMenu modal={false}>` with `data-menu-open` continuity so clicking the menu never drops `:hover` via `body` pointer-lock and `Escape` never re-triggers card hover transitions.

### Fixed
- **Persistent Root `AppShell` & Continuous Nav Rail Transitions (`new ui/client/src/routes/__root.tsx`, `new ui/client/src/routes/*.tsx`, `new ui/client/src/components/layout/app-shell.tsx`):**
  - Lifted `<AppShell>` into `routes/__root.tsx` around `<Outlet />` and exported `HomePage` for `routes/index.tsx`, keeping `IconDock` persistently mounted across route transitions and removing the `lastSettledNavIndex` + `requestAnimationFrame` remount workaround that caused nav slide animations to stop after the first cached route transition per reload.

### Changed
- **Flat Thumbnails, Optional Instructors & Renamed Course Sort Options (`new ui/client/src/`):**
  - Removed bottom dark gradient scrims from `CourseThumbnail` and `CourseCard`, leaving covers completely clean at rest with only hover `bg-black/30` dimming.
  - Preserved blank `instructor: ""` in `mapApiCourse`, local folder import, and `AddCourseModal` instead of injecting `"Instructor"` / `"External"` / `"Self-paced"`, and omitted the instructor avatar/name row in `CourseCard`, `CoursePlayer`, `CurriculumManager`, and `RoadmapPage` when a course has no instructor (aligning card progress bars with `flex h-full flex-col` + `mt-auto pt-5`).
  - Renamed course sorting choices (`COURSE_SORT_OPTIONS`) to `["Recent", "Progress", "A–Z"]`.

### Changed & Fixed
- **Animated Left Nav Transitions, `HH:MM:SS` Duration Tags & Course Card Menu (`new ui/client/src/`):**
  - Animated `IconDock` route switching (`app-shell.tsx`, `styles.css`) using a shared `translate3d` sliding active pill + side bar across route mounts paired with directional `<main>` page transitions and reduced-motion support.
  - Added `formatDurationClock` (`format.ts`, `courses.ts`) so course duration tags display `02:33:00` (`HH:MM:SS`) instead of `2h 33m`, and centered thumbnail time tags vertically (`inline-flex h-5 items-center justify-center` + `.duration-badge-text`) in `CourseCard`, `RoadmapPage`, and `HistoryPage`.
  - Moved `CourseCard`'s 3-dot `CourseMenu` (`MoreVertical`) into the title row off the thumbnail and held `data-menu-open` across menu open/close animations to prevent hover drop and `Escape` re-hover flicker.

### Changed
- **Canvas Reset Arrangement Button (`new ui/client/src/lib/course-canvas.ts`, `new ui/client/src/components/canvas/canvas-hud.tsx`, `new ui/client/src/components/canvas/course-canvas-page.tsx`):**
  - Repurposed the HUD `<RotateCcw />` button from duplicate `Reset view` (retained on clicking the `{zoom}%` readout) to `Reset arrangement` (`resetCanvasArrangement`), returning all on-canvas course video cards back to their origin Video Artboards sorted chronologically by timestamp and realigning Artboards (`tidyAllCanvasArtboards`, Undo-supported) while height-aware `advancePastOverlappingCards` keeps ungrouped canvas cards uncovered.

### Fixed
- **Chronological Canvas Artboards, Return/Restore Timestamp Reflow & Course-Scoped Group IDs (`new ui/client/src/lib/course-canvas.ts`, `new ui/client/src/components/canvas/course-canvas-page.tsx`, `new ui/server/routes/canvas.js`):**
  - Scoped Video Artboard IDs by course (`vgroup-${courseId}-${lessonIdx}`) and migrated legacy unscoped `vgroup-<n>` IDs in `reconcileCanvasWithNotes` and `writeCanvasPayloadToDb` (`routes/canvas.js`) to eliminate SQLite `canvas_groups.id` primary-key collisions across courses.
  - Updated `createVideoArtboardGroup`, `tidyAllCanvasArtboards`, `returnCardToOriginGroup`, and `restoreNoteCardToCanvas` so earlier-lesson Artboards insert chronologically left-to-right, returned/restored cards reflow `'auto'` Artboards by timestamp instead of appending out of order, ungrouped cards are never overlapped, and untouched legacy v1 `cnode_*` columns auto-seat into sorted Artboards.
  - Repaired persisted SQLite + `.tutin/canvas.json` state for *MographPlus* (`11` Artboards `M1L2`–`M2L8`, all `30` cards seated) and *Domestika - Design Your Own Creative Process* (`1` preserved custom Artboard + `3` preserved user cards + `29` seated v1 cards across `5` Artboards `M1L3`–`M1L7`; pre-repair backup saved at `tutin.db.pre_canvas_order_bak`).

### Fixed & Changed
- **Canvas Pan Crash Fix & Minimal Notes Empty State (`new ui/client/src/components/canvas/course-canvas-page.tsx`, `new ui/client/src/components/player/course-player.tsx`):**
  - Fixed `TypeError: Cannot read properties of null (reading 'origPanX')` in `CourseCanvasPage.handleStagePointerMove` by reading `panGestureRef.current` and calculating `nextPanX`/`nextPanY` outside the asynchronous `setCanvasState` updater so clearing `panGestureRef.current` on `pointerup` cannot trigger a crash.
  - Removed the redundant `Add note` button from the `"No notes yet."` empty state in `CoursePlayer`'s `NotesTab`.

### Fixed & Changed
- **Canvas Image Serving (`dotfiles: allow`), `Â·` Mojibake, Artboard Auto-Containment & `M{m}L{l}` Module Labels (`new ui/server/routes/notes.js`, `new ui/client/src/lib/course-canvas.ts`, `new ui/client/src/components/canvas/`):**
  - Fixed `GET /api/notes/media/:courseId/:filename` rejecting `.tutin` vault paths by passing `{ dotfiles: 'allow' }` to `res.sendFile`, and fixed double-encoded UTF-8 strings (`Â·`, `â€¦`) in `canvas-card.tsx`.
  - Fixed Artboards failing to fit contained/edited/resized/image-loaded cards via shared `fitArtboardsToChildren`, `applyCardHeightUpdate`, and card `ResizeObserver`, enabled 1-click `Return` to auto-create missing lesson Artboards (`createVideoArtboardGroup`), and updated `findNextColumnX` so new Artboards don't spawn underneath detached cards.
  - Replaced flat `L{n}` labels with module-scoped `M{m}L{l}` identifiers (`formatCanvasLessonCode`, `formatCanvasArtboardTitle`) across Canvas cards, Artboard headers, Notes Drawer, and image lightbox labels with module-name hover tooltips.

### Fixed
- **Legacy Note Compatibility, Height Estimation & Canvas v2 Vault Repair (`new ui/server/`, `new ui/client/src/lib/`):**
  - Normalized `snake_case`/`camelCase` fields in `/api/notes` (`notes.js`) and `mapApiNoteRow` (`course-notes.ts`) with `appendMissingImagesToHtml` fallback so legacy notes always resolve to their true lesson index (`videoId` / `lessonIdx`) instead of `L1`.
  - Fixed legacy video-linked card membership healing (`'auto'` / `'reassigned'` / `'detached'` in `canvas.js` & `course-canvas.ts`), upgraded `estimateVideoNoteCardHeight` for multi-image and block-rich notes (`172px/image`, `[128, 2200]` px), and triggered Artboard reflow on height growth.
  - Migrated `tutin.db` (`48.46 MB` → `10.66 MB`, backup at `tutin.db.pre_note_upgrade_bak`) and all `10` active course `.tutin/` vaults by extracting `201` screenshots (`12.74 MB`) into `.tutin/notes/screenshots/` (`/api/notes/media/...`), updating `Cinema 4D Basecamp`'s renamed `folder_path`, and repairing `MographPlus` and `Domestika` Canvas v2 records and `.tutin/canvas.json` files.

### Fixed
- **Home Library `In Progress` & `Completed` Status Filters (`new ui/client/src/components/layout/app-shell.tsx`, `new ui/client/src/lib/courses.ts`):**
  - Excluded `0%` unstarted courses from the `In Progress` tab by requiring `course.completionPercentage > 0 || course.completedVideos > 0` while remaining `< 100%`.
  - Aligned `Completed` filtering, `CourseCard.isComplete`, and `mapApiCourse.progress` strictly with `course.completionPercentage >= 100` so float-capped incomplete courses (e.g., `99.9%`) do not falsely show as `100%` completed.

### Changed
- **Unified Desaturated Emerald (`chart-4`) & Player `Manage` Placement (`new ui/client/`):**
  - Replaced all saturated Tailwind `emerald-*` classes across `AnalyticsDashboard`, `AppShell`, `CoursePlayer`, `AddCourseModal`, `SettingsModal`, and `SyncPreviewModal` with `chart-4` (`text-chart-4`, `bg-chart-4/*`) so the entire app matches the desaturated emerald checkmark color.
  - Replaced `PlaylistTab`'s `Manage lessons` toggle (`Mark done` / `Reset`) in `course-player.tsx` with the `/manage/$courseId` `Manage` curriculum link (removing the duplicate course-header `Manage` button).

### Removed
- **Roadmap Toolbar `+ New` Button (`new ui/client/src/components/pages/roadmap-page.tsx`):**
  - Removed the redundant `+ New` button from the top-right Roadmap header; roadmaps are created via `+ New roadmap` inside the title chevron dropdown menu.

### Changed
- **Sorter Labels, Statistics Rename & Roadmap Wheel Zoom (`new ui/client/`):**
  - Removed the `"Sort: "` prefix from `CourseSortDropdown` (`app-shell.tsx`) and player note sort tooltips (`course-player.tsx`), leaving only the active sort mode label.
  - Renamed visible `Analytics` UI copy (`IconDock` nav item, page `<h1>`, and Welcome Guide copy) to `Statistics` while keeping `/analytics` route URLs intact, and changed `Learning focus` sub-label `"From course tags"` to `"Based on tags"`.
  - Enabled direct mouse-wheel zoom (`0.35x`–`2.0x`, cursor-centered) when scrolling anywhere over the `RoadmapPage` canvas without requiring `Ctrl`/`Cmd`.

### Fixed
- **Statistics `Learning focus` Ellipsis & Card Overflow (`new ui/client/src/components/pages/analytics-dashboard.tsx`):**
  - Added `min-w-0` on `Card` and `min-w-0 w-full sm:w-auto sm:flex-1` on the legend `<ul>` (with `shrink-0` on `%`) so long tag labels and sub-text truncate cleanly with `...`.

### Changed
- **Instructor Detail Sorter & Shared Course Sorting (`new ui/client/src/lib/courses.ts`, `app-shell.tsx`, `instructors-page.tsx`):**
  - Extracted shared `COURSE_SORT_OPTIONS` / `sortCourses` and `CourseSortDropdown` across Home and Instructor Detail pages, replacing the redundant `N courses` label in the Instructor Detail `Courses` header row with the `Sort:` dropdown.
- **Home Page Filter/Tags Sub-Row & Classic TutIn Favicon (`new ui/client/src/components/layout/app-shell.tsx`, `new ui/client/public/tutin-icon.svg`, `new ui/client/index.html`):**
  - Moved the status filter bar (`All`, `In Progress`, `Completed`) below onto the sorting row (`Sort:`) and rendered sorted unique SQLite course tags right after the status filters inside the scrollable segmented track; kept the `Search courses` input and `AddCourseControl` paired in the top-right header.
  - Replaced `/favicon.ico` with the classic TutIn squircle `"T"` favicon (`public/tutin-icon.svg`) while keeping `DotLogo` in `IconDock`.

### Removed
- **Instructor Avatar Floating `X` Overlay (`new ui/client/src/components/pages/instructors-page.tsx`, `instructor-avatar.tsx`):**
  - Removed the corner `X` remove button overlapping the Instructor Detail avatar and its unused removal helper code, keeping clean hover `Camera` photo replacement.
- **Thumbnail Link Overlay, Search `Ctrl+K` Badge & Legacy Favicon (`new ui/client/`):**
  - Removed the bottom-left `"Link"` badge over `CourseCard` thumbnails, removed the `<kbd>Ctrl+K</kbd>` hint badge from the Home search input, and replaced `public/favicon.ico` with `public/tutin-icon.svg`.
- **Admin Page & Artwork Customization Controls (`new ui/client/`):**
  - Removed `new ui/client/src/routes/admin.tsx`, `admin-dashboard.tsx`, the `Admin` sidebar navigation item in `app-shell.tsx`, and runtime thumbnail/avatar customization hooks (`useThumbnailSettings`, `localStorage` overrides, `thumbnailGeneratorSettings` server sync in `app-settings.ts`, `SETTINGS_DEFS`, `PATTERN_NAMES`, preview-only component props, and unused contrast branches).
  - Preserved the exact `2f65126` saved artwork & avatar configuration as `DEFAULT_GENERATOR_SETTINGS` inside `thumbnail-generator.ts` (`hue: 150`, `drift: 25`, `density: 36`, `variance: 50`, `contrast: 60`, `spark: 20`, `bands: 3`, `pattern: "auto"`, `lockHue: false`, `avatarContrastMode: "manual"`, `avatarFontWeight: "500"`, `avatarFontFamily: "sans"`, `avatarFontSize: 8`, `avatarBgTone: 3`, `avatarFgTone: 1`) so course cards and instructor avatars keep their tuned appearance with zero runtime customization overhead.

### Changed
- **Restored `2f65126` Admin Saved Defaults & Tone 1–5 Avatar Swatches (`new ui/client/`):**
  - Restored `DEFAULT_GENERATOR_SETTINGS` (`hue: 150`, `drift: 25`, `density: 36`, `variance: 50`, `contrast: 60`, `spark: 20`, `bands: 3`, `pattern: "auto"`, `lockHue: false`, `avatarContrastMode: "manual"`, `avatarFontWeight: "500"`, `avatarFontFamily: "sans"`, `avatarFontSize: 8`, `avatarBgTone: 3`, `avatarFgTone: 1`), the 5-tone artwork/avatar engine (`thumbnail-generator.ts`, `course-thumbnail.tsx`, `instructor-avatar.tsx`), and interactive Manual `Tone 1`–`Tone 5` swatches in `admin-dashboard.tsx` while preserving SQLite `/api/settings` persistence and live SQLite course previews without sample covers.
  - Updated `sanitizeThumbnailSettings` and `hydrateAppSettingsFromServer` (`app-settings.ts`) to automatically reset incompatible `avatarSaturation`-without-`avatarBgTone` payloads back to the restored defaults.

### Fixed
- **Vite Dev Server `127.0.0.1:5173` Reachability (`new ui/client/vite.config.ts`):**
  - Configured `server.host: "127.0.0.1"` alongside `port: 5173` so Vite binds IPv4 loopback cleanly instead of binding IPv6 `[::1]:5173` alone on Windows/Node, making both `http://127.0.0.1:5173/` and `http://localhost:5173/` accessible.

### Added
- **Unified Non-AI Backend Migration & `new ui` v6 Release (`new ui/server/`, `new ui/package.json`, `new ui/start-dev.bat`):**
  - Migrated the non-AI Express 5 + SQLite (`sql.js`) backend into `new ui/server/` (`index.js` on default port `9474`, `database.js` reading `%APPDATA%/TutIn/tutin.db` or `TUTIN_DATA_DIR`), exposing REST endpoints across `courses`, `modules`, `videos`, `notes`, `analytics`, `instructors`, `roadmaps`, `settings`, `transcripts`, `summaries`, `search`, `data`, `fs`, `youtube`, and `canvas`, plus `/video/*` range streaming, `courseScanner.js`, `pathRepair.js`, and MP4/TS duration parsing.
  - Upgraded `new ui/` packages, `/api/health`, startup banner, `User-Agent`, Settings `About`, and docs to **v6.0 (`6.0.0`)**.
  - Added workspace root scripts in `new ui/package.json` (`server`, `client`, `start`, `build`, `start:prod`, `typecheck`, `lint`), `new ui/start-dev.bat` Windows launcher (auto-installing root/server/client dependencies and opening `http://127.0.0.1:5173`), updated `new ui/client/vite.config.ts` to proxy `/api` and `/video` to `http://127.0.0.1:9474`, and added standalone `new ui/README.md`, `new ui/CHANGELOG.md`, `new ui/docs/ARCHITECTURE.md`, and `new ui/docs/USER_GUIDE.md`.
- **Canvas v2 SQLite Migration & Vault Sync (`new ui/server/database.js`, `new ui/server/routes/canvas.js`, `new ui/server/routes/data.js`, `new ui/client/src/lib/course-canvas.ts`):**
  - Added `migration007` extending `canvas_nodes` / `canvas_edges` and creating `canvas_groups`, `canvas_strokes`, and `canvas_course_meta` (`dismissed_note_ids`, `last_sync_revision`).
  - Wired `GET/PUT /api/canvas/:courseId` and `POST /api/canvas/:courseId/sync-notes` to persist Canvas v2 state in SQLite alongside `<courseFolder>/.tutin/canvas.json`, and included all Canvas v2 tables in `/api/data/export` and `/api/data/import`.
- **Vault Screenshot Media Endpoint (`new ui/server/routes/notes.js`, `new ui/client/src/components/notes/rich-note-surface.tsx`):**
  - Added `POST /api/notes/media` and `GET /api/notes/media/:courseId/:filename` storing pasted, dropped, cropped, and video-captured screenshots inside `<courseFolder>/.tutin/notes/screenshots/` (with `TUTIN_DATA_DIR/screenshots/` fallback for non-folder courses).
- **MPEG-TS `.ts` Playback & Player Deep-Linking (`new ui/client/src/components/player/course-player.tsx`, `new ui/client/src/routes/learn.$courseId.tsx`):**
  - Integrated `mpegts.js` for `.ts` stream playback while keeping native Browser Picture-in-Picture, added `?videoId=` deep-link support (guarded against resetting active lesson on progress updates), honored `resumePlayback` and `autoMarkCompleteAt` settings, and enabled real video/canvas `Show in Explorer` via `POST /api/fs/open-folder`.
- **History Deletion & Real-Tag Analytics (`new ui/server/routes/analytics.js`, `new ui/client/src/components/pages/history-page.tsx`, `new ui/client/src/components/pages/analytics-dashboard.tsx`):**
  - Added `DELETE /api/analytics/history` and `DELETE /api/analytics/history/:itemId` and wired `HistoryPage` to real `/api/analytics/history` feeds, external `courseUrl` links, and `/learn/$courseId?videoId=...` navigation.
  - Replaced mock category breakdowns in `LearningFocus` (`AnalyticsDashboard`) with dynamic focus slices computed from real SQLite course tags (`--chart-1`..`--chart-4` + `Other`).

### Changed
- **Full SQLite Wiring Across Client Modals & Pages (`new ui/client/src/`):**
  - Rewired `AddCourseModal`, `EditCourseModal`, `SyncPreviewModal`, `InstructorsPage`, `InstructorAvatar`, `RoadmapPage`, `SettingsModal`, `WelcomeGuideModal`, and `AppSettings` (`new ui/client/src/lib/app-settings.ts`) to persist against SQLite `/api/*` and native `/api/fs/*` pickers, removing `localStorage` primary data mocks (`tutin_roadmaps`, `tutin_instructor_avatars`, `tutin_media_db` primary backup paths) and syncing `CoursePlayer` (`recalculate-progress` + `COURSE_UPDATED_EVENT`).
  - Intentionally greyed out / disabled non-AI-migrated controls in `SettingsModal` (`AI` and `Voice` tabs), `CurriculumManager` (Transcribe/Dub buttons), and `CoursePlayer` (dubbed language & missing summary states) with zero requests to removed AI/dubbing endpoints, while preserving `.srt`/`.vtt` upload, `SmartCaptionsModal`, and reading saved `.tutin/summaries/*.md` files.
  - Updated `new ui/client/README.md` and `new ui/docs/UI_UX_SYSTEM.md` to reflect port `9474`, SQLite + `.tutin/` vault persistence, tag-driven analytics, disabled AI/Voice surfaces, and manual Admin contrast controls.

### Removed
- **Sample Cover Fixtures & Legacy AI/Dubbing Routes (`new ui/client/src/components/pages/admin-dashboard.tsx`, `new ui/server/`):**
  - Removed `SAMPLE_COVERS`, `SAMPLE_COVER_DETAILS`, `coverMode`, `previewImageIndex`, mock `initialCourses`, and unused avatar tone swatches from `AdminDashboard`, replacing `manual` mode controls with active `avatarSaturation`, `avatarLightness`, and `avatarTextContrast` sliders persisted in SQLite `settings`.
  - Excluded legacy Whisper/NLLB/OpenRouter/punctuation/XTTS routes, Python workers, and Settings `Data Maintenance` buttons (covered by `SyncPreviewModal`).

### Fixed
- **Type Safety, Event Payloads & Component Prop Signatures (`new ui/client/src/`):**
  - Fixed `exactOptionalPropertyTypes` spreads in `api.ts` and `file-system.ts`, fixed `ThumbnailGenerator` / `InstructorAvatar` / `CourseThumbnail` helper signatures and SVG `<viewBox="0 0 400 225">` wrapping, fixed `compressImageFileToBlob` argument order in `instructors-page.tsx`, fixed `subscribeCourseCurriculumChanged` callback signatures across `curriculum-manager.tsx`, `course-player.tsx`, and `course-canvas-page.tsx`, fixed `courseId` dependency in `insertImageCard` (`course-canvas-page.tsx`), fixed `mpegts.LoggingControl.applyConfig` invocation, and fixed `Ã—` mojibake in `roadmap-page.tsx`.

### Added
- **Shared Formatting & Backend API Modules (`new ui/client/src/lib/format.ts`, `new ui/client/src/lib/api.ts`, `new ui/client/src/lib/courses.ts`):**
  - Consolidated duplicated timestamp/duration helpers (`parseTimestampToSeconds`, `formatTimestamp`, `formatClockShort`, `formatDurationLabel`, `formatMinutesLabel`) into `src/lib/format.ts` and re-exported compatible helpers from `src/lib/course-lessons.ts`.
  - Added `src/lib/api.ts` (`API_BASE_URL`, `apiUrl`, `apiRequest`, `apiJson`) reading `VITE_API_BASE_URL` and normalizing `/api/*` requests across `SettingsModal`, `SmartCaptionsModal`, and `CoursePlayer`.
3  - Added `useSavedCourse(courseId)` reactive hook in `src/lib/courses.ts` subscribing to `tutin:course_updated`, `tutin:course_added`, and `tutin:course_deleted`.
- **Standard Vite SPA Entry (`new ui/client/index.html`, `new ui/client/src/main.tsx`):**
  - Added client entry point and root HTML shell replacing SSR server entry points.

### Changed
- **Workspace Flattening & Feature Folder Organization (`new ui/client/`, `new ui/docs/`):**
  - Flattened doubly-nested `new ui/masterclass-study-companion-main/masterclass-study-companion-main/` into `new ui/client/` and moved documentation to `new ui/docs/UI_UX_SYSTEM.md`.
  - Organized `new ui/client/src/components/` into feature folders (`layout/`, `modals/`, `player/`, `notes/`, `canvas/`, `pages/`, `ui/`) and updated all `@/components/...` imports and doc references.
- **Pure Vite + React + TanStack Router SPA Conversion (`new ui/client/vite.config.ts`, `package.json`, `src/router.tsx`, `src/routes/`):**
  - Replaced `@lovable.dev/vite-tanstack-config`, `@tanstack/react-start`, and `nitro` with `@tanstack/router-plugin/vite` (`autoCodeSplitting: true`), `@vitejs/plugin-react`, `@tailwindcss/vite`, native `resolve.tsconfigPaths: true`, isolated `css.postcss.plugins: []` (avoiding parent legacy Tailwind v3 config lookup), and `/api` dev proxy (`VITE_API_TARGET || "http://127.0.0.1:3001"`).
  - Simplified `src/routes/__root.tsx`, `src/routes/learn.$courseId.tsx`, `src/routes/canvas.$courseId.tsx`, `src/routes/manage.$courseId.tsx`, and static routes to pure client SPA routing powered by `useSavedCourse`.
- **UI Consistency & Type-Safety Cleanup (`app-shell.tsx`, `curriculum-manager.tsx`, `admin-dashboard.tsx`, `analytics-dashboard.tsx`, `sync-preview-modal.tsx`, `instructors.tsx`):**
  - Replaced `window.confirm` in `CourseMenu` (`app-shell.tsx`) with `<AlertDialog>` and replaced `window.prompt` in `CurriculumManager` with inline `<input>` renaming matching module rename UX.
  - Eliminated all explicit `any` types (`to?: AppNavRoute` in `app-shell.tsx`, typed pattern/avatar selectors in `admin-dashboard.tsx`) and added unmount `clearTimeout` cleanup refs in `admin-dashboard.tsx`, `curriculum-manager.tsx`, `course-player.tsx`, `sync-preview-modal.tsx`, `add-course-modal.tsx`, `edit-course-modal.tsx`, and `welcome-guide-modal.tsx`.

### Removed
- **Lovable, SSR/Cloudflare & Prototype Clutter:**
  - Deleted `.lovable/`, `.output/`, `.wrangler/`, `.tanstack/`, `AGENTS.md`, `roadmap.md`, `bun.lock`, `bunfig.toml`, `src/server.ts`, `src/start.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/lovable-error-reporting.ts`, `src/routes/README.md`, `vite-tsconfig-paths`, loose prototype `thumbnail*.{jpg,png,webp}` & `TutIn thumbnail generator.html` in `new ui/`, and 33 unused `src/components/ui/*` + `src/hooks/use-mobile.tsx` files.

### Fixed
- **ESLint & PostCSS Build Errors:**
  - Fixed empty `catch {}` block in `src/lib/thumbnail-generator.ts`, all `@typescript-eslint/no-explicit-any` errors across components, `react-hooks/exhaustive-deps` in `src/components/layout/course-thumbnail.tsx`, and Vite v8 production build conflict against parent root Tailwind v3 PostCSS config.

### Added
- **Smart Captions Batch Import Modal (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/smart-captions-modal.tsx`, `src/components/course-player.tsx`):**
  - Ported `SmartCaptionsModal` using the `Dialog` visual system (`max-w-lg`, flat monochrome header/tags, matched lesson rows with `SRT`/`VTT` format chips, `Skip` and `Import all (N)` actions).
  - Wired `Import subtitles…` into `CoursePlayer` (Audio & Subtitles dropdown and `TranscriptTab` language menu) supporting both `/api/transcripts/:id/upload` + `/api/transcripts/batch-apply` backend flows and client multi-file `.srt`/`.vtt` sibling matching, dispatching `tutin:transcript-updated`.
- **Welcome Guide Modal (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/welcome-guide-modal.tsx`, `src/lib/app-settings.ts`, `src/components/app-shell.tsx`):**
  - Implemented `WelcomeGuideModal` as a calm, 4-step interactive product tour (`Welcome to TutIn`, `Import & Organize`, `Notes & Whiteboard`, `Track & Back Up`) adapted to new-UI features including Course Notes Canvas, rich image-cropper notes, roadmaps, and local JSON backups.
  - Hydrated first-launch display client-side in `AppShell` using `tutin_welcome_seen` and exposed a replay trigger from Settings -> `About` -> `Open guide`.
- **Complete Settings Workspace & Adapted Keybindings (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/settings-modal.tsx`, `src/lib/app-settings.ts`, `src/components/course-player.tsx`):**
  - Expanded `SettingsModal` to all 7 cohesive tabs (`General`, `Shortcuts`, `AI`, `Voice`, `Data`, `Feedback`, `About`), removing colored icon squares, emojis, and legacy accent swatches to stay consistent with `UI_UX_SYSTEM.md`.
  - Wired real `CoursePlayer` keyboard shortcuts (`Space`/`K`, `ArrowLeft`/`ArrowRight`, `J`/`L`, `ArrowUp`/`ArrowDown`, `M`, `C`, `P`, `F`, `Shift+N`/`Shift+P`, `<`/`>`, `0–9`) respecting `tutin_settings.keyboardShortcuts`, and updated Settings -> `Shortcuts` to accurately document **Player**, **Course canvas**, **Notes editor**, and **Navigation** shortcuts.
  - Implemented Whisper/OpenRouter/Google configuration fields, offline punctuation model management (`/api/settings/punctuation-models`), XTTS dubbing device controls (`/api/dub/gpu-info`, `/api/dub/set-device`), browser storage & `tutin_media_db` telemetry, portable JSON backup export/import, Formspree feedback submission, and `<AlertDialog>` confirmation for destructive workspace reset.

### Changed
- **Flat Edge-to-Edge App Shell & Completion Semantic Color (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/app-shell.tsx`, `src/components/course-player.tsx`, `src/components/canvas/course-canvas-page.tsx`, `src/components/roadmap-page.tsx`, `src/routes/canvas.$courseId.tsx`, `src/routes/roadmap.tsx`):**
  - Removed the inset curved `<main>` card frame (`my-2 mr-2 sm:my-3 sm:mr-3 rounded-2xl shadow-workspace`), replacing it with a flush edge-to-edge workspace pane separated from the vertical `IconDock` by `border-l border-border/50`. Updated `CoursePlayer`, `CourseCanvasPage`, and `RoadmapPage` to full `h-dvh` sizing, and added `fixedViewport` on `AppShell` for `/canvas/$courseId` and `/roadmap` so full-bleed canvases have no right-edge scrollbar gutter.
  - Added semantic emerald completion styling (`bg-chart-4` and `text-emerald-600 dark:text-emerald-400`) strictly to `CourseCard` (`100%` completed progress bar and percentage label) and `PlaylistTab` (completed lesson checkmarks, fully completed module counts, and `100%` course progress header/bar) while keeping the remaining UI neutral monochrome.

### Fixed
- **Floating HUD, Notes Drawer & Lightbox Pointer Isolation (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/canvas/canvas-hud.tsx`, `src/components/canvas/canvas-notes-drawer.tsx`, `src/components/canvas/course-canvas-page.tsx`):**
  - Marked all floating HUD toolbars (`Top-Left Context Bar`, `Top-Right History/Tidy/Zoom Bar`, `Bottom Floating Tool Dock`), `CanvasNotesDrawer`, and the image lightbox overlay with `data-canvas-ui="true"` plus `onPointerDown`, `onDoubleClick`, and `onWheel` propagation stops, and added matching `[data-canvas-ui="true"]` early returns inside `course-canvas-page.tsx` stage `onWheel` and `handleStagePointerDown`. Clicking any floating tool button now triggers its React `onClick` instead of being hijacked by the background stage's `setPointerCapture(e.pointerId)`, and mouse-wheel scrolling works inside the Notes drawer.
- **Course Notes Canvas Tool Interaction Completeness (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/canvas/course-canvas-page.tsx`, `src/components/canvas/canvas-card.tsx`, `src/components/canvas/canvas-edges.tsx`, `src/lib/course-canvas.ts`):**
  - Enabled clicking any card directly after choosing `Connect (A)` in the bottom dock (in addition to dragging or clicking the 4-side card connector ports) and completed drag-and-drop arrow creation on `pointerup` when dragging from a card or port onto another card.
  - Prevented artboard/card layers from intercepting pointer presses while `Pan (H)`, `Space+Drag`, `Note (N)`, or `Text (T)` is active so users can pan over cards and spawn new Canvas notes/text directly inside Artboards.
  - Added auto-commit of pending card edits when clicking onto the canvas background (`commitPendingEdit`) and automatic cleanup of empty cancelled Canvas draft cards.
  - Upgraded `hitTestStroke` in `src/lib/course-canvas.ts` to compute point-to-segment distance across stroke segments so `Eraser (E)` sweeps erase fast strokes reliably, and replaced nested state updaters in `handleUndo`/`handleRedo` with ref-backed stacks (`undoStackRef`/`redoStackRef`).
  - Preserved custom artboard widths and wide image bounds during `tidyAllCanvasArtboards`.

### Added
- **Dedicated Course Notes Whiteboard Canvas (`/canvas/$courseId`) & Two-Way Notes/Media Sync (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/routes/canvas.$courseId.tsx`, `src/components/canvas/`, `src/components/rich-note-surface.tsx`, `src/lib/course-canvas.ts`, `src/lib/course-notes.ts`, `src/lib/course-lessons.ts`, `src/lib/media-store.ts`, `src/components/course-player.tsx`, `src/routes/learn.$courseId.tsx`, `src/components/sync-preview-modal.tsx`, `src/components/app-shell.tsx`):**
  - **Open Canvas Route Separation:** Repointed the `Open canvas` button in `NotesTab` from `/roadmap` to the dedicated course whiteboard `/canvas/$courseId`, keeping course-to-course learning pathways (`/roadmap`) cleanly separated from per-course note study whiteboards. Added URL deep-link support (`/learn/$courseId?lesson=&t=&tab=notes`) to jump straight from a Canvas card back into the originating lesson timestamp.
  - **Shared Notes Store & Loop-Safe Sync (`src/lib/course-notes.ts`, `src/lib/course-lessons.ts`):** Extracted course note persistence (`tutin_course_notes_${courseId}`) with revision tracking (`tutin:notes_changed` event stamped with `source: "player" | "canvas" | "system"` + `revision`) so Canvas inline edits sync live back to the Course Player without echo loops. Extracted shared course curriculum helpers (`getCourseModules`, `getCourseLessons`, `parseDurationToSeconds`, `formatTimestamp`).
  - **IndexedDB Media Offload (`src/lib/media-store.ts` & `src/components/rich-note-surface.tsx`):** Stored pasted, dropped, uploaded, cropped, and screenshot-captured images in IndexedDB (`tutin_media_db`, referenced cleanly via `media://<id>` URIs) to prevent `localStorage` quota exhaustion, paired with a reusable shared `<RichNoteSurface>` editor and `<RichNoteHtmlContent>` renderer used across both Player Notes and Canvas inline card editing.
  - **Option A Video Artboards & Chronological Arrow Semantics (`src/lib/course-canvas.ts`):**
    - Auto-generates lesson-grouped `video-artboard` columns (`L{n} · {Title}`) with chronological `auto-chrono` dashed Bezier edges (`N1 -> N2 -> N3`).
    - Dragging a Video Note outside its origin artboard detaches it (`Detached` status + clickable `L{n} · {MM:SS}` deep-link + 1-click `Return` button), cleanly removing touching `auto-chrono` edges and bridging remaining in-group siblings (`N1 -> N3`) while preserving manual solid connectors.
    - Custom card arrangements switch the Video Artboard to `layoutMode: "custom"`, preserving manual card placement and detached cards when new notes are added in the Player (newly added Player notes append into the first collision-free bottom slot, extending the artboard vertically and shifting stacked artboards below), with a one-click `Tidy` action per artboard or globally.
    - Supports Canvas-only note cards, plain text annotations, pasted/dropped/uploaded images with lightbox preview, non-destructive synced Video Note removal (`dismissedNoteIds`) restorable from the right `Notes` drawer (`All` / `Detached` / `Off canvas` filters), and legacy `.tutin/canvas.json` v1 payload normalization (`normalizeLegacyCanvasPayload`).
  - **Vector Freehand Drawing (`perfect-freehand` in `src/components/canvas/canvas-ink-layer.tsx`):** Added buttery variable-width Pen and Highlighter SVG ink strokes with color/weight popovers, artboard coordinate parenting (`parentGroupId` so ink strokes move with dragged artboards), spatial bounding-box Eraser sweep, and undo/redo history (`Ctrl+Z` / `Ctrl+Shift+Z`).
  - **Vault Sync Integration (`src/components/sync-preview-modal.tsx`):** Connected `getCanvasSummaryMetrics` to reflect saved whiteboard card and edge counts live inside the Sync Preview modal's `Course Canvas` vault card.
- **Add Course Modal & Edit Course Modal System (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/add-course-modal.tsx`, `src/components/edit-course-modal.tsx`, `src/components/app-shell.tsx`, `src/components/curriculum-manager.tsx`, `src/lib/courses.ts`):**
  - **Add Course Modal (`AddCourseModal`):** Unified intake modal supporting four ingestion paths via concentric segmented controls:
    - **Local Folder:** Video scanner for `.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`, `.avi` with automatic course name detection, lesson count, estimated duration, and file preview sample.
    - **YouTube:** Stream link input with automatic duration and lesson count inputs.
    - **Google Drive:** Drive folder ingestion link.
    - **Direct Link:** External course/video URL with custom lesson count and duration.
  - **Edit Course Modal (`EditCourseModal`):** Multi-tab metadata editor:
    - **Details Tab:** Title, Instructor, Language selector, and interactive tag management (type and press Enter to add, click `X` pill to remove).
    - **Cover Image Tab:** Real-time cover preview, custom image file upload (`Upload image`), and `Revert to artwork` action to restore deterministic vector generative art.
    - **Progress Tab (External Courses):** URL configuration, total and completed lessons counter, duration input, and calculated progress indicator.
  - **Strict Design System Compliance:** Built with OKLCH tokens, borderless elevated surfaces, concentric radius hierarchy (`rounded-xl` modal shell, `rounded-lg` input trays, `rounded-sm` inner segmented tabs, `rounded-md` action buttons), fixed stable height (`h-[min(640px,88dvh)] max-w-2xl`), single corner close button with `pr-12` header clearance, and copy economy.
  - **Deep App Wiring & Reactive Cross-Component State:**
    - Connected to "+ Add Course" split button and dropdown in `AddCourseControl`.
    - Added "Edit details" and functional "Delete" to `CourseMenu` on all Course Cards in `HomePage` and `InstructorsPage`.
    - Connected "Edit info" in `CurriculumManager` to open `EditCourseModal` with live state sync.
    - Added `getSavedCourses` helper in `src/lib/courses.ts` merging static courses with `tutin_custom_courses`, `tutin_courses_override`, and `tutin_deleted_courses`.
    - Wired `tutin:course_added`, `tutin:course_updated`, and `tutin:course_deleted` custom window events in `AppShell` and `HomePage` for instant app-wide synchronization without page reloads.
- **Course & Vault Sync Modal (Spacious Layout, Semantic Tokens & Soft Backdrop) (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/sync-preview-modal.tsx`, `src/components/ui/dialog.tsx`, `src/components/app-shell.tsx`, `src/components/curriculum-manager.tsx`):**
  - **Single Close Button:** Eliminated duplicate inner close button; relies on `DialogContent`'s single corner `X` button with `pr-12` header padding to prevent overlap.
  - **Spacious & Fixed Modal Height (`h-[min(640px,88dvh)]`):** Anchored modal to a stable height matching `SettingsModal`, preventing jumping or layout shifts when switching between tabs with different item counts.
  - **Header Decluttering:** Removed the header icon and redundant course completion text (`Product Design Fundamentals • 65%...`) for a clean, calm title bar.
  - **Frosted Backdrop Overlay (`bg-black/60 backdrop-blur-sm`):** Softened modal backdrop overlay in `src/components/ui/dialog.tsx` from harsh pitch-black `bg-black/80` to translucent `bg-black/60 backdrop-blur-sm`, matching live TutIn's light, calm opacity.
  - **Calibrated Semantic Colors:** Restored purposeful semantic colors across assets and categories without rainbow clutter:
    - **Voice Dubs:** Violet semantic tokens (`text-violet-500`, `bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20`).
    - **Transcripts & CC:** Sky semantic tokens (`text-sky-500`, `bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20`).
    - **AI Summaries:** Amber semantic tokens (`text-amber-500`, `bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20`).
    - **Active Vault & Added Videos:** Soft emerald tokens (`text-emerald-500`, `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20`).
    - **Removed Videos:** Destructive rose tokens (`text-rose-500`, `bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20`).
    - **Notes & Media Vault:** Indigo tokens (`text-indigo-500`).
  - **Complete Sub-Tabs Support:** Concentric segmented tabs (`Summary`, `New Assets`, `Vault`, `Added`, `Removed`, `Moved`, `Updated`) with duration formatting, file breakdowns, and instant drill-down from summary rows.
  - **Wired "Rescan Folder" Triggers:** Connected to `CourseMenu` on all course cards in `HomePage` and `InstructorsPage`, added decoupled `tutin:rescan_course` window event listener in `AppShell`, and added a dedicated toolbar button in `CurriculumManager`.
- **Categorical Chart Tokens & Semantic Color System (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/styles.css`, `src/components/analytics-dashboard.tsx`, `src/components/curriculum-manager.tsx`):**
  - **Calibrated OKLCH Chart Tokens (`--chart-1` to `--chart-5`):** Configured distinct, accessible categorical colors in light and dark modes: `--chart-1` (Violet/Indigo), `--chart-2` (Sky/Cyan), `--chart-3` (Amber/Warm Gold), `--chart-4` (Emerald/Mint), and `--chart-5` (Rose/Crimson).
  - **Analytics Emerald Activity Ramp:** Upgraded the 52-week consistency calendar from monochrome gray to a 5-step emerald activity ramp (`bg-secondary` -> `bg-emerald-500/25` -> `bg-emerald-500/50` -> `bg-emerald-600/80` -> `bg-emerald-600`), providing visual satisfaction and immediate streak recognition.
  - **Categorical Learning Focus Donut:** Bound donut chart segments and legend indicators to specific categorical colors (Violet for Design, Sky for Code, Amber for Motion, Emerald for AI & ML) so disciplines are distinguishable at a glance.
  - **Velocity Peak & Metric Accents:** Highlighted peak study days in `--chart-2` sky, and accented weekly watch time delta and course progress in emerald.
  - **Curriculum Status Badges:** Upgraded `Transcribed` chips to a calm soft emerald badge (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`), while keeping `Dub` in sky blue (`bg-sky/10 text-sky`) and subtitle chips (`EN`, `ES`) in quiet neutral monospace pills to avoid rainbow clutter.
- **Playback & Progress Settings in General Tab (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/settings-modal.tsx`):**
  - **Resume Playback Switch:** Added a clean `Resume playback` toggle ("Continue from where you left off"), persisted to `tutin_settings`.
  - **Mark Complete When Watched:** Added a compact 3-button percentage selector (`90%`, `95%`, `100%`) for automatic lesson completion thresholds.
  - **Progress Calculation Mode:** Added selectable choice cards with active checkmarks for `By Videos Completed` (`Count of completed videos ÷ total videos`) and `By Completed Duration` (`Duration of completed videos ÷ total course duration`), triggering live progress recalculation via `POST /api/courses/recalculate-progress`.
- **Instructor Photo Avatar Upload (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/instructors-page.tsx`, `src/components/instructor-avatar.tsx`):**
  - **In-Place Image Filter & Native Vector Circle:** Replaced the separate circular background overlay (`bg-black/75`) with an in-place CSS brightness filter (`group-hover/avatar:brightness-[0.4]`) on the avatar itself, and upgraded `InstructorAvatar`'s background to a native SVG `<circle cx="12" cy="12" r="12">`. This eliminates anti-aliasing edge fringe, subpixel crescent bleeding, and double-circle misalignment while the centered white `Camera` icon fades in on hover.
  - **Option A (Profile Header Upload):** Hovering over the avatar on the instructor detail view displays the dark camera overlay. Clicking triggers the file picker. An absolute `X` button allows removing custom photos to restore deterministic SVG initials.
  - **Option C (Inline List Row Upload):** Hovering directly over any instructor avatar in the Instructors list view exposes the dark camera overlay with `e.stopPropagation()`, enabling avatar changes directly without entering the detail view.
  - **Global Avatar Synchronization:** Stored in client `localStorage` under `tutin_instructor_avatars` and broadcast via `tutin:instructor_avatar_changed` custom events so updated instructor photos instantly synchronize across the whole app (Home course cards, Course Player metadata footer, and Instructors views).
- **Structured Note Image Reordering & Dedicated Grip Handle (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`, `src/styles.css`):**
  - **Ghost Drag Suppression:** Added `draggable="false"` on inserted note images, suppressed image dragging in contentEditable with `onDragStart={(e) => { if (target.tagName === "IMG") e.preventDefault(); }}`, and added `-webkit-user-drag: none; user-drag: none;` in CSS.
  - **Dedicated Grip Handle (`⋮⋮`):** Added a `GripVertical` handle on the floating toolbar with `cursor-grab active:cursor-grabbing` affordance and HTML5 drag-and-drop block reordering over sibling paragraphs.
  - **One-Click Move Buttons:** Added Move Up (`ArrowUp`) and Move Down (`ArrowDown`) buttons on the toolbar to swap image blocks up and down instantly.
  - **Keyboard Shortcuts:** Added `Alt + ArrowUp` and `Alt + ArrowDown` while an image is selected to swap it with neighboring paragraph blocks and smoothly scroll into view (`scrollIntoView({ block: "nearest" })`).

### Changed
- **Tonal Surface Layering & Architectural Divider Refinement (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/styles.css`, `src/components/`, `src/components/ui/`, `src/routes/__root.tsx`):**
  - Replaced heavy wireframe box borders (`border-border`, dashed outlines, and `outline` action buttons) across `<main>`, course cards, analytics cards, segmented tab tracks, search/form inputs, dialogs/popovers/dropdowns/select menus, note cards, roadmap canvas workspace & nodes, curriculum manager, settings modal, and admin dashboard with calibrated OKLCH tonal stepping (`--shell` → `--background` → `--card` + inset `--secondary`) and grounded `--shadow-card` / `--shadow-workspace` depth.
  - Preserved and tuned subtle architectural divider lines (`border-border/50`, `divide-border/50`) where structurally needed: tab headers, note formatting toolbars and editor footers, playlist modules, image cropper and lightbox headers, subheader filter bars, settings sidebar navigation, roadmap drawer and node sections, curriculum module lesson lists, instructor profile hero, and admin studio headers/previews.
- **Analytics Page Header Alignment (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/analytics-dashboard.tsx`):**
  - Added the standard page header (`<h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Analytics</h1>`) with responsive container padding (`max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10`), matching History and Instructors pages.
- **History Date Grouping & Clean Metadata (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/history-page.tsx`):**
  - Replaced the vague `"Last Week"` grouping bucket with exact calendar date headings (e.g., `"October 18, 2026"`, `"October 16, 2026"`), leaving `Today` and `Yesterday` followed by specific chronological dates.
  - Dynamically computes history groups from visible items in chronological order.
  - Removed relative timestamp tags (e.g., `"Watched 2 hours ago"`, `"Watched 5 hours ago"`, `"Watched yesterday at..."`) from history rows, leaving clean metadata: instructor name and `<Clock /> {percent}% watched`.
  - Removed the `{visible.length} lessons` counter from the subheader filter bar.
- **Roadmap Canvas Simplification & Inline Title Rename (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/roadmap-page.tsx`):**
  - **Double-Click Title Rename:** Double-clicking the roadmap title `<h1>` activates an inline input to rename the roadmap in place. Pressing `Enter` or blurring saves via `updateCurrentRoadmap(draft.trim())`; pressing `Escape` cancels.
  - **Menu Rename Option:** Added a `Rename` item (`Pencil` icon) to the header chevron dropdown menu as an accessible alternative trigger. Separated the title from the dropdown button to prevent unintended menu openings during clicks.
  - Removed the decorative `Compass` icon box from the left of the roadmap name in the top header toolbar.
  - Removed the subtitle count text (`{nodes} courses • {connections} connections`) beneath the roadmap name for a clean, direct header.
  - Removed the redundant instructor avatar and name row from canvas course node cards, streamlining nodes to focus on thumbnail, duration, title, and progress.
- **Relaxed Note Lower Padding & Click-to-Select Image UX (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`, `src/styles.css`):**
  - Retained the compact outer spacing between note cards (`space-y-3`) while increasing the card's inner lower padding (`p-3 pb-4.5`) so text and media have breathing room without expanding the overall card gaps.
  - Replaced the jittery `onMouseMove` hover crop pill with industry-standard click-to-select image handling (inspired by Notion and Linear): clicking an image displays an active focus ring (`.is-selected`) and anchors a persistent floating toolbar (`Crop` / `Delete`) styled with design tokens.
  - Added keyboard deletion (`Backspace` / `Delete` deletes the selected image) and `Escape`/click-outside to dismiss.
  - Guaranteed an empty paragraph (`<p><br></p>`) below inserted images and enabled empty-space click-to-focus at the bottom of the editor to eliminate cursor trapping.
- **Decluttered Note Composer Block (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`):**
  - Removed the `"New note"` (and `"Editing"`) status text next to the timestamp pill.
  - Removed the `"AI"` autocomplete indicator badge (`Sparkles` tag) from the composer header.
  - Removed the dividing border line (`border-b border-border`) between the top timestamp header and the formatting toolbar, unifying them into a seamless upper toolbar area.
- **Notes Tab Top Bar & Options Popover (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`):**
  - Streamlined the `NotesTab` top bar to 3 essential controls: `Add note · {time}`, borderless Sort ghost button, and borderless 3-dots ghost button.
  - Consolidated options into a clean Radix `<Popover>` menu containing `Export notes`, `Open canvas` (refined from `"Go to canvas"`), a **`While writing`** section (`Pause video` switch, compact single-row `Resume after` stepper with integrated `[ - ] {delay}s [ + ]` controls replacing the multi-line input and `1.5s/2.5s/4s/6s` chips, and `Rewind on resume` switch), and an **`Autocomplete`** switch.
- **Decoupled Course Completion vs. Playback Resume (`server/routes/courses.js`, `src/components/settings/SettingsModal.jsx`, `src/components/course/SyncPreviewModal.jsx`, `src/contexts/SettingsContext.jsx`):**
  - `recalculateCourseProgress` in `duration` mode now computes `completionPercentage` strictly from explicitly completed/checked lessons (`completedDuration / totalDuration * 100`), rather than mixing in playback resume positions (`watch_progress`) from unchecked videos.
  - Per-video playback tracking (`watch_progress`, `last_watched_position`, `last_watched_at`) remains completely independent for playback resume, per-video history progress bars, and watched-time analytics.
  - Renamed Settings UI copy from `"By Time Watched"` to `"By Completed Duration"` (`Duration of completed videos ÷ total course duration`), and updated `SyncPreviewModal.jsx` summary subtitle to `"By duration"`.
- **Course Sync & Progress Recalculation (`server/routes/courses.js`, `src/utils/db.js`, `src/utils/fileSystem.js`, `src/pages/HomePage.jsx`, `src/components/course/SyncPreviewModal.jsx`):**
  - Added `POST /api/courses/:id/recalculate-progress` returning previous and updated stats (with 404 fallback in `db.recalculateCourseProgress`), and integrated progress recalculation into both initial sync preview (`handleSyncCourse`) and sync confirmation (`applySyncChanges`).
  - Displayed a dedicated Progress status card inside `SyncPreviewModal.jsx` and summary toast feedback when sync completes.

### Fixed
- **Picture-in-Picture Event Listeners & TS Error (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`):**
  - Replaced unsupported JSX props `onEnterPictureInPicture` / `onLeavePictureInPicture` on `<video>` with native DOM event listeners (`enterpictureinpicture` / `leavepictureinpicture`) in a `useEffect` hook, restoring actual runtime PiP state synchronization and clearing TypeScript `TS2322`.
  - Fixed strict index signature property access on `row.dataset["lessonIdx"]` (`TS4111`).
- **Inflated Course Percentage on Unchecked Watched Videos (`server/routes/courses.js`):** Fixed duration-weighted progress reporting inflated percentages (e.g. `36%` for `3/90` completed lessons) when sequential or partial playback left `watch_progress > 0` on unchecked videos.
- **SQLite `PRAGMA foreign_keys` Persistence & Orphaned Videos (`server/database.js`, `server/routes/courses.js`):** Re-enabled `PRAGMA foreign_keys = ON` after `sql.js` `db.export()` calls and added self-healing cleanup for orphaned video rows belonging to deleted modules during recalculation.
- **Vault Hydration `ReferenceError` (`server/routes/courses.js`):** Defined `hydratedSummaries` in `POST /api/courses/:id/hydrate-vault` so course sync vault hydration succeeds even when `.tutin/notes/notes.json` is absent.
- **Duration Overwrite & Clamping Guards (`src/utils/fileSystem.js`, `src/utils/db.js`, `server/routes/videos.js`):** Prevented sync scans with unprobed `0` durations from overwriting player-detected video durations, clamped `watch_progress` (`0..1`) and `last_watched_position` (`>= 0`), and kept duration-weighted incomplete courses strictly below `100%`.

### Removed
- **Redundant General Settings & Visible Local Saved Subheader (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/settings-modal.tsx`):**
  - Removed visible `"Saved locally"` subheader text from the Settings modal.
  - Removed the `Course artwork` / `Open generator` section from the General settings tab (already available in the main dock).
  - Removed the `Subtitle language` dropdown setting from the General settings tab.
  - Removed obsolete playback controls (`Default speed` slider, `Pause in background` toggle, and `Autoplay next` toggle).
- **Instructor Category Filter Bar & Badges (`new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/instructors-page.tsx`):**
  - Removed category tag filter buttons (`All`, `AI & Machine Learning`, `Web Development`, `System Design`, `Cloud`) and the instructor counter chip (`10 instructors`) from the Instructors list view.
  - Removed the category status pill beside the instructor name in the Instructor detail view.
- **Standalone "Capture video screenshot to new note" Button (`src/components/player/NotesPanel.jsx`, `new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/components/course-player.tsx`):** Removed the extra screenshot-to-new-note button next to the Add note control (inline frame capture inside the note editor remains intact).

## [v5.1.0] - 2026-09-25

### Added & Major Features
- **Dual-Transcript TTS vs. Caption Pipeline:**
  - Decoupled display subtitles (`.vtt`) from voice synthesis companion tracks (`.tts.json`). Subtitles remain concise for human readability, while speech synthesis uses stitched, punctuated sentences with natural acoustic boundaries.
  - Implemented phonetic dialect nudging for Arabic dialects (Egyptian e.g., `أُلتِلُه`, `دِلْوَأْتي`, `عَشَان` and Gulf e.g., `إِلْحِين`, `أَبِي`) so text-to-speech models pronounce colloquial dialect words naturally without awkward Modern Standard Arabic (MSA) artifacts.
  - Added automatic `.tts.json` companion file synchronization when translating or uploading captions, stored in course module vaults or AppData fallback directories.
- **Modular On-Demand Neural Punctuation Restoration:**
  - Integrated local neural punctuation restoration via dedicated Hugging Face models (`Naqta` for Arabic and `FullStop-Punctuation-Multilang-Large` for Latin/multilingual).
  - Language-partitioned on-demand downloading: users only download the model for their chosen language (e.g. ~140MB for Arabic Naqta) rather than huge monolithic bundles.
  - Added acoustic pause boundary detection and token-level punctuation remapping (`remapPunctuatedTextToCues`) to restore punctuation to raw Whisper transcripts and punctuation-free uploaded SRT/VTT files without losing original cue timing.
- **Process Timing & Performance Console Debuggers:**
  - Added real-time performance instrumentation and structured `console.table` logging across all AI tasks:
    - **Dubbing Pipeline:** Demucs vocal separation, XTTS warmup, voice reference extraction, neural speech synthesis (total duration + avg latency `ms/cue`), audio normalization & ducking, and total pipeline time.
    - **Speech-to-Text:** 16kHz audio extraction/resampling time, Whisper transcription duration, cue count, and total elapsed time.
    - **Translation:** NLLB-200 streaming duration and cue counts.
    - **Punctuation:** Neural restoration latency and word throughput.
- **Active AI Process Cancellation:**
  - Added dedicated, one-click **"Cancel Dubbing"** and **"Cancel Process"** buttons to DubModal and TranslateModal.
  - Safely terminates running Whisper Web Workers (`cancelActiveTranscription()`), aborts active translation SSE network streams (`AbortController`), and sends cancellation signals to the Python synthesis backend (`POST /api/dub/video/:videoId/cancel` → `DELETE /job/{job_id}`).

### Improvements & Optimizations
- **XTTS Adaptive Time-Fitting:**
  - Word-density speed pre-biasing (`words / 2.6s` estimator) preventing high-tempo pitch artifacts.
  - Inter-segment silence gap absorption (absorbing up to 450ms into natural speech pauses before applying time-stretch).
  - Adaptive single retry with Rubber Band compression for clean temporal alignment without robotic voices.
- **Shared Transformer Model Pipeline Caching:**
  - Fixed duplicate transformer model instantiations in RAM by using normalized cache keys (`multilingual` vs `ar`) in `dubbing_server.py`.
- **Decoupled Spoken Audio vs. Caption Source Language:**
  - Users can now select any available transcript language as the AI dubbing source independently of the video file's native audio language.

### Bug Fixes
- Fixed critical word-duplication underflow bug in `sliceTranslatedSentenceToCues` where short phrases duplicated across cues.
- Fixed `courseLanguage` fallback bug in auto-dubbing translation route causing wrong source language translation.
- Fixed `sourceLanguage` parameter propagation across `DubModal.jsx` and the Express dubbing route.
- Fixed punctuation model cache directory path mismatch in `dubbing_server.py`.
- Added text sanitization (`sanitize_dub_text`) and single-cue crash protection in the XTTS synthesis loop.
- Added automatic unlinking of companion `.tts.json` files when deleting captions via `DELETE /api/transcripts/:videoId`.
- Fixed stray space normalization before punctuation marks in `remapPunctuatedTextToCues`.
- Fixed `hasSourceCaptions` in `TranslateModal.jsx` so uploaded/existing captions don't trigger forced Whisper re-transcription.
- Fixed Node.js `SyntaxError: Unexpected reserved word` caused by dynamic `await import` in `server/routes/transcripts.js`.

## [v5.0.0] - 2026-09-25

### Added & Major Updates
- **Course Canvas:** Introduced `CourseCanvasPage` for an infinite canvas (node-based) editor to visually organize concepts and modules within a specific course. Added `CanvasNode` and `CanvasEdge` components. (Distinct from the global Roadmap feature).
- **Smart Pauser:** Added a smart pausing mechanism that detects when you are typing notes, pauses the video, and shows a visual countdown before resuming playback.
- **Enhanced Notes Tab:** Complete overhaul of the note-taking system. Added rich Markdown support, inline image cropping, and better syncing with video playback progress.
- **AI & Transcripts:** 
  - Improved AI Summary Panel with Gemini 2.0 Flash integration.
  - Added Smart Captions Modal for better handling and auto-detecting of subtitle files in the same folder.
  - New Transcript Autocomplete feature for smarter AI text handling.
- **Dubbing & Translation:** 
  - Integrated local Python FastAPI server for high-quality XTTS v2 voice cloning and background audio dubbing.
  - Added new Translation and Dubbing Modals, allowing seamless subtitle translation and audio dubbing in 16+ languages.
- **Bulk Editor / Course Manager:** 
  - Added `CourseManagerPage` and `BulkEditPlaylist` for mass-managing video rows.
  - Bulk Translation and Bulk Dubbing features, allowing you to process entire modules or courses at once.
  - Background jobs manager to track progress of long-running tasks.
- **Storage Data & Backups:** 
  - Added functionality for robust local JSON backups (e.g. `tutin_backup_*.json`) to safely export and import course structures, notes, and progress.
- **Floating Mini Player:** Added `FloatingMiniPlayer` for seamless picture-in-picture while navigating the app.

### Fixed
- Fixed progress calculation sync issues and note editor cursor jumping.
- Addressed various bugs in the AI text chunking and translation formatting.

### Refactored
- Extensive codebase refactoring for cleaner component structure, removing dead code, and simplifying UI states.
- Enhanced database schema for persistent handles and watch sessions.
