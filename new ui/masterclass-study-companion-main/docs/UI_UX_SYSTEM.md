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
| `--background` | `oklch(0.987 0.001 255)` | `oklch(0.195 0.005 270)` | Main workspace card background (never pure white or black) |
| `--shell` | `oklch(0.967 0.002 255)` | `oklch(0.165 0.004 270)` | Outer frame and left dock canvas |
| `--card` / `--popover` | `oklch(0.995 0.001 255)` | `oklch(0.23 0.005 270)` | Elevated surfaces, cards, dropdown menus, dialogs |
| `--foreground` | `oklch(0.205 0.012 258)` | `oklch(0.94 0.005 255)` | Primary high-contrast text and solid monochrome icon fills |
| `--muted-foreground` | `oklch(0.54 0.012 262)` | `oklch(0.68 0.005 255)` | Secondary labels, captions, metadata |
| `--secondary` | `oklch(0.963 0.003 255)` | `oklch(0.27 0.006 270)` | Inset trays, button backgrounds, badges |
| `--border` / `--input` | `oklch(0.925 0.004 255)` | `oklch(0.32 0.005 270)` | Structural boundary lines, input outlines |
| `--primary` | `oklch(0.32 0.008 260)` | `oklch(0.8 0.006 255)` | High-emphasis interactive elements |

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

### Elevation & Shadows
- `--shadow-card`: Tight, subtle resting depth for cards and inputs.
  - Light: `0 1px 2px 0 oklch(0.2 0.01 260 / 0.04), 0 1px 3px 0 oklch(0.2 0.01 260 / 0.02)`
  - Dark: `0 1px 2px 0 oklch(0 0 0 / 0.25)`
  - *Rule:* Avoid deep, dark fuzzy halos (no wide 28–32px blurs). Cards stay crisp and grounded.
- `--shadow-workspace`: `0 18px 48px oklch(0.2 0.01 260 / 0.08)` (light) / `0 22px 60px oklch(0 0 0 / 0.24)` (dark) — Reserved exclusively for the main surface container (`<main>`) elevation over `--shell`. Never apply to individual cards on hover.

---

## 4. Component System

### 1. App Shell (`src/components/app-shell.tsx`)
- **Structure:** Root flex layout bounded by viewport height (`h-dvh overflow-hidden bg-shell`).
- **Left Dock (`IconDock`):** Pinned permanently to the left (`sticky top-0 h-dvh w-16`). Contains brand logo, route navigation icons with active indicator bars (`absolute -left-[13px] h-5 w-1 rounded-full bg-foreground/70`), theme toggle, and settings trigger. Never scrolls with the page.
- **Workspace Surface (`<main>`):** Floating surface with `rounded-2xl border border-border bg-background overflow-y-auto`. Hosts all page content and handles internal scrolling independently.

### 2. Course Card (`CourseCard`)
- **Composition:** 16:9 ratio thumbnail + text body + progress bar.
- **Grounded Interaction Rule:** Cards remain anchored in their grid cell on hover. No vertical floating translation (`-translate-y-1` removed) and no heavy elevation jumps (`hover:shadow-workspace` banned) to prevent spilling shadows and overlapping adjacent cards.
- **Tactile Border Feedback:** Hover state uses calm border illumination (`transition-colors duration-200 hover:border-foreground/20`), preserving calm workstation aesthetics without visual clutter.
- **Thumbnail Layer:** Renders `<CourseThumbnail>` which outputs either uploaded covers or crisp generative vector SVG without dark hover overlays or aggressive zoom.
- **Metadata:** Single-line truncated title (`truncate`), instructor chip with uppercase initials, progress bar, lesson counter, and duration badge.
- **Action Menu:** Top-right hover-revealed 3-dot dropdown with curriculum management and folder actions.

### 3. Generative Artwork Engine (`src/lib/thumbnail-generator.ts` & `course-thumbnail.tsx`)
- **Purpose:** Automatically generates distinct, high-aesthetic algorithmic SVG thumbnails for courses without uploaded covers.
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
- **Universal Cross-Screen Consistency:** Appears across `/instructors` (size 64px), home page `CourseCard` (size 28px, inheriting the course palette), `/admin` live preview (size 20px, dynamically reactive to playground sliders), and `/learn` video header (size 28px).
- **Live Real-Time Tuning:** Listens to `tutin:thumbnail_settings_changed` so when global contrast, drift, or hue changes in `/admin`, all instructor avatars adapt together with course thumbnails in real time.

---

## 5. Page & Layout Patterns

### Home / Dashboard (`/`)
- **Header:** Quick search input (`⌘K / Ctrl+K` shortcut) + `AddCourseControl`.
- **Sub-header Bar:** Segmented status filter (`All`, `In Progress`, `Completed`) + Sort dropdown.
- **Grid Layout:** Responsive 4-column card grid (`grid gap-5 md:grid-cols-2 xl:grid-cols-4`).
- **Empty State:** Centered card with clear filter action when no courses match.

### Player & Study Companion (`/learn/$courseId`)
- **Layout:** Split workspace with primary 16:9 video player on the left and tabbed study companion panels on the right.
- **Tabs:** Notes, Synchronized Transcript, Flashcards, and Quizzes.

### Admin Settings (`/admin`)
- **Layout:** Two-column control grid (interactive playground on left, parameters on right) followed by full-width live course library preview.

---

## 6. UX Writing & Copy Economy

- **Buttons:** 1 to 2 words, verb-first ("Add Course", "Resume", "Save", "Reset defaults", "Import videos").
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

---

## 8. Implementation References

- **Global Styles & Tokens:** `new ui/masterclass-study-companion-main/masterclass-study-companion-main/src/styles.css`
- **Shell Layout & Navigation:** `src/components/app-shell.tsx`
- **Thumbnail Engine:** `src/lib/thumbnail-generator.ts` & `src/components/course-thumbnail.tsx`
- **Admin Dashboard:** `src/routes/admin.tsx` & `src/components/admin-dashboard.tsx`
- **Course Player:** `src/routes/learn.$courseId.tsx` & `src/components/course-player.tsx`
- **UI Primitives:** `src/components/ui/` (Radix UI + Tailwind v4 components)