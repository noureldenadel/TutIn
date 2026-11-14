# Changelog

All notable changes to **TutIn v6 (`new ui`)** are documented in this file.

## [Unreleased]

### Changed & Fixed
- **Course Card Top-Right Frosted 3-Dots Menu & Hover Continuity (`client/src/components/layout/app-shell.tsx`):**
  - Returned `CourseMenu` (`MoreVertical`) to the top-right corner of the thumbnail (`top-3 right-3 z-20`) so card titles regain full width, using a lightweight translucent frosted glass trigger (`size-8 rounded-lg bg-card/85 dark:bg-white/15 backdrop-blur-md`) matching the center action button instead of a heavy dark patch over artwork.
  - Set `<DropdownMenu modal={false}>` alongside `data-menu-open` exit-grace tracking (`handleMenuOpenChange`) so Radix never sets `pointer-events: none` on `<body>` when opened—preventing hover drop on click and re-hover flicker on `Escape` across both Home and Instructor pages.

### Fixed
- **Persistent Root `AppShell` & Continuous Nav Rail Transitions (`client/src/routes/__root.tsx`, `client/src/routes/*.tsx`, `client/src/components/layout/app-shell.tsx`):**
  - Moved `<AppShell>` from individual route files into `RootLayout` (`routes/__root.tsx`) wrapping `<Outlet />` so `IconDock`, modals, and theme/settings state remain mounted across every route navigation instead of unmounting and remounting on each click.
  - Removed `lastSettledNavIndex` and the single-`requestAnimationFrame` mount workaround in `IconDock` (whose CSS transition was coalesced away on cached route transitions after the first navigation per reload); the persistent `bg-accent` capsule and left indicator pill now slide smoothly on every route switch, while `<main>` resets scroll on `pathname` changes and applies directional `navMotion` entry transitions keyed by `pathname`.

### Fixed
- **Persistent Root `AppShell` & Continuous Nav Rail Transitions (`client/src/routes/__root.tsx`, `client/src/routes/*.tsx`, `client/src/components/layout/app-shell.tsx`):**
  - Moved `<AppShell>` from individual route files into `RootLayout` (`routes/__root.tsx`) wrapping `<Outlet />` so `IconDock`, modals, and theme/settings state remain mounted across every route navigation instead of unmounting and remounting on each click.
  - Removed `lastSettledNavIndex` and the single-`requestAnimationFrame` mount workaround in `IconDock` (whose CSS transition was coalesced away on cached route transitions after the first navigation per reload); the persistent `bg-accent` capsule and left indicator pill now slide smoothly on every route switch, while `<main>` resets scroll on `pathname` changes and applies directional `navMotion` entry transitions keyed by `pathname`.

### Changed
- **Flat Thumbnails, Optional Instructors & Clearer Course Sort Labels (`client/src/components/`, `client/src/lib/`):**
  - Removed the lower dark gradient overlays (`bg-gradient-to-t from-black/*`) from both `CourseThumbnail` (dropped unused `showOverlay` prop/overlays) and `CourseCard` (retained only the full-surface `bg-black/30` hover dim behind the center action icon).
  - Stopped fabricating `"Instructor"` (in `mapApiCourse`, `importScannedLocalCourse`, and `AddCourseModal`), `"External"`, or `"Self-paced"` when a course has no instructor, and hid empty instructor avatar/label rows across `CourseCard`, `CoursePlayer`, `CurriculumManager`, and `RoadmapPage` while using `flex h-full flex-col` + `mt-auto pt-5` on cards so grid progress bars stay aligned.
  - Renamed `COURSE_SORT_OPTIONS` from `["Recently opened", "Progress", "Course title"]` to `["Recent", "Progress", "A–Z"]` (`courses.ts`, `HomePage`, `InstructorsPage`).

### Changed & Fixed
- **Animated Left Nav Rail & Directional Page Transitions (`client/src/components/layout/app-shell.tsx`, `client/src/styles.css`):**
  - Replaced static per-button active highlights in `IconDock` with a shared GPU-composited (`translate3d` over `250ms cubic-bezier(0.22, 1, 0.36, 1)`) sliding `bg-accent` highlight capsule and left indicator bar (`lastSettledNavIndex` persistence across route mounts), paired with subtle icon hover/press micro-interactions (`motion-reduce` safe) and directional workspace entry transitions (`animate-page-enter-down` / `animate-page-enter-up` for scrollable pages, `animate-page-fade` for `fixedViewport` canvases).
