# UI/UX System — TutIn Study Companion

> Living source of truth for TutIn's new UI direction, visual identity, interaction design, and reusable component patterns.

**Development Scope & Maintenance Rule:**
- **Active Canvas:** All active UI development is conducted exclusively inside `new ui/` (`d:\Master Classes\.TutIn\new ui\masterclass-study-companion-main\masterclass-study-companion-main\`). The legacy TutIn UI is disregarded until the new UI design is finalized and ready for migration.
- **Rule of Record:** Review this document before proposing or implementing UI changes in `new ui/`. Update this document whenever a decision, component convention, or token is refined or established.

---

## 1. Product Experience

- **Product Purpose:** A calm, local-first learning space and video study companion for masterclasses, technical lectures, and self-paced courses.
- **Primary Users:** Self-directed learners, students, and professionals studying from local video collections and imported online content.
- **Core User Journeys:**
  1. **Course Library & Discovery:** Browsing courses, checking progress, searching/filtering, and importing new folders or links.
  2. **Active Study & Playback:** Focused video playback with synchronized transcripts, smart notes, flashcards, and quizzes.
  3. **Visual Branding & Customization:** Generating distinct mathematical vector artwork for courses without uploaded covers.
  4. **Curriculum & Analytics:** Managing video playlists, tracking learning consistency, and reviewing instructor profiles.
- **Desired Experience:** Distraction-free workstation aesthetic (inspired by Linear, Raycast, and macOS). Clean, technical, calm, and uncluttered. High cognitive economy with zero visual noise.

---

## 2. Core Design Principles

1. **Floating Workstation Surface:** The main workspace (`<main>`) is treated as a physical surface resting inside a calm background canvas (`--shell`). The navigation dock remains permanently anchored to the screen (`sticky top-0 h-dvh`).
2. **Copy Economy ("Say less, show more"):** If the UI already communicates meaning, extra text is clutter. Remove redundant helper text, section intros, and repeated verbs (e.g. use "Course folder" and "YouTube", never "Add from YouTube").
3. **Solid Recognition Over Wireframe Reading:** Use solid, high-contrast silhouettes and established iconography to speed up recognition.
   - **No emojis** anywhere in the UI.
   - **No icons in decorative colored circles** or rounded squares.
   - Primary recognition targets (e.g. source types) use **flat solid fills** (`fill-current text-foreground`) rather than faint 1px outlines.
   - Brand icons use **authentic geometric marks** in **flat monochrome**—never multi-colored brand logos (no red YouTube, no tricolor Google Drive).
4. **Concentric Curvature:** Radiuses scale down logically from outer containers to inner elements. Outer frame is 16px, cards are 12px, inputs/trays are 8px, buttons/items are 6px, micro-chips are 4px.
5. **Deterministic Aesthetics:** Courses without custom artwork receive generative vector thumbnails seeded deterministically from their course ID and metadata—zero network requests, always sharp at any screen resolution.

---

## 3. Visual Language

### Color Engine (OKLCH)
Colors are defined strictly in the **OKLCH** color space in `src/styles.css` with semantic CSS variables that adapt automatically between light and dark themes:

| Token | Light Theme Value | Dark Theme Value | Semantic Role |
| :--- | :--- | :--- | :--- |
| `--background` | `oklch(0.985 0.001 255)` | `oklch(0.190 0.005 270)` | Main workspace card background (never pure white or black) |
| `--shell` | `oklch(0.958 0.002 255)` | `oklch(0.155 0.004 270)` | Outer frame and left dock canvas |
| `--card` / `--popover` | `oklch(0.996 0.001 255)` | `oklch(0.232 0.005 270)` | Elevated surfaces, cards, dropdown menus, dialogs |
| `--foreground` | `oklch(0.205 0.012 258)` | `oklch(0.94 0.005 255)` | Primary high-contrast text and solid monochrome icon fills |
| `--muted-foreground` | `oklch(0.54 0.012 262)` | `oklch(0.64 0.01 260)` | Secondary labels, captions, metadata |
| `--secondary` | `oklch(0.952 0.003 255)` | `oklch(0.268 0.006 270)` | Inset trays, inputs, button backgrounds, badges |
| `--border` / `--input` | `oklch(0.925 0.004 255)` | `oklch(1 0 0 / 0.08)` | Subtle functional rings (checkboxes, dividers) — not resting container boxes |
| `--primary` | `oklch(0.32 0.008 260)` | `oklch(0.8 0.006 255)` | High-emphasis interactive elements |
| `--chart-1` | `oklch(0.56 0.16 278)` | `oklch(0.70 0.15 278)` | Categorical Chart: Design & UI/UX (Violet / Indigo) |
| `--chart-2` | `oklch(0.58 0.14 235)` | `oklch(0.72 0.13 235)` | Categorical Chart: Programming & Peak Velocity (Sky / Cyan) |
| `--chart-3` | `oklch(0.66 0.16 75)` | `oklch(0.76 0.15 75)` | Categorical Chart: Motion Graphics (Amber / Warm Gold) |
| `--chart-4` | `oklch(0.60 0.14 155)` | `oklch(0.72 0.13 155)` | Categorical Chart: AI & Machine Learning / Course Progress (Emerald / Mint) |
| `--chart-5` | `oklch(0.62 0.15 15)` | `oklch(0.74 0.14 15)` | Categorical Chart: Accent / Alerts (Rose / Crimson) |
| `--scrollbar-thumb` | `oklch(0.205 0.012 258 / 0.18)` | `oklch(0.94 0.005 255 / 0.18)` | Resting scrollbar thumb pill fill |
| `--scrollbar-thumb-hover` | `oklch(0.205 0.012 258 / 0.38)` | `oklch(0.94 0.005 255 / 0.38)` | Hovered scrollbar thumb pill fill |

### Iconography Rules
- **Solid Silhouettes:** For media sources, course import types, and key quick-recognition targets, use solid vector silhouettes (`size-4 shrink-0 fill-current text-foreground`) instead of faint stroked lines.
- **Authentic Brand Marks:** Always use the real, official mark geometry (e.g. exact Google Drive cyclic band vector, authentic YouTube badge with triangle cutout). Never improvise or distort brand logos.
- **Monochrome Flat Tone:** All icons inherit the current foreground or muted-foreground color. Do not use brand colors (red, green, blue, yellow) which create visual fragmentation and cheapen the UI.
- **No Decorative Surrounds:** Never wrap an icon in a colored circle or pill container simply to make it visually busy.
- **No Emojis:** Emojis are strictly banned from UI labels, buttons, headers, and tabs.

### Typography
- **Primary Typeface:** `Plus Jakarta Sans` with fallback to `system-ui, -apple-system, sans-serif`.
- **Monospace Typeface:** `ui-monospace, Consolas, monospace` for timestamps, duration badges, and seeds.
- **Hierarchy:**
  - Page Titles: `text-2xl font-bold sm:text-3xl`
  - Card & Section Titles: `text-lg font-semibold leading-7`
  - Subheadings / Group Labels: `text-sm font-semibold`
  - Body Text: `text-sm font-normal text-muted-foreground`
  - Microcopy / Badges: `text-xs` or `text-[11px] font-mono font-semibold`
- **Single-Line Truncation Rule:** Course titles in cards must terminate on a single line (`truncate`) with an ellipsis and include `title={course.title}` to display a native browser tooltip on hover. Never use multiline clamp in card grids to ensure consistent card heights.

### Shapes & Corner Radiuses (The 4-Tier Hierarchy)
Defined in `src/styles.css` under `@theme inline` with strict geometric roles to prevent the "all rounded squares" look:

1. **Structural Frames (12px – 16px / Subtle Rounded Rectangles):**
   - `--radius-2xl` (**16px**): Workspace main floating container (`<main>`).
   - `--radius-xl` (**12px**): Course cards, modal dialogs (`DialogContent`), settings modal, video screen bezel.
   - *Rule:* Anchors the workstation surface; never use pill radiuses on cards or frames.
2. **Interactive Tooling & Controls (6px – 8px / Technical Rectangles):**
   - `--radius-lg` (**8px**): Search input, dock action buttons, dropdown panels, segmented control outer tracks.
   - `--radius-md` (**6px**): Standard action buttons (`+ Add Course`), menu items, tooltip bubbles.
   - *Rule:* Retains crisp tool-like feel (Linear/Raycast aesthetic). Do not use pill buttons by default.
3. **Concentric Nested Curvature ($R_{\text{inner}} = R_{\text{outer}} - \text{padding}$):**
   - `--radius-sm` (**4px**): Inner segmented tab buttons (e.g. `All | In Progress | Completed`), video duration tags (`4h 20m`), progress tracks.
   - *Rule:* When an 8px (`rounded-lg`) track has 4px padding (`p-1`), inner tab buttons must use 4px (`rounded-sm`) so the inner corners do not bulge.
4. **Human Identity & Floating Accents (Full Circle / `rounded-full`):**
   - Instructor avatars (both photos and uppercase initials), central video play button, volume slider thumb.
   - *Rule:* Avatars represent people; always style them as circles (`rounded-full`) to immediately break the rectangular grid.
5. **Passive Metadata & Status Badges (Pills / `rounded-full`):**
   - Topic tags (`"UI Design"`), version indicators (`"Version 1.0.0"`), live engine badges, and `"Playing"` status capsules.
   - *Rule:* Capsules signal read-only status and tags, clearly differentiating them from clickable square buttons.

### Elevation, Tonal Layering & Shadows
- **Tonal Separation Over Wireframe Box Strokes (With Architectural Dividers):** Outer containers, cards, inputs, and dialogs separate primarily through calibrated surface stepping (`--shell` → `--background` → `--card` + inset `--secondary`) and soft resting elevation rather than 1px wireframe boxes (`border border-border`). Interactive focus and selected states use soft `ring-1` / `ring-2` (`focus-within:ring-2`, `ring-primary/35`). However, **subtle divider lines** (`border-border/50`, `divide-border/50`) are explicitly used wherever structural separation is needed—such as between toolbars and editors, headers and scrollable lists, footers and content, module accordions, navigation columns and content panes, and subheader controls above grids.
- `--shadow-card`: Subtle resting depth for borderless cards and floating panels.
  - Light: `0 1px 3px 0 oklch(0.2 0.01 260 / 0.06), 0 1px 2px -1px oklch(0.2 0.01 260 / 0.04)`
  - Dark: `0 2px 6px 0 oklch(0 0 0 / 0.25), 0 1px 2px 0 oklch(0 0 0 / 0.18)`
  - *Rule:* Avoid deep, dark fuzzy halos (no wide 28–32px blurs). Cards stay crisp and grounded.
- `--shadow-workspace`: `0 18px 48px oklch(0.2 0.01 260 / 0.08)` (light) / `0 22px 60px oklch(0 0 0 / 0.24)` (dark) — Reserved for the main surface container (`<main>`), dialogs, popovers, dropdown menus, and floating canvas panels over `--shell`. Never apply to individual cards on hover.

### Scrollbar Architecture & Non-Overlapping Gutters
- **Universal Custom Styling:** Replaced default blocky OS scrollbars with sleek, floating pill thumbs (`width: 8px`, `border: 2px solid transparent`, `background-clip: padding-box`). The thumb floats centered inside an invisible track with 2px inset breathing space, preventing any visual collision with curved container boundaries (`rounded-2xl`).
- **Non-Overlapping Gutters (`scrollbar-gutter: stable`):** Dedicated gutter space is permanently reserved along the scroll edge of `<main>` and internal scroll panels. Content cards, search inputs, buttons, and text never slide underneath the thumb, and switching between long and short views produces zero horizontal layout shifting.
- **Utility System:**
  - `custom-scrollbar`: Standard 8px width with `scrollbar-gutter: stable` for the main workstation surface, settings modal, and full-height views.
  - `custom-scrollbar-sm`: Compact 6px width without `scrollbar-gutter: stable` so internal sidebar panels (`px-3`) maintain symmetric left/right horizontal alignment with their headers.
  - `scrollbar-none`: Eliminates visual scrollbars on horizontal navigation bars (e.g. mobile settings tabs).
- **Single Scroll Responsibility:** Avoid nested `overflow-y-auto` containers inside `<main>`. Outer views defer vertical scrolling to `<main>` so users never encounter competing scrollbars.

---

## 4. Component System

### 1. App Shell (`src/components/app-shell.tsx`)
- **Structure:** Root flex layout bounded by viewport height (`h-dvh overflow-hidden bg-shell`).
- **Left Dock (`IconDock`):** Pinned permanently to the left (`sticky top-0 h-dvh w-16`). Contains brand logo, route navigation icons with active indicator bars (`absolute -left-[13px] h-5 w-1 rounded-full bg-foreground/70`), theme toggle, and settings trigger. Never scrolls with the page.
- **Workspace Surface (`<main>`):** Floating borderless surface with `overflow-hidden rounded-2xl bg-background shadow-workspace my-2 mr-2 sm:my-3 sm:mr-3`. `overflow-hidden` clips internal ambient glows (such as the Course Player's video backdrop blur) cleanly to the `rounded-2xl` corners. It contains no internal scrollbar; scrolling is delegated entirely to the outer frame canvas (`<div className="flex-1 min-w-0 h-dvh overflow-y-auto custom-scrollbar">`), positioning the scrollbar on the far right window edge outside the floating card surface.

### 2. Course Card (`CourseCard`)
- **Composition:** 16:9 ratio thumbnail + text body + progress bar.
- **Card Hover Animation (Borderless Tonal Depth & Zero Hard Shadows):**
  - Smooth card lift on hover: `transition-transform duration-300 hover:-translate-y-1`.
  - **Borderless Surface:** Cards sit on elevated `bg-card` with subtle resting `shadow-card` and no wireframe outer border.
  - **No Hover Shadow:** Individual cards maintain their flat, subtle resting depth (`shadow-card`) and never produce hard hover drop shadows (`hover:shadow-xl` banned).
  - Title hover transition: `group-hover:text-foreground/80 dark:group-hover:text-white transition-colors duration-200`.
- **Thumbnail Layer & Hover Zoom:**
  - Thumbnail container with `aspect-video overflow-hidden`.
  - Artwork zooms subtly on hover: `size-full transition-transform duration-700 ease-out group-hover:scale-105`.
  - Gradient depth overlay: `bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 dark:opacity-60 transition-opacity duration-300 group-hover:opacity-40 dark:group-hover:opacity-80`.
  - Soft dimming overlay: `bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100`.
- **Central Action Button (Glassmorphic, Borderless):**
  - Smooth frosted floating action circle: `size-14 rounded-full flex items-center justify-center bg-card/85 dark:bg-white/15 opacity-0 scale-90 backdrop-blur-md transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100`. Zero harsh borders or drop shadows.
  - Video Courses: `<Play className="size-6 text-foreground dark:text-white" fill="currentColor" />` (no extra horizontal margin/translation needed as Lucide's `Play` path is already optically weighted inside its `24x24` viewBox).
  - Direct Link Courses: `<Link2 className="size-6 text-foreground dark:text-white" />`.
- **Dual-Route Card Interaction:**
  - Direct Link Courses (`sourceType: "link"` or `courseUrl`): Card hit area is an anchor tag (`<a>`) opening the destination in a new tab (`target="_blank" rel="noopener noreferrer"`). Displays a subtle `"Link"` badge on the bottom-left of the thumbnail (`bg-black/70 backdrop-blur-md text-white`).
  - Video Courses: Card hit area is `<Link to="/learn/$courseId">` navigating to the internal player.
- **Metadata:** Single-line truncated title (`truncate`), instructor chip with uppercase initials, progress bar, lesson counter, and duration badge.
- **Action Menu:** Top-right hover-revealed 3-dot dropdown with frosted glass trigger (`bg-card/85 backdrop-blur-md shadow-card`). Automatically adapts actions based on source type (`Open link` for external URLs; `Curriculum`, `Rescan folder`, and `Show in Explorer` for local video courses).

### 3. Generative Artwork & Cover Source Engine (`src/lib/thumbnail-generator.ts` & `course-thumbnail.tsx`)
- **Purpose:** Manages thumbnail presentation across the application with dual capabilities: rendering uploaded user cover images or automatically generating distinct, algorithmic SVG vector artwork for courses without custom covers.
- **Cover Artwork Modes (`ThumbnailCoverMode`):**
  - `generated`: Pure algorithmic vector SVG engine for all courses without uploaded covers.
  - `images`: Simulates all courses having user-uploaded covers using 4 bundled placeholder assets (`thumbnail (1).jpg`, `thumbnail (1).png`, `thumbnail (1).webp`, `thumbnail (2).jpg`).
  - `mixed`: Combines both worlds in a realistic ~50/50 distribution to evaluate how uploaded photo covers and generative vector artwork sit harmoniously side-by-side in the library.
- **Algorithms:** Supports 4 geometric patterns:
  - `0`: Binary ramp (column block grid)
  - `1`: Thin strips (horizontal regular cuts)
  - `2`: Block rows (asymmetric blocks)
  - `3`: Ramp rows (logarithmic stepped rows)
- **Persistence:** App-wide parameters saved to `localStorage` (`tutin_thumbnail_settings`) and broadcast live via `tutin:thumbnail_settings_changed` events.

### 4. Add Course Control (`AddCourseControl`)
- **Split Button Pattern:** Primary `+ Add Course` button (defaults to local folder import) paired with a dropdown chevron.
- **Dropdown Menu:** Clean, decluttered single list without repeated "Add from" verbs and without dividing separator lines or categorical headers (`LOCAL`/`WEB` removed):
  - `Course folder` (Flat solid folder icon: `viewBox="0 0 24 24"`)
  - `YouTube` (Flat solid YouTube badge with play cutout: `viewBox="0 0 24 24"`)
  - `Google Drive` (Authentic flat monochrome cyclic 3-segment band mark: `viewBox="0 0 192 192"` with opacity steps)
  - `Direct link` (Flat solid globe mark: `viewBox="0 0 24 24"`)

### 5. Admin Dashboard (`src/routes/admin.tsx` & `admin-dashboard.tsx`)
- **Interactive Playground:** Live preview card with seed regenerator, palette swatch viewer, and hue lock toggle.
- **App-Wide Parameter Sliders:** Live tuning for Density, Variance, Contrast, Hue Drift, Spark accent, Bands, and Pattern modes.
- **Avatar Studio & Contrast Lab:** Dedicated live testing suite for avatar initials:
  - **Contrast Strategies:** `Balanced` (~35% delta, calm/accessible), `High` (~55% delta, maximum contrast), `Soft` (~20% delta, subtle adjacent tones), and `Manual` (interactive background & text tone swatches).
  - **Typography Controls:** Live toggle for font weight (400 Regular to 700 Bold), font family (Plus Jakarta Sans vs Monospace), and glyph font size.
  - **Live Multi-Size & Multi-Surface Showcase:** Real-time preview across all sizes (`xs` 20px to `xl` 64px) and surfaces (Canvas, Card, Secondary tray) with live name cycling.
- **Workspace Library Preview:** Real-time live grid showing all existing courses rendered with active draft parameters.

### 6. Instructor Avatar System (`src/components/instructor-avatar.tsx` & `thumbnail-generator.ts`)
- **Centralized Deterministic Math:** Uses `getAvatarColors(seed, palette, settings)` and `getInstructorPalette(name, settings)`. Derives background tone `bg` and foreground text `fg` from the course/instructor palette via `hh(seed * 31 + 7, 0, 0)`.
- **Contrast Tuning Strategies:** Supports `Balanced` (calm delta without harsh glare), `High` (prototype ends), `Soft` (adjacent tones), and `Manual` (direct tone index binding), persistent app-wide via `ThumbnailSettings`.
- **Brand Typography (Plus Jakarta Sans):** Initials rendered in SVG `<text>` using the new UI's signature primary font (`var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif`) at `fontSize="9.5"` and `fontWeight="600"` (SemiBold). Gives open glyph counters and balanced negative space inside the circular boundary without visual heaviness.
- **Harmonized Two-Tone Palette Contrast:** Text color is directly selected from the palette tones, maintaining high contrast and 100% color temperature harmony with the course thumbnail artwork.
- **Universal Cross-Screen Consistency:** Each instructor's avatar palette is bound to their signature course from the library (e.g. Maya Chen is bound to Course 1). This guarantees 100% color and style parity across the Home Page, Instructors Page list, Instructor Detail Profile view, and Course Player.
- **Live Real-Time Tuning:** Listens to `tutin:thumbnail_settings_changed` so when global contrast, drift, or hue changes in `/admin`, all instructor avatars adapt together with course thumbnails in real time.

### 7. Settings Modal (`src/components/settings-modal.tsx`)
- **Structure:** Floating modal dialog (`DialogContent max-w-4xl`) with vertical sidebar navigation on desktop and scrollable panel on right. Screen-reader-only accessible description removes visible `"Saved locally"` clutter.
- **General Tab Streamlining:**
  - **Theme:** Segmented control (`Light` / `Dark` / `System`).
  - **Playback:** Switch for `Resume playback` ("Continue from where you left off"). Removed obsolete default speed slider, pause in background, and autoplay next.
  - **Mark Complete When Watched:** 3-button percentage grid (`90%`, `95%`, `100%`) with active primary token styling.
  - **Progress Calculation:** Clear choice cards with checkmarks for `By Videos Completed` (`Count of completed videos ÷ total videos`) and `By Completed Duration` (`Duration of completed videos ÷ total course duration`), backed by live backend sync via `POST /api/courses/recalculate-progress`.
  - **Clutter Elimination:** Removed duplicate `Course artwork` link (already pinned to the app dock) and redundant `Subtitle language` selector.

---

## 5. Page & Layout Patterns

### Home / Dashboard (`/`)
- **Header:** Status filter segmented control (`All | In Progress | Completed`) on the left, paired on the same level with the quick search input (`⌘K / Ctrl+K`) and `AddCourseControl` on the right (`h-11`).
- **Sub-header Bar:** Sub-row with right-aligned Sort dropdown (`Recently opened`, `Progress`, `Course title`) above the course grid.
- **Grid Layout:** Responsive 4-column card grid (`grid gap-5 md:grid-cols-2 xl:grid-cols-4`).
- **Empty State:** Centered card with clear filter action when no courses match.

### Player & Study Companion (`/learn/$courseId`)
- **Zero-Scroll Workstation Layout:** Locked to the viewport height on desktop (`lg:h-[calc(100dvh-1.5rem-2px)] lg:overflow-hidden`) so the page never scrolls vertically. The left column (`flex min-h-0 flex-1 flex-col gap-4`) dynamically fits the video player (`min-h-0 flex-1`) above the `shrink-0` metadata footer (breadcrumb, lesson title, instructor avatar, and `Manage` action), ensuring metadata is never pushed below the fold even when the right sidebar (`lg:h-full lg:w-[380px]`) is collapsed.
- **Video Player Control Bar:** Combines a subtle, low-opacity frosted-glass pill cluster exterior (`bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-sm rounded-full`) with sharp, stroke-free (`stroke="none"`) solid geometric transport icons (`PlayIcon`, `PauseIcon`, `PrevIcon`, `NextIcon`, `VolumeIcon`) and the new UI's clean popover dropdown menus and sidebar toggle:
  - **Left Group (`gap-2`):** Standalone Play/Pause circle (`size-10 rounded-full`), grouped Previous/Next pill (`h-10 px-3.5 rounded-full`), hover-expanding Volume slider pill (`h-10 px-3 rounded-full` with stroke-free solid speaker cone `VolumeIcon` that dynamically renders mute `×`, 1 wave at `<50%`, or 2 waves at `≥50%`), and matching frosted Time pill (`h-10 px-4 rounded-full bg-white/[0.08]`).
  - **Right Pill (`h-10 px-3 py-1 rounded-full bg-white/[0.08]`):** Houses Audio & Subtitles trigger (`MessageSquareText`), Playback Settings trigger (`Settings`), Picture-in-Picture (`PictureInPicture`), Fullscreen (`Maximize`/`Minimize`), and Hide/Show Sidebar (`PanelRightClose`/`PanelRightOpen`), all sharing uniform resting icon opacity (`opacity-75 hover:opacity-100`).
- **Study Companion Sidebar (`<aside>`):**
  - **Symmetric `12px` (`px-3`) Column Alignment:** The top segmented tab bar (`p-3`), the `Progress` header (`px-3 pb-4 pt-1`), the `Notes` top toolbar (`px-3 pb-3 pt-1`), the `Transcript` header (`px-3 pb-3 pt-1`), and all scrollable lists (`px-3 pb-4 custom-scrollbar-sm`) share the exact same `12px` horizontal inset on both left and right edges.
  - **Collapsible Multi-Module Playlist:** Modules are separated by subtle `divide-y divide-border/50` dividers (`py-2 first:pt-0`) with transparent headers (`hover:bg-secondary/60`), module title (no redundant `"Module X:"` prefix), and completion + duration summary (`{done}/{total} videos • {duration}`).
  - **Active Lesson & Drag-to-Mark Interaction:** The active lesson row is highlighted via tonal surface fill (`bg-primary-soft/75 shadow-brand`) without an outline stroke and retains its duration badge without a redundant `"Playing"` pill (the full title stays readable). Clicking and dragging down/up across lesson checkmarks (`onPointerDown` + `pointermove` range sweep) batch-checks or unchecks lessons in a single motion.
  - **Notes Tab (`NotesTab` & `RichNoteEditor`):**
    - **Decluttered 3-Control Top Bar (`gap-1`):** Primary `Add note · {time}` button (`h-9 flex-1 rounded-lg`) paired with two borderless ghost icon triggers (`Button variant="ghost" size="icon"`, no outer box containers): Chronological Sort (`ArrowUpNarrowWide` / `ArrowDownWideNarrow`) and a 3-dots Options Popover (`MoreVertical`).
    - **3-Dots Options Menu (`Popover`):** Houses `Export notes` (`Download`), `Open canvas` (`LayoutGrid` -> `/canvas/$courseId`), a **`While writing`** section (`Pause video` `<Switch>`, single-row `Resume after` stepper with integrated `[ - ] {delay}s [ + ]` buttons, and `Rewind on resume` `<Switch>`), and an **`Autocomplete`** `<Switch>` toggle.
    - **Timestamped Note Cards & Inline Composer:** Notes are individual borderless inset cards (`rounded-lg bg-secondary/55 hover:bg-secondary/75`, retaining compact `space-y-3` outer card separation with relaxed `p-3 pb-4.5` inner baseline padding; active editors lift to `bg-background ring-1 ring-primary/35 shadow-card`) with clickable `Clock` timestamp pills (`rounded-full bg-primary-soft text-primary`), hover-revealed `Copy` / `Edit` / `Delete` actions, streamlined composer header (timestamp pill on left, `X` cancel on right, zero redundant "New note"/"AI" tags, and no dividing border line between the top header and formatting tools), WYSIWYG rich-text editing (Bold, Italic, Strikethrough, Bullet List, Image upload/paste/drop, live `<video>` frame capture, inline `InlineImageCropper`, Obsidian-style `#`/`-`/`>` markdown shortcuts, inline transcript ghost-text autocomplete with `⇥ Tab`, click-to-select image management with persistent floating action toolbar [`GripVertical` drag handle, `ArrowUp` move up, `ArrowDown` move down, `Crop`, `Delete`], drag suppression on image bodies to prevent ghost dragging, keyboard block movement via `Alt + ArrowUp` / `Alt + ArrowDown`, and never-trapping bottom cursor focus), and a Fullscreen Screenshot Lightbox.

### Admin Settings (`/admin`)
- **Layout:** Two-column control grid (interactive playground on left, parameters on right) followed by full-width live course library preview.

### Instructors Page (`/instructors`)
- **Layout:** Full-width single-column list stack (`max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10 flex flex-col gap-1`) matching the exact container dimensions and responsive padding of the Home Page. Zero dividing lines between instructors to eliminate visual clutter. Tag category filters and instructor count chips are removed for direct, uncluttered focus.
- **Row Anatomy:** Borderless interactive row with `w-full flex items-center gap-4 rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring`. The entire row is directly clickable without trailing button clutter.
- **Avatar & Inline Upload (Option C):** Circular avatar (`size="lg"` 48px in list, `size="xl"` 64px in profile view, `InstructorAvatar` duotone system with native SVG `<circle cx="12" cy="12" r="12">` vector rendering). Instead of an artificial background overlay circle, hovering applies an in-place CSS brightness filter (`group-hover/avatar:brightness-[0.4]`) directly to the avatar itself, completely eliminating anti-aliasing edge artifacts, black crescents, and boundary mismatches. A transparent circular label reveals the centered white `Camera` icon on hover (`text-white drop-shadow-sm`). Clicking opens the native file dialog (with `e.stopPropagation()` in list view) to update photo avatars directly.
- **Metadata:** Name (`text-base font-medium text-foreground flex-1 truncate`) with right-aligned muted course count (`font-mono text-sm text-muted-foreground`).
- **Instructor Detail View:** Clicking any instructor opens their dedicated view (`?instructor=:id`) with back navigation (`<ArrowLeft /> Instructors`), instructor profile hero (duotone avatar with hover camera upload/remove overlay, name without decorative category pill, lesson/duration summary), and a 4-column responsive grid of their enrolled courses rendered via `<CourseCard>`. Custom uploaded photos sync across the entire app via `localStorage` and `tutin:instructor_avatar_changed` events.

### Roadmap Canvas (`/roadmap`)
- **Header:** Streamlined title dropdown without decorative icon boxes or course/connection subtitle counters. Double-clicking the title text activates inline in-place editing (`Enter` or blur to save, `Escape` to cancel) backed by `updateCurrentRoadmap`, alongside an explicit `Rename` option in the chevron dropdown menu.
- **Course Nodes:** Simplified card layout (aspect-video thumbnail, duration badge, title, progress bar, lessons count/percent, study link, and connect anchor) without redundant instructor avatar/name sub-rows.

### Course Notes Canvas (`/canvas/$courseId`)
- **Workspace Canvas:** Infinite pan/zoom whiteboard (`bg-background` with subtle dot grid) launched from the Player Notes menu (`Open canvas`), highlighting `Home` in the slim left Icon Dock while dedicating full canvas real estate to spatial note synthesis.
- **Floating HUD & Bottom Dock (`src/components/canvas/canvas-hud.tsx`):**
  - Top-left HUD displays Back link to `/learn/$courseId`, course title, and live summary badge (`groups · cards · strokes`).
  - Top-right HUD houses `Undo`, `Redo`, `Notes` drawer trigger, `Tidy` all artboards action, `Fit` view, and zoom percentage controls.
  - Bottom floating tool dock (matching frosted elevated pill surface with OKLCH active selection) provides `Select`, `Hand`, `Note`, `Text`, `Image`, `Connect`, `Pen`, `Highlighter`, `Eraser`, and `Frame` (custom Artboard), plus a compact ink color & size popover.
- **Video Artboards & Custom Frames (`src/components/canvas/canvas-artboard.tsx`):** Lesson columns (`L{n} · {Title}`) use subtle tonal artboard fills (`--chart-1..5` tint accents), draggable header with collapse toggle and double-click rename, bottom-right resize handle, and an unobtrusive `Tidy` pill revealed only when manual repositioning puts an artboard into `custom` mode.
- **Note, Image & Text Cards (`src/components/canvas/canvas-card.tsx`):** Synced Video Notes feature a clickable `L{n} · {MM:SS}` deep-link chip (navigates back to `/learn/$courseId?lesson=&t=&tab=notes`), live two-way double-click editing via shared `<RichNoteSurface>`, `Detached` pill with 1-click `Return` when dragged out of their origin artboard, 4-side Bezier connector ports, and subtle tonal card accents (`accentIndex`) — zero emojis, zero nested card clutter.
- **Edges, Freehand Ink & Notes Drawer (`canvas-edges.tsx`, `canvas-ink-layer.tsx`, `canvas-notes-drawer.tsx`):** Dashed `auto-chrono` arrows indicate chronological lesson links (updating dynamically when cards detach or return), while solid Bezier connectors represent user-drawn links. Vector `perfect-freehand` strokes inherit `parentGroupId` when started inside an Artboard so ink moves seamlessly with dragged lesson groups. The toggleable right `Notes` drawer (`All`, `Detached`, `Off canvas`) locates existing cards or restores previously dismissed Video Notes in one click.

### History Page (`/history`)
- **Layout:** Full-width single-column stack (`max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10`) matching the Instructors, Analytics, and Home pages.
- **Header:** Clean title `History` with top-right quick search input (`w-80` to `w-96`).
- **Sub-header Bar:** Date filter segmented pills (`All Time`, `This Week`, `This Month`) on the left, paired with clear history trigger on the right (removed redundant lesson count).
- **Date Grouping:** Groups use `Today`, `Yesterday`, and specific chronological calendar dates (e.g., `October 18, 2026`, `October 16, 2026`) after yesterday, eliminating vague `"Last Week"` buckets.
- **Row Anatomy (Instructors Pattern):** Borderless interactive rows (`rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-secondary/60 transition-colors`). The entire row is directly clickable to resume the course, eliminating separate resume button clutter.
- **Visuals & Actions:** Left aspect-video thumbnail rendered via `<CourseThumbnail>` with lesson duration badge and progress bar. Middle content displays video name (primary) -> course title below it -> instructor name paired with `<Clock /> xx% watched` (removed redundant relative `"Watched 2 hours ago"` timestamp tags). Right side features a clean hover-reveal remove button (`Trash2`, `opacity-0 group-hover:opacity-100`) with stop propagation, eliminating three-dot dropdown clutter.

### Analytics Dashboard (`/analytics`)
- **Layout & Header:** Full-width container (`max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10`) featuring standard page title `Analytics` (`text-2xl font-bold tracking-tight text-foreground sm:text-3xl`) matching History and Instructors.
- **Metric Cards:** Watch time with weekly delta badge (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`), streak flame (`text-streak`), completed courses (`2 / 25` with dynamic progress bar in `--chart-4` emerald), and notes count with `--chart-1` icon.
- **Heatmap (Study Consistency):** 52-week / 3-month activity calendar using a calm emerald progression (`bg-secondary` -> `bg-emerald-500/25` -> `bg-emerald-500/50` -> `bg-emerald-600/80` -> `bg-emerald-600`), replacing monochrome gray tiles with immediate visual motivation.
- **Velocity & Focus Grid:** Two-column layout pairing weekly study velocity (with peak day highlighted in `--chart-2` sky) with the **Learning Focus** donut chart.
- **Learning Focus (`LearningFocus`):** Donut chart segments and legend indicators mapped directly to categorical OKLCH tokens (`--chart-1` Violet for Design & UI/UX, `--chart-2` Sky for Programming, `--chart-3` Amber for Motion Graphics, `--chart-4` Emerald for AI & ML) so disciplines are distinguishable at a glance.
- **Streamlined Focus:** Removed redundant "Course Progress" list to eliminate duplicate content with the home library and keep analytics focused on high-level study patterns.

### Modals & Dialogs Architecture
All app modals follow uniform structural principles defined in `UI_UX_SYSTEM.md`:
- **Dimensions & Stability:** Fixed height (`h-[min(640px,88dvh)]`) and spacious width (`max-w-2xl` / 672px) with `flex-1 overflow-y-auto custom-scrollbar` body to eliminate vertical jittering when switching between tabs of varying lengths.
- **Backdrop Overlay:** Softened frosted backdrop (`bg-black/60 backdrop-blur-sm` in `src/components/ui/dialog.tsx`), matching the calm TutIn aesthetic without harsh pitch-black dimming.
- **Single Corner Close Button:** Clean header with `pr-12` padding ensuring clearance for the built-in `DialogPrimitive.Close` button, strictly avoiding duplicate inner close buttons.
- **Concentric Segmented Tracks:** Header sub-navigation tracks use `rounded-lg bg-secondary/75 p-1` with inner `rounded-sm px-3.5 py-1.5` tabs.
- **Copy Economy:** Verb-first action buttons ("Add course", "Save changes", "Cancel"), clear single-line titles ("Add course", "Edit course", "Course & vault sync"), and zero decorative icon boxes or emojis.

#### Add Course Modal (`AddCourseModal` in `src/components/add-course-modal.tsx`)
- **Multi-Source Support:** Seamless unified modal supporting four ingestion sources via segmented controls:
  - **Folder:** Local video scanner supporting `.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`, `.avi` with automatic lesson count, title parsing, estimated duration calculation, and file preview sample.
  - **YouTube:** Stream link input with automatic duration and lesson count configuration.
  - **Google Drive:** Drive folder ingestion link.
  - **Direct Link:** External course/video URL with custom lesson count and duration.
- **Metadata Configuration:** Title, Instructor, Language selector, and interactive topic tags.
- **Reactive Library Persistence:** Stores custom courses in `localStorage` under `tutin_custom_courses` and broadcasts `tutin:course_added` custom window events for immediate reactive updates across the entire app.

#### Edit Course Modal (`EditCourseModal` in `src/components/edit-course-modal.tsx`)
- **Invocation Triggers:** Connected to Course Card context menu (`MoreHorizontal` -> `Edit details`) across library grids and to Curriculum Manager toolbar (`Edit info`).
- **Sub-Tabs:**
  - **Details:** Title, Instructor, Language selector, and interactive tag management (type and press Enter to add, click `X` pill to remove).
  - **Cover Image:** Live cover preview card, image upload picker (`Upload image`), and one-click `Revert to artwork` action to restore deterministic vector generative art.
  - **Progress (External Courses):** Course URL, total lessons, completed lessons, duration input, and calculated progress percentage indicator.
- **Reactive Persistence:** Updates stored in `localStorage` under `tutin_courses_override` and broadcast via `tutin:course_updated` window events for immediate synchronization with Home cards, Player headers, and Curriculum details.

---

## 6. UX Writing & Copy Economy

- **Buttons:** 1 to 2 words, verb-first ("Add Course", "Resume", "Save", "Reset defaults", "Import videos", "Instructors").
- **Nav Items & Tabs:** 1 word where possible ("Home", "Instructors", "History", "Analytics", "Admin", "Playlist", "Notes", "Transcript", "General", "AI", "Voice", "Storage", "About").
- **Dropdown Items:** Clean nouns ("Course folder", "YouTube", "Google Drive", "Direct link", "Curriculum", "Rescan folder").
- **Empty States:** Exactly 1 short sentence plus 1 action button. No paragraphs.
- **Dialogs:** The dialog title is the direct action or question; consequence is capped at one short sentence.
- **Section Intros:** Do not add introductory sentences or paragraphs under headings if the controls explain themselves.
- **Metrics & Stats:** Avoid repeating the label in the metric value (e.g. "Completed lessons: 128 / 180", not "128 / 180 Lessons").

---

## 7. Design Decision Log

| Date | Decision | Rationale |
| :--- | :--- | :--- |
| **2026-10-19** | **Isolate Development to `new ui/`** | Neglect legacy TutIn UI while constructing and perfecting the new UI prototype in `new ui/masterclass-study-companion-main/masterclass-study-companion-main/`. |
| **2026-10-19** | **Retain Vite + React Router Architecture** | Decided against migrating to TanStack Start (SSR) to preserve desktop/offline media capabilities, while adopting Tailwind v4 + shadcn/ui. |
| **2026-10-19** | **Integrate Algorithmic SVG Thumbnail Generator** | Replaced generic whiteboard gradient backgrounds with deterministic vector geometric art seeded per course. |
| **2026-10-19** | **Add `/admin` Thumbnail Settings Route** | Provided global controls to tune thumbnail density, contrast, and color palettes app-wide with real-time sync. |
| **2026-10-19** | **Lock Navigation Dock (`h-dvh` & `sticky`)** | Fixed issue where long pages stretched the sidebar, pushing the theme toggle and settings icon off-screen. |
| **2026-10-19** | **Single-Line Course Title Truncation** | Replaced `line-clamp-2` with `truncate` + `title={...}` hover tooltip to maintain uniform card height across the grid. |
| **2026-10-19** | **Authentic Flat Solid Monochrome Brand Marks** | Replaced wireframe outline icons and distorted logos with authentic official geometric marks (Google Drive 3-segment band, YouTube badge) in solid monochrome `fill-current`. |
| **2026-10-19** | **4-Tier Radius Hierarchy & Shape Contrast** | Eliminated "sea of rounded squares" monotony by enforcing circular avatars (`rounded-full`), pill metadata tags (`rounded-full`), concentric segmented controls (`rounded-sm` inside `rounded-lg`), and crisp structural cards/buttons. |
| **2026-10-19** | **Monochromatic Instructor Avatar System** | Connected instructor avatars to the global thumbnail color engine via deterministic hashing (`getInstructorPalette`), producing synchronized, accessible duotones across all views. |
| **2026-10-20** | **Grounded Course Cards & Subtle Resting Shadows** | Eliminated jarring hover translation (`-translate-y-1`) and massive spilling workspace shadow (`hover:shadow-workspace`) that floated over adjacent cards. Adopted calm border illumination (`hover:border-foreground/20`). Tightened `--shadow-card` across light and dark themes to remove muddy, distinctive dark halos. |
| **2026-10-20** | **Vector Avatar System with Brand Typography** | Refined avatar inner colors and typography to match `TutIn thumbnail generator.html`: replaced diagonal gradients and drop shadows with flat solid palette tones (`tones[k]`) and algorithmic contrast text (`tones[4]` or `tones[0]`), rendered in the new UI's signature **Plus Jakarta Sans** font (`600` SemiBold weight) while preserving outer circular radius (`rounded-full`). |
| **2026-10-20** | **Avatar Studio & Contrast Lab in Admin** | Added dedicated interactive Avatar Lab to `/admin` allowing real-time testing of contrast strategies (`Balanced`, `High`, `Soft`, and `Manual` swatch selection), font weight (400-700), family, and sizes across multiple surfaces and custom name tests. |
| **2026-10-20** | **Client Hydration Persistence & Code Export** | Fixed SSR client hydration gap in `useThumbnailSettings` and `AdminDashboard` so saved settings persist in `localStorage` on browser reload without reverting to server defaults. Added "Copy code" button in Admin to export active configuration for hardcoded code defaults. |
| **2026-10-20** | **Permanent Avatar Baseline in Codebase** | Applied user-selected configuration directly to `DEFAULT_GENERATOR_SETTINGS`: manual contrast mode, background tone 4 (`avatarBgTone: 3`), initials text tone 2 (`avatarFgTone: 1`), Plus Jakarta Sans font, 500 Medium weight, and 8px glyph size. |
| **2026-10-21** | **Strict Copy Economy Enforcement ("Say Less, Show More")** | Audited all screens against `ui-rules.md`. Removed redundant introductory descriptions under headings (History, Instructors, Admin, Settings), shortened multi-word nav tabs and buttons to 1-2 words (verb-first), trimmed empty states to single concise sentences with direct actions, and removed repetitive metric values. |
| **2026-10-21** | **Instructors List & Instructor Course Detail View** | Adopted a full-width borderless clickable list view (`max-w-[1440px]`) aligned with the Home Page. Clicking an instructor opens their dedicated course page (`?instructor=:id`) with profile summary, enrolled courses grid via `<CourseCard>`, and seamless back navigation matching the real TutIn app experience. |
| **2026-10-21** | **Container Decluttering & Stroke Minimization Audit** | Audited all screens against `ui-rules.md`. Eliminated nested cards inside cards across Settings, Admin, and Add Course modal. Stripped decorative icon circles and rounded squares. Swapped card-in-dialog boxes for clean `divide-y` section dividers. Replaced `hover:shadow-workspace` in History with calm border illumination, and removed translation bounce in Curriculum. |
| **2026-10-21** | **Course Card Clean Hover, Zero Shadows & Static Stroke** | Eliminated all harsh hover drop shadows (`hover:shadow-xl` and `shadow-2xl` removed) and removed outer stroke color/opacity shifts (`hover:border-foreground` removed). The card boundary remains a steady `border border-border` with smooth lift (`hover:-translate-y-1`), 700ms thumbnail zoom (`group-hover:scale-105`), and a shadow-free glassmorphic action button (`bg-card/85 dark:bg-white/10 border border-border/40 backdrop-blur-md`). |
| **2026-10-21** | **Custom Inset Scrollbars & Non-Overlapping Gutter Architecture** | Replaced default OS scrollbars with sleek, floating pill thumbs (`--scrollbar-thumb` OKLCH tokens, 8px width with 2px transparent inset border) that float inside an invisible track without clipping `rounded-2xl` corners. Enforced `scrollbar-gutter: stable` on `<main>`, settings modal, and internal panels so scrollbars never overlap cards, controls, or text, and prevent layout jumps. Removed duplicate nested scroll containers in Analytics. |
| **2026-10-21** | **Outer Frame Workstation Scrollbar** | Relocated the main viewport scrollbar from inside the floating card surface (`<main>`) to the outer shell frame (`flex-1 min-w-0 h-dvh overflow-y-auto custom-scrollbar`). The card surface floats cleanly with a 12px margin on the right, keeping the scrollbar on the far right edge of the screen completely outside `<main>`. |
| **2026-10-21** | **Thumbnail Cover Source Modes (Images, Generated & Mixed)** | Added multi-mode cover management in `/admin` using 4 bundled placeholder assets (`thumbnail (1).jpg`, `thumbnail (1).png`, `thumbnail (1).webp`, `thumbnail (2).jpg`). Added 3 distinct options: `Generated` (pure algorithmic SVG vector art), `Sample images` (all courses with image covers), and `Mixed` (both side-by-side: ~50% image covers, ~50% vector placeholders). Integrated interactive format chips and preview selection with app-wide real-time sync. |
| **2026-10-21** | **Analytics Streamlining: Learning Focus & Completed Courses** | Removed redundant "Course Progress" section from `/analytics`. Changed "Completed lessons" metric card to "Completed courses" with dynamic `completed / total` counts and progress bar. Replaced legacy audio/subtitles donut chart with "Learning focus", dynamically breaking down user watch time across disciplines (Design & UI/UX, Programming, Motion Graphics, AI & ML) derived directly from course tags. |
| **2026-10-21** | **History Page Redesign: Instructors Row Pattern & Full-Row Click** | Simplified title to "History". Eliminated bulky bordered card containers and removed the separate "Resume" button in favor of full-row clickable navigation matching the Instructors page list aesthetic (`hover:bg-secondary/60`, `rounded-xl`). Integrated `<CourseThumbnail>` for visual consistency. |
| **2026-11-10** | **Declutter Left Dock & Hybrid Frosted Pill Video Controls** | Removed the decorative pulsing local-storage status dot from `IconDock`. Restyled the video player control bar exterior to use the original TutIn frosted-glass pill groups (`Play`, `Prev/Next`, `Volume`, `Time` on the left; `Subtitles/Audio`, `Settings`, `PiP`, `Fullscreen`, and `Hide/Show Sidebar` on the right) while preserving the new UI's clean inner dropdown menus. |
| **2026-11-10** | **Full-Featured Timestamped Notes Tab & Smart Pause** | Replaced the static single-textarea scratchpad in `NotesTab` with the full timestamped Note Cards workflow from the original TutIn UI, restyled with the new UI's OKLCH tokens, copy economy, and `px-3` (`12px`) column alignment, including inline rich-text `<video>` frame capture, inline image cropper (`InlineImageCropper`), and fullscreen screenshot lightbox. |
| **2026-11-12** | **Declutter Notes Tab Top Bar & Consolidation Popover** | Reduced the `NotesTab` top bar to 3 controls (`Add note`, borderless Sort ghost button, borderless 3-dots ghost button). Moved secondary actions (`Export notes`, `Open canvas`), behavior settings (renamed "Smart Pause" to **`While writing`** with `Pause video` switch, compact single-row `Resume after` `[ - ] {delay}s [ + ]` stepper, and `Rewind on resume` switch), and **`Autocomplete`** switch into a single clean Radix `<Popover>` menu. |
| **2026-11-12** | **Declutter Note Composer Card Header** | Stripped the redundant `"New note"` label, `"AI"` autocomplete indicator badge, and the horizontal dividing border between the top timestamp header and the formatting toolbar, forming a clean, unified upper toolbar surface. |
| **2026-11-12** | **Relaxed Note Padding & Notion-Style Click-to-Select Image UX** | Retained compact outer card gap (`space-y-3`) while increasing inner card lower padding to `pb-4.5` for a relaxed visual baseline. Refactored editor image handling from fragile mousemove hover to click-to-select with active focus ring (`.is-selected`), persistent floating toolbar (`Crop` / `Delete`), keyboard deletion (`Backspace`/`Delete`), and guaranteed trailing paragraphs + empty space click-to-focus to eliminate cursor trapping. |
| **2026-11-12** | **Structured Image Drag Handle & Instant Block Movement Shortcuts** | Disabled accidental browser ghost dragging via `draggable="false"`, image drag prevention, and CSS `user-drag: none`. Added a dedicated `GripVertical` (`⋮⋮`) drag handle with `cursor-grab active:cursor-grabbing` on the image toolbar for direct block dragging, Move Up (`ArrowUp`) and Move Down (`ArrowDown`) instant block swap buttons, and `Alt + ArrowUp` / `Alt + ArrowDown` keyboard shortcuts with auto-scroll. |
| **2026-11-12** | **Instructor Avatar Upload & Tag Removal** | Enabled client-side photo avatar uploads with hover camera affordance on both the instructor detail hero (`size="xl"`, with removal support) and inline list rows (Option C, with `e.stopPropagation()`). Uploaded avatars sync app-wide via `tutin:instructor_avatar_changed`. Removed category tag filter chips and instructor counter from `/instructors`, and removed the category pill beside instructor name in detail hero. |
| **2026-11-12** | **Roadmap Canvas Simplification** | Removed the decorative Compass icon box and course/connections count subtitle under the roadmap title dropdown. Removed the redundant instructor avatar/name row from course canvas nodes to keep node cards concise. |
| **2026-11-12** | **Settings Modal Streamlining & General Tab Refresh** | Removed the visible `"Saved locally"` subheader. In the General tab, eliminated the redundant Course Artwork button (already in the dock) and Subtitle Language selector. Replaced old playback settings with a clean `Resume playback` switch, a 3-button `Mark complete when watched` group (`90%`, `95%`, `100%`), and full-width `Progress calculation` choice cards (`By Videos Completed` vs. `By Completed Duration`) with instant persistence and backend recalculation sync. |
| **2026-11-12** | **Darker Circular Avatar Upload Overlay & Roadmap Inline Rename** | Refined instructor avatar upload overlays to use an in-place CSS brightness filter (`group-hover/avatar:brightness-[0.4]`) on the avatar and native SVG `<circle cx="12" cy="12" r="12">` vector rendering, completely eliminating double-circle anti-aliasing edge lines, black crescents, and boundary mismatches. Added double-click inline title renaming to Roadmap Canvas (`Enter`/blur saves, `Escape` cancels) and a `Rename` dropdown menu action. |
| **2026-11-12** | **Analytics Title Alignment & History Date Grouping Refinement** | Standardized the Analytics dashboard layout with a dedicated page header (`h1 Analytics`, `max-w-[1440px]`) aligned with other main screens. Refactored History grouping to use calendar dates (`October 18, 2026`) instead of generic `"Last Week"`, removed the top lesson count badge, and stripped redundant relative `"Watched 2 hours ago"` timestamp tags from history cards. |
| **2026-11-12** | **Tonal Surface Layering & Border Reduction Refactor** | Replaced pervasive 1px wireframe strokes (`border-border`, `variant="outline"`) on outer boxes across all screens, modals, inputs, segmented controls, and UI primitives (`dialog`, `dropdown-menu`, `popover`, `select`, `sonner`) with calibrated OKLCH surface hierarchy (`--shell` → `--background` → `--card` + inset `--secondary`) and clean resting shadows (`--shadow-card`, `--shadow-workspace`), while preserving subtle architectural divider lines (`border-border/50`, `divide-border/50`) where needed between headers, toolbars, footers, lists, and navigation columns. |
| **2026-11-13** | **Semantic Color System for Analytics & Curriculum Tags** | Upgraded analytics from monochrome gray steps to calibrated categorical OKLCH chart tokens (`--chart-1` Violet, `--chart-2` Sky, `--chart-3` Amber, `--chart-4` Emerald). Replaced grayscale heatmap tiles with a 5-step emerald activity ramp and highlighted peak velocity days. Upgraded Curriculum Manager `Transcribed` badge to soft emerald (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`), keeping `Dub` in sky blue and subtitle chips/missing transcripts in quiet neutrals to avoid visual noise. |
| **2026-11-13** | **Course & Vault Sync Modal (Spacious Fixed Height, Semantic Tokens & Soft Overlay)** | Rebuilt the folder & vault sync dialog (`SyncPreviewModal` in `src/components/sync-preview-modal.tsx`) in strict compliance with the live TutIn layout and design tokens. Set a stable container height (`h-[min(640px,88dvh)] max-w-2xl`) to eliminate tab switching layout shifts, softened dialog backdrop from harsh `bg-black/80` to frosted `bg-black/60 backdrop-blur-sm`, eliminated duplicate `X` close buttons and redundant header subtext, restored purposeful semantic colors (Violet for Dubs, Sky for Transcripts/CC, Amber for Summaries, Emerald for Active Vault/Added videos, Rose for Removals), and structured tabs (`Summary`, `New Assets`, `Vault`, `Added`, `Removed`, `Moved`, `Updated`) with clean concentric tracks. |
| **2026-11-13** | **Add Course & Edit Course Modals Integration** | Created unified `AddCourseModal` (`src/components/add-course-modal.tsx`) and `EditCourseModal` (`src/components/edit-course-modal.tsx`) adhering strictly to the new UI visual system. Implemented multi-source intake (`Folder`, `YouTube`, `Google Drive`, `Direct Link`) with local video scanner and reactive persistence. Built comprehensive course editing with metadata controls, interactive tag manager pills, custom cover image upload with instant revert to deterministic vector artwork, and external course progress metrics. Connected modals seamlessly to Course Menu ("Edit details"), Add Course split buttons, and Curriculum Manager ("Edit info") with cross-app event synchronization (`tutin:course_added`, `tutin:course_updated`, `tutin:course_deleted`). |
| **2026-11-13** | **Dedicated Course Notes Canvas (`/canvas/$courseId`) & Two-Way Sync** | Decoupled `Open canvas` from `/roadmap` into a dedicated per-course study whiteboard (`CourseCanvasPage` + `src/components/canvas/`). Reused shared `<RichNoteSurface>` with IndexedDB `media://` storage (`src/lib/media-store.ts`) and revision-stamped `course-notes.ts` sync. Implemented Option A whiteboard semantics: lesson Video Artboards with `auto-chrono` dashed arrows, sibling bridging on detach + `Detached`/`Return` affordances, bottom collision-free append for new Player notes in customized Artboards, one-click `Tidy` reset, non-destructive `Off canvas` drawer recovery, and vector `perfect-freehand` Pen/Highlighter/Eraser ink parented to dragged Artboards. |

---

## 8. Implementation References

- **Global Styles & Tokens:** `new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/styles.css`
- **Shell Layout & Navigation:** `src/components/app-shell.tsx`
- **Thumbnail Engine:** `src/lib/thumbnail-generator.ts` & `src/components/course-thumbnail.tsx`
- **Admin Dashboard:** `src/routes/admin.tsx` & `src/components/admin-dashboard.tsx`
- **Instructors Page:** `src/routes/instructors.tsx` & `src/components/instructors-page.tsx`
- **Course Player & Shared Rich Notes:** `src/routes/learn.$courseId.tsx`, `src/components/course-player.tsx`, `src/components/rich-note-surface.tsx`, `src/lib/course-notes.ts`, `src/lib/course-lessons.ts`, `src/lib/media-store.ts`
- **Course Notes Canvas Whiteboard:** `src/routes/canvas.$courseId.tsx`, `src/components/canvas/`, & `src/lib/course-canvas.ts`
- **UI Primitives:** `src/components/ui/` (Radix UI + Tailwind v4 components)