# Changelog

## [Unreleased]

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