- **`HH:MM:SS` Course Duration Tags & Optical Vertical Centering (`client/src/lib/format.ts`, `client/src/lib/courses.ts`, `app-shell.tsx`, `roadmap-page.tsx`, `history-page.tsx`):**
  - Added `formatDurationClock` (`02:33:00` padded `HH:MM:SS` format) and updated `mapApiCourse` (`course.duration`) so course cards show `HH:MM:SS` instead of `Xh Ym`.
  - Centered thumbnail time tags vertically across `CourseCard`, `RoadmapPage`, and `HistoryPage` using `inline-flex h-5 items-center justify-center rounded-sm` with `.duration-badge-text` (`line-height: 1; text-box: trim-both cap alphabetic;`).
- **Course Card 3-Dots Placement & Menu Hover Continuity (`client/src/components/layout/app-shell.tsx`):**
  - Moved `CourseMenu` off the thumbnail onto the right side of the card body's title row using a lightweight borderless `<MoreVertical />` icon button, removing the dark floating corner block over cover artwork.
  - Added `data-menu-open` + short exit-grace tracking (`handleMenuOpenChange`) so opening the menu and pressing `Escape` keeps the card's hover state steady without un-hovering or re-triggering hover animations.

### Changed
- **Canvas HUD Reset Arrangement Action (`client/src/lib/course-canvas.ts`, `client/src/components/canvas/canvas-hud.tsx`, `client/src/components/canvas/course-canvas-page.tsx`):**
  - Replaced the duplicate `<RotateCcw />` `Reset view` HUD button with `Reset arrangement` (`resetCanvasArrangement`, placed beside `Tidy` while keeping click-to-reset-view on the `{zoom}%` readout) to return all on-canvas course video cards (`detached` and `reassigned` alike) to their origin Video Artboards sorted chronologically by timestamp, reset Video Artboard widths and `layoutMode = "auto"`, drop empty Video Artboards, and realign columns via `tidyAllCanvasArtboards` without discarding custom Artboards, canvas-only notes, strokes, or viewport zoom/pan (supports `Undo`).
  - Updated `advancePastOverlappingCards` and `tidyAllCanvasArtboards` to consider full estimated Artboard height so ungrouped lower canvas cards are skipped cleanly.

### Fixed
- **Chronological Canvas Artboards, Return/Restore Sorting & Cross-Course Group IDs (`client/src/lib/course-canvas.ts`, `client/src/components/canvas/course-canvas-page.tsx`, `server/routes/canvas.js`):**
  - Scoped auto-created Video Artboard IDs per course (`vgroup-${courseId}-${lessonIdx}` via `getVideoArtboardId` and `findVideoArtboardGroup`) and added automatic legacy `vgroup-<n>` remapping in both `reconcileCanvasWithNotes` and `writeCanvasPayloadToDb` (`routes/canvas.js`) to prevent SQLite `canvas_groups.id` primary-key collisions and silent cross-course overwrites.
  - Updated `createVideoArtboardGroup` (`shiftGroupsHorizontally` + `advancePastOverlappingCards`) so new earlier-lesson Artboards insert at their chronological `lessonIdx` column left-to-right (shifting later columns and avoiding detached cards), and updated `tidyAllCanvasArtboards` to advance past ungrouped left-column cards.
  - Added shared `attachCardToOriginVideoGroup`, `returnCardToOriginGroup`, and `restoreNoteCardToCanvas` so returning a detached card or restoring an off-canvas note into an `'auto'` Artboard re-runs `reflowAutoVideoGroup` + `shiftGroupsBelowColumn` in timestamp order rather than appending out of order at the bottom.
  - Added untouched legacy v1 pile recovery inside `reconcileCanvasWithNotes` (`>= 2` left-column `cnode_*` cards missing their lesson Artboard) so legacy courses automatically seat into sorted lesson Artboards.
