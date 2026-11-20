# TutIn v8.0 Beta User Guide

> Practical guide for organizing courses, studying lectures, annotating video timelines, mapping ideas on Canvas, and backing up your local TutIn library.

---

## 1. Starting TutIn v8.0 Beta

- **Windows Launcher:** Double-click [`start-dev.bat`](../start-dev.bat) in the repository root. It verifies Node.js/npm, installs missing workspace/server/client packages automatically, opens `http://127.0.0.1:5173`, and runs both the backend (`127.0.0.1:9474`) and client dev server.
- **Terminal & AI Sidecar Setup:** Run `npm start` from the repository root, or follow [`docs/INSTALLATION.md`](./INSTALLATION.md) for manual installs, optional Python `.venv` / CUDA acceleration, and environment variables.
- **Data Storage:** Your library, watch history, roadmaps, settings, and canvas boards live in `%APPDATA%/TutIn/tutin.db` (or `TUTIN_DATA_DIR/tutin.db`). Local folder courses also sync portable artifacts inside `<courseFolder>/.tutin/`.

> [!NOTE]
> AI speech-to-text transcription (`faster-whisper` + WebGPU/WASM fallback), 29-language neural/dialect subtitle translation (`NLLB-200` + OpenRouter), and dual-engine AI voice dubbing (fast `edge-tts` neural voices + local `XTTS-v2` instructor voice cloning with `Background audio`: `Off` or `Music & SFX` modes) are active alongside manual `.srt`/`.vtt` subtitles and Smart Captions batch matching. AI lecture summarization remains deferred.

---

## 2. Course Library & Intake (`/`)

- **Add Course (`+ Add Course`):**
  - **Course folder:** Choose a local directory with the native OS folder picker (or browser folder fallback) to import modules, video durations, existing `.tutin/` vault assets, and folder thumbnails.
  - **YouTube:** Import a playlist or video stream URL with metadata lookup.
  - **Google Drive & Direct link:** Save external course links with manual lesson/duration tracking.
- **Course Card Menu (`...`):**
  - **Edit details:** Update title, instructor, spoken language, tags, custom cover artwork (or revert to generated vector art), and external link progress.
  - **Curriculum / Manage (`/manage/$courseId`):** Reorder or rename lessons/modules, upload `.srt`/`.vtt` subtitle files per video, or run a folder rescan.
  - **Rescan folder (`SyncPreviewModal`):** Compare disk contents against SQLite to repair moved file paths, detect missing durations, and review `.tutin/` vault notes/subtitles/dubs/summaries/canvas changes.
  - **Show in Explorer:** Opens the local course folder directly in your OS file manager.
  - **Open canvas (`/canvas/$courseId`):** Launches the course whiteboard directly.

---

## 3. Study Player (`/learn/$courseId`)

- **Formats:** Plays standard HTML5 formats (`.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`) and streams MPEG-TS (`.ts`) lectures via `mpegts.js`.
- **Player Controls:** Play/pause (tap video, press `Space`/`K`, or hold primary mouse/touch on video `500ms` for temporary `2×` speed), double-click viewport for fullscreen, previous/next lesson, hover volume slider, playback speed/settings (including **`Autoplay next`**, which shows a 3-second `Up next` countdown overlay with `Cancel` / `Play now` and smoothly fades into the next lesson), Audio & Subtitles track switcher (`Original` vs dubbed `.mp3` tracks + `.srt`/`.vtt` subtitles, with `Size` `S`/`M`/`L` and `Box`/`Outline` style controls, drag-to-reposition captions, and double-click/`Reset` to recenter), native Browser Picture-in-Picture (`P` / `I`), fullscreen (`F`), and collapsible study sidebar (`T` or toolbar toggle: `Playlist`, `Notes`, `Transcript`, where you can generate/translate subtitles, import `.srt`/`.vtt`, or dub lectures with background audio `Off` or `Music & SFX`).
- **Keyboard Shortcuts** *(toggleable in Settings -> Shortcuts)*:
  - **Playback:** `Space` / `K` play/pause, hold `Space` (`220ms`) for temporary `2×` speed, `Left` / `Right` or `J` / `L` seek, `,` / `.` step 1 frame when paused, `Up` / `Down` adjust volume, `M` mute, `C` toggle subtitles, `T` toggle sidebar (Theater view), `P` / `I` toggle Picture-in-Picture, `F` / double-click toggle fullscreen, `Shift+N` / `Shift+P` next/previous lesson, `<` / `>` adjust playback speed, `Home` / `End` / `0–9` jump across intervals.
---

## 4. Timestamped Notes & Course Notes Canvas (`/canvas/$courseId`)