- **MographPlus & Domestika Canvas v2 Vault Repair (`%APPDATA%/TutIn/tutin.db`, `.tutin/canvas.json`):**
  - Repaired *MographPlus - The Ultimate Introduction to Arnold 6 For Cinema 4D* (`11` chronological Artboards `M1L2`–`M2L8`, all `30` cards seated with `0` detached and `19` `auto-chrono` edges) and *Design Your Own Creative Process* (preserved the user's custom Artboard, `New course note`, and `2` manually positioned cards while seating `29` untouched left-column `cnode_*` cards into `5` sorted Video Artboards `M1L3`–`M1L7`, `24` edges), with pre-repair SQLite snapshot at `tutin.db.pre_canvas_order_bak`.

### Fixed
- **Canvas Pan Gesture `origPanX` Null Crash (`client/src/components/canvas/course-canvas-page.tsx`):**
  - Captured `panGestureRef.current`'s `origPanX`/`origPanY` and computed `nextPanX`/`nextPanY` synchronously before invoking `setCanvasState((prev) => ...)` in `handleStagePointerMove`, preventing `TypeError: Cannot read properties of null (reading 'origPanX')` when React executes the batched state updater after `pointerup` clears `panGestureRef.current = null`.

### Changed
- **Player Notes Empty State (`client/src/components/player/course-player.tsx`):**
  - Removed the redundant `Add note` button beneath `"No notes yet."` in `NotesTab` (the top toolbar already exposes `Add note · {time}`).

### Fixed
- **Note Image Serving, Card Encoding & Artboard Bounds Containment (`server/routes/notes.js`, `client/src/lib/course-canvas.ts`, `client/src/components/canvas/`):**
  - Passed `{ dotfiles: 'allow' }` in `res.sendFile` inside `GET /api/notes/media/:courseId/:filename` (`notes.js`) so Express no longer returns `404` when serving screenshots inside dot-prefixed `.tutin/notes/screenshots/` directories.
  - Fixed UTF-8 mojibake (`Â·` and `â€¦`) across `canvas-card.tsx` (`·` separator and `Loading image…` / `Caption…` / `Type text…` / `Write note…` strings).
  - Fixed real Artboard containment gaps (`fitArtboardsToChildren`, `applyCardHeightUpdate`, and `ResizeObserver` on `CanvasCardView`) so Artboards automatically expand (left/top header clearance/right/bottom) on hydration, drop, inline card edit, card resize, and async screenshot image load; updated `findNextColumnX` so auto-created Artboards never spawn behind existing detached cards; and enabled 1-click `Return` on detached cards even when their lesson Artboard hasn't been created yet (`createVideoArtboardGroup`).

### Changed
- **Module-Scoped `M{m}L{l}` Canvas Lesson Labels (`client/src/lib/course-canvas.ts`, `canvas-card.tsx`, `canvas-artboard.tsx`, `canvas-notes-drawer.tsx`, `course-canvas-page.tsx`):**
  - Added `formatCanvasLessonCode` and `formatCanvasArtboardTitle` to replace flat `L{n}` labels with module-aware `M{modIdx + 1}L{lessonInModule + 1}` identifiers across Video Note chips, Lightbox captions, Notes Drawer sections, and auto-generated Artboard titles (preserving manual Artboard renames and showing module titles on hover tooltips).

### Fixed
- **Legacy Note & Screenshot Rendering on Canvas v2 (`server/routes/notes.js`, `server/routes/canvas.js`, `client/src/lib/course-notes.ts`, `client/src/lib/course-canvas.ts`):**
  - Added `formatNoteRow` in `notes.js` and `snake_case`/`camelCase` fallback mapping + `appendMissingImagesToHtml` in `mapApiNoteRow` (`course-notes.ts`) so notes returned from SQLite always resolve to their true `videoId` / `lessonIdx` instead of defaulting to `L1` (`lessonIdx = 0`), and standalone `images[]` entries render even when absent from HTML `content`.
  - Updated `readCanvasStateFromDb` (`canvas.js`) and `reconcileCanvasWithNotes` (`course-canvas.ts`) so video-linked legacy v1 cards never remain stuck in `'canvas-only'` state (`'auto'`, `'reassigned'`, or `'detached'` with `isCanvasOnly: false`).
  - Upgraded `estimateVideoNoteCardHeight` (`172px/image`, `[128, 2200]` px) to account for inline `<img>` tags, block breaks, and wrapped text lines, triggering `autoGroupsToReflow` whenever card heights expand on hydration so multi-screenshot notes never overlap.

### Changed
- **Upgraded Existing Course Notes, Extracted Screenshots & Repaired Canvas v2 Vaults (`%APPDATA%/TutIn/tutin.db`, `D:\Master Classes\*\.tutin\`):**
  - Extracted `201` unique inline base64 screenshots (`12.74 MB`) across all `235` notes into `<courseFolder>/.tutin/notes/screenshots/shot_*.{png,jpg,webp,gif}` (served via `/api/notes/media/:courseId/:filename`) and AppData fallback for deleted courses, compacting `tutin.db` from `48.46 MB` to `10.66 MB` (`0` remaining inline `data:image/` strings; backup saved at `tutin.db.pre_note_upgrade_bak`).
  - Fixed `Cinema 4D Basecamp`'s stale `(incompleted)` `folder_path` to `D:\Master Classes\School of Motion - Cinema 4D Basecamp` and synced all `10` active local course `.tutin/notes/notes.json` vaults.
  - Repaired `MographPlus` (`18` preserved `cnode_*` cards at custom `(x, y)` coords, removed bogus `vgroup-0` + `12` misplaced `vcard-*` + `11` `auto-chrono` edges) and `Domestika` (preserved custom group + all `33` cards with corrected `originLessonIdx`, `membershipState`, and heights) and synced both `.tutin/canvas.json` files.

### Fixed
- **Home Library `In Progress` & `Completed` Filter Logic (`client/src/components/layout/app-shell.tsx`, `client/src/lib/courses.ts`):**
  - Fixed `In Progress` (`HomeLibrary`) so `0%` not-started courses no longer appear under `In Progress`, matching only active incomplete courses (`!isCompleted && (course.completionPercentage > 0 || course.completedVideos > 0)`).
  - Checked `Completed` strictly against `course.completionPercentage >= 100` (in both `HomeLibrary` filtering and `CourseCard`) and prevented `mapApiCourse` from rounding `< 100%` (e.g., `99.9%`) courses up to `100%`.

### Changed
- **Unified Desaturated Emerald (`chart-4`) & Player Playlist `Manage` Placement (`app-shell.tsx`, `analytics-dashboard.tsx`, `course-player.tsx`, `add-course-modal.tsx`, `settings-modal.tsx`, `sync-preview-modal.tsx`):**
  - Replaced all saturated Tailwind `emerald-*` utilities (activity heatmap tiles, watch-time badge, `100%` course/module progress text, vault callouts, sync indicators, and feedback icon) with `--chart-4` (`text-chart-4`, `bg-chart-4/*`) to match completed lesson checkmarks across light and dark themes.
  - Moved the `/manage/$courseId` `Manage` link from the `CoursePlayer` top header into `PlaylistTab`'s header row in place of the removed `Manage lessons` batch toggle (`Mark done` / `Reset`).

### Removed
- **Roadmap Header `+ New` Button (`client/src/components/pages/roadmap-page.tsx`):**
  - Removed the redundant `+ New` button from the top-right roadmap toolbar; new roadmaps continue to be created via `+ New roadmap` inside the title chevron dropdown menu.

### Changed
- **Sorter Labels, Statistics Rename & Roadmap Wheel Zoom (`app-shell.tsx`, `course-player.tsx`, `analytics-dashboard.tsx`, `welcome-guide-modal.tsx`, `roadmap-page.tsx`):**
  - Removed the `"Sort: "` prefix across `CourseSortDropdown` and player note order tooltips (`Oldest first` / `Latest first`) so only the active sort mode is shown.
  - Renamed `Analytics` nav label, page heading, and Welcome Guide copy to `Statistics` while keeping `/analytics` routing intact, and changed `Learning focus` subtitle from `"From course tags"` to `"Based on tags"`.
  - Updated `RoadmapPage` to zoom toward the cursor (`0.35x`–`2.0x`) on plain mouse-wheel scroll over the canvas via a `{ passive: false }` wheel listener (no `Ctrl`/`Cmd` modifier required).

### Fixed
- **Statistics `Learning focus` Overflow (`client/src/components/pages/analytics-dashboard.tsx`):**
  - Added `min-w-0` to `Card` and `min-w-0 w-full sm:w-auto sm:flex-1` to the legend `<ul>` (plus `shrink-0` on `{u.pct}%`) so long tag titles and course summaries truncate cleanly with `...` instead of overflowing or stretching the grid card.

### Changed
- **Instructor Detail Sorter & Shared Sorting Helper (`client/src/lib/courses.ts`, `app-shell.tsx`, `instructors-page.tsx`):**
  - Extracted `COURSE_SORT_OPTIONS` and `sortCourses()` into `courses.ts` and shared `CourseSortDropdown` from `app-shell.tsx`.
  - Replaced the redundant `N courses` count on the Instructor Detail `Courses` row (already shown in the profile header summary) with `CourseSortDropdown`.
- **Home Page Layout, Course Tags Filter & Official TutIn Favicon (`client/src/components/layout/app-shell.tsx`, `client/public/tutin-icon.svg`, `client/index.html`):**
  - Moved the segmented status filter bar (`All`, `In Progress`, `Completed`) down onto the same sub-row as the `Sort:` dropdown and appended dynamic sorted course tags (`allTags`) right after the status tabs inside the horizontally scrollable track.
  - Kept the `Search courses` input (`sm:w-64 lg:w-80`, keeping keyboard `Ctrl+K` focus and adding a clear `X` button when non-empty) and `AddCourseControl` in their top-right `<header>` position.
  - Replaced template `/favicon.ico` in `index.html` with the classic TutIn geometric `"T"` squircle icon (`/tutin-icon.svg`), while preserving `DotLogo` in the left navigation `IconDock`.

### Removed
- **Instructor Avatar Floating `X` Badge (`instructors-page.tsx`, `instructor-avatar.tsx`):**
  - Removed the floating corner `X` button over the circular avatar on Instructor Detail pages (along with unused `deleteInstructorAvatar` / `hasCustomAvatar` / `handleRemoveAvatar` code), keeping hover-to-replace via the `Camera` overlay.
- **Thumbnail Link Badge, Visual `Ctrl+K` Search Hint & Old Favicon (`app-shell.tsx`, `favicon.ico`):**
  - Removed the persistent `"Link"` badge overlay on `CourseCard` video thumbnails, removed the `<kbd>Ctrl+K</kbd>` pill inside the Home search bar, and replaced `public/favicon.ico` with `public/tutin-icon.svg`.
- **Admin Page & Artwork Customization Controls (`client/src/routes/admin.tsx`, `admin-dashboard.tsx`, `app-shell.tsx`, `thumbnail-generator.ts`, `app-settings.ts`):**
  - Removed `/admin` route, `AdminDashboard`, and the `Admin` dock navigation button cleanly.
  - Preserved the exact saved `2f65126` configuration inside `DEFAULT_GENERATOR_SETTINGS` (`hue: 150`, `drift: 25`, `density: 36`, `variance: 50`, `contrast: 60`, `spark: 20`, `bands: 3`, `pattern: "auto"`, `lockHue: false`, `avatarContrastMode: "manual"`, `avatarFontWeight: "500"`, `avatarFontFamily: "sans"`, `avatarFontSize: 8`, `avatarBgTone: 3`, `avatarFgTone: 1`) while removing runtime customization hooks/listeners (`useThumbnailSettings`, `tutin_thumbnail_settings_v3`, `tutin:thumbnail_settings_changed`, `thumbnailGeneratorSettings` server sync, `SETTINGS_DEFS`, `PATTERN_NAMES`, preview-only props on `CourseThumbnail` and `InstructorAvatar`, and unused contrast mode branches).

### Changed
- **Restored `2f65126` Admin Artwork Engine & Default Configuration (`client/src/lib/thumbnail-generator.ts`, `app-settings.ts`, `course-thumbnail.tsx`, `instructor-avatar.tsx`, `admin-dashboard.tsx`):**
  - Restored `DEFAULT_GENERATOR_SETTINGS` (`hue: 150`, `drift: 25`, `density: 36`, `variance: 50`, `contrast: 60`, `spark: 20`, `bands: 3`, `pattern: "auto"`, `lockHue: false`, `avatarContrastMode: "manual"`, `avatarFontWeight: "500"`, `avatarFontFamily: "sans"`, `avatarFontSize: 8`, `avatarBgTone: 3`, `avatarFgTone: 1`), the `320×180` 5-tone palette generator (`computePalette` / `generateThumbnailSvg`), `getAvatarColors` / `getInstructorPalette`, and the Manual **Tone 1–5** background/foreground swatch pickers in `AdminDashboard` while keeping SQLite `/api/settings` persistence and live `useCoursesList()` previews without sample cover fixtures.
  - Updated `sanitizeThumbnailSettings` and `hydrateAppSettingsFromServer` to discard stale `avatarSaturation`-without-`avatarBgTone` payloads from the intermediate build so restored defaults apply cleanly.

### Fixed
- **Vite Dev Server IPv4 Loopback Binding (`client/vite.config.ts`):**
  - Added `server.host: "127.0.0.1"` on port `5173` so both `http://127.0.0.1:5173/` and `http://localhost:5173/` bind and resolve reliably on Windows (previously Vite resolved `localhost` to IPv6 `::1` only, leaving `127.0.0.1:5173` unreachable).

## [6.0.0] - 2026-11-13

### Added
- **Unified Express + SQLite Backend (`server/`):**
  - Migrated the non-AI Express 5 + `sql.js` server into `new ui/server/` on default port `9474` (`findAvailablePort` on `127.0.0.1`), reading `%APPDATA%/TutIn/tutin.db` (`TUTIN_DATA_DIR` overrideable).
  - Exposed REST routes (`/api/courses`, `/api/modules`, `/api/videos`, `/api/notes`, `/api/analytics`, `/api/instructors`, `/api/roadmaps`, `/api/settings`, `/api/transcripts`, `/api/summaries`, `/api/search`, `/api/data`, `/api/fs`, `/api/youtube`, `/api/canvas`), range-requested video streaming (`/video/*filePath`), `courseScanner.js`, `pathRepair.js`, and MP4/TS duration parsing (`mp4Parser.js`, `tsParser.js`, `ffmpeg.js`).
  - Configured `new ui/package.json` root scripts (`server`, `server:dev`, `client`, `build`, `start`, `start:prod`, `typecheck`, `lint`) and `client/vite.config.ts` dev proxies for `/api` and `/video` targeting `http://127.0.0.1:9474`.
- **Windows Launcher & Standalone Documentation (`start-dev.bat`, `README.md`, `CHANGELOG.md`, `docs/`):**
  - Added `start-dev.bat` checking Node.js/npm, installing missing dependencies across `new ui/`, `server/`, and `client/`, opening `http://127.0.0.1:5173`, and starting backend + frontend concurrently.
  - Added standalone documentation (`README.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, and synchronized `docs/UI_UX_SYSTEM.md` and `client/README.md`).
- **Course Notes Canvas v2 (`server/database.js`, `server/routes/canvas.js`, `client/src/components/canvas/`):**
  - Added SQLite `migration007` introducing `canvas_groups`, `canvas_strokes`, `canvas_course_meta` (`dismissed_note_ids`, `last_sync_revision`), and rich card/edge columns.
  - Added `GET/PUT /api/canvas/:courseId` and `POST /api/canvas/:courseId/sync-notes` syncing SQLite with `<courseFolder>/.tutin/canvas.json`, and included all Canvas v2 tables in `/api/data/export` and `/api/data/import`.
  - Built `/canvas/$courseId` whiteboard with lesson Video Artboards, dashed `auto-chrono` progression arrows, sibling bridging on detach + `Detached`/`Return`, bottom append for player notes, collapsible headers, `perfect-freehand` Pen/Highlighter/Eraser ink parented to artboards, and `Off canvas` recovery drawer.
- **Vault Note Screenshots & Frame Capture (`server/routes/notes.js`, `client/src/components/notes/rich-note-surface.tsx`):**
  - Added `POST /api/notes/media` and `GET /api/notes/media/:courseId/:filename` storing pasted, dropped, uploaded, cropped, and captured video frames under `<courseFolder>/.tutin/notes/screenshots/` (with `TUTIN_DATA_DIR/screenshots/` fallback).
- **MPEG-TS `.ts` Playback, Captions Batch Import & Explorer Actions (`client/src/components/player/course-player.tsx`, `client/src/components/modals/smart-captions-modal.tsx`):**
  - Added `mpegts.js` `.ts` stream playback alongside HTML5 playback and native Browser Picture-in-Picture, plus `?videoId=` deep-linking and configurable `resumePlayback` / `autoMarkCompleteAt`.
  - Added `SmartCaptionsModal` for batch-matching `.srt`/`.vtt` subtitles across sibling lessons, plus `POST /api/fs/open-folder` for `Show in Explorer`.
- **History Deletion & Real-Tag Analytics (`server/routes/analytics.js`, `client/src/components/pages/history-page.tsx`, `analytics-dashboard.tsx`):**
  - Added `DELETE /api/analytics/history` and `DELETE /api/analytics/history/:itemId` and wired calendar-grouped watch history rows to course URLs and player `?videoId=` routes.
  - Built `LearningFocus` donut telemetry weighted dynamically from real SQLite course tags (`--chart-1`..`--chart-4` + `Other`).
- **Onboarding, Settings & Artwork Admin (`welcome-guide-modal.tsx`, `settings-modal.tsx`, `admin-dashboard.tsx`):**
  - Added 4-step `WelcomeGuideModal` synced via `/api/settings` (`welcomeGuideSeen`), 7-tab `SettingsModal` (`General`, `Shortcuts`, greyed-out `AI`/`Voice`, `Data` export/import/reset via `/api/data/*` & `/api/notes/stats`, `Feedback`, `About`), and `/admin` algorithmic SVG artwork & avatar contrast playground persisted in SQLite `settings`.

### Changed
- **UI & Architecture Modernization (`client/`):**
  - Rebuilt the interface on React 19, Vite 8, TanStack Router SPA routing, Tailwind CSS v4 OKLCH tokens, tonal borderless depth separation, edge-to-edge `<main>` shell, restrained emerald completion semantics (`CourseCard` & `PlaylistTab`), and copy-economy UX.
  - Upgraded version identifiers across `package.json`, `server/package.json`, `client/package.json`, `/api/health`, server banner, `User-Agent`, Settings `About`, and docs to **v6 (`6.0.0`)**.
  - Wired `AddCourseModal`, `EditCourseModal`, `SyncPreviewModal`, `RoadmapPage`, and `InstructorsPage` directly to SQLite `/api/*` endpoints and native `/api/fs/*` OS pickers.

### Removed
- **Legacy SSR/Prototype Clutter & Old AI/Dubbing Pipelines:**
  - Excluded legacy Whisper STT, NLLB translation, neural punctuation models, OpenRouter summarization workers, and Python/CUDA XTTS voice dubbing routes until rebuilt from scratch; greyed out `AI` and `Voice` Settings tabs and curriculum AI/dub buttons with zero requests to removed endpoints.
  - Removed sample placeholder cover images (`SAMPLE_COVERS`, `coverMode`), legacy Settings Data Maintenance controls (superseded by `SyncPreviewModal`), Lovable/SSR boilerplate, and floating custom mini-player code in favor of native Browser PiP.

### Fixed
- **Type Safety, Sync Loops & Interaction Polish:**
  - Resolved `exactOptionalPropertyTypes` spreads in `api.ts` and `file-system.ts`, fixed `ThumbnailGenerator` / `InstructorAvatar` / `CourseThumbnail` helper signatures and SVG `<viewBox="0 0 400 225">` wrapping, fixed `subscribeCourseCurriculumChanged` callbacks and `insertImageCard` dependencies in `course-canvas-page.tsx`, fixed `mpegts.LoggingControl.applyConfig` invocation, and fixed encoding glitches in `roadmap-page.tsx`.