### Rich Notes Tab (`Playlist | Notes | Transcript`)
- **Timestamped Cards:** Click `Add note · {time}` to capture a note anchored to the current playback time; click any note's timestamp chip to seek immediately.
- **Formatting & Media:** Supports Bold, Italic, Strikethrough, bullet lists, Markdown triggers (`#`, `-`, `>`, `---` with Obsidian-style Live Preview), video frame capture, file upload, clipboard paste, drag-and-drop images, inline cropping, and block reordering (`Alt + ArrowUp`/`ArrowDown` or toolbar arrows). Screenshots save into `<courseFolder>/.tutin/notes/screenshots/`.
- **Writing Options (`...` popover):** Export markdown notes, open Canvas, and configure **While writing** (auto-pause video, `Resume after {delay}s`, rewind on resume). Settings persist globally across all lessons and courses.

### Whiteboard Canvas (`/canvas/$courseId`)
- **2D Video Artboards & Chronological Links:** Player notes organize into per-lesson artboards (`M{m}L{l} · Title`) laid out in 2D (auto-wrapping long note-heavy lectures into 2–4 height-balanced columns) and linked chronologically by dashed `auto-chrono` arrows. Dragging a note outside detaches it (`Detached` badge + 1-click `Return`) while bridging remaining sibling links.
- **Whiteboard Tools:**
  - `V` Select, `H` / `Space+Drag` Pan, `Alt+Scroll` / `Alt+Middle-Drag` Zoom (`10%–300%`), `0` Fit entire board to view, `N` Canvas Note, `T` Text card, `A` Connect solid Bezier edges, `P` Pen / `M` Highlighter / `E` Eraser vector ink (`perfect-freehand`), `I` Image upload, `G` Custom Frame artboard.
  - `Ctrl+C` / `Ctrl+V` Copy/Paste selected cards & artboards, `Alt+Drag` Duplicate items, right-click `Add to artboard` to group selected cards, `Ctrl+Z` / `Ctrl+Shift+Z` Undo/Redo, `Del` / `Backspace` dismiss or remove selection, `Esc` cancel edit or reset tool.
  - Drag a card's right edge, bottom edge, or bottom-right corner to resize freely, or **double-click** the right edge, bottom edge, or corner to shrink empty space and fit width, height, or both to its content cleanly.
  - Open the top-right **Arrange** menu (`LayoutGrid`) to switch **Artboards** (`Modules` | `Rows` | `Masonry`), **Cards** (`Columns` | `Grid` | `Single`), toggle **Color by module**, **Tidy layout** in place, or **Reset to lectures** (returns moved video notes back into their lesson artboards); click `{zoom}%` to reset to `100%` or `<Maximize />` (`0`) to frame the entire board; and use the right `Notes` drawer (`All`, `Detached`, `Off canvas`) to locate cards or restore dismissed Video Notes.

---

## 5. Roadmaps, Instructors, History & Statistics

- **Roadmap (`/roadmap`):** Build multi-course learning graphs with inline double-click renaming, mouse-wheel cursor zoom over the canvas, and draggable course prerequisite connectors.
- **Instructors (`/instructors`):** Browse instructors, upload custom circular avatars (synced across all views), and filter courses by instructor (`?instructor=:id`).
- **History (`/history`):** Calendar-grouped watch log (`Today`, `Yesterday`, formatted dates) with `All Time` / `This Week` / `This Month` filters, click-to-resume, single-item removal, and `Clear history`.
- **Statistics (`/analytics`):** Watch time totals, streak counter, completed courses progress, activity heatmap, weekly velocity bars, and tag-weighted `Learning focus` breakdown (`Based on tags`).

---

## 6. Settings & Workspace Backups

- **General:** `Appearance` (`Light` / `Dark` / `System`), `Theme` palette presets (`Obsidian`, `Zinc`, `Neutral`, `Stone`, `Graphite`, `Classic`), `Resume playback`, `Mark complete when watched` (`90%` / `95%` / `100%`), `Progress calculation` (`By Videos` / `By Duration` with server recalculation), and `Auto-detect covers`.
- **AI & APIs:** Select Whisper transcription device/model and store OpenRouter + Google API keys for dialect translation, YouTube, and Google Drive intake.
- **Voice:** Configure default AI dubbing engine (`Neural · Fast` vs `Clone`), neural gender (`Male` / `Female`), background audio (`Off` vs `Music & SFX`), cloning compute device (`Auto` / `GPU` / `CPU`), idle VRAM unload toggle, and view local AI model disk usage.
- **Shortcuts:** Toggle playback shortcuts and inspect Player, Canvas, Notes Editor, and Global (`Ctrl+K` command search) keybindings.
- **Data:** View SQLite note/course counts, **Export** full workspace JSON (`courses`, `modules`, `videos`, `notes`, `analytics`, `roadmaps`, `settings`, Canvas v2 boards), **Import** backups, or **Reset** local workspace data safely.
- **About:** View current build (`TutIn v8.0 Beta` / `8.0.0-beta`) and replay the 4-step **Welcome guide** anytime.

