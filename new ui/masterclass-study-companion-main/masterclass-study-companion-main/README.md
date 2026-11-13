# Masterclass Study Companion

Act as a world-class principal product designer and frontend architect. 

I am building "TutIn", a modern, local-first video learning platform for offline masterclasses with built-in AI transcription, translation, and study notes.

I want to completely redesign the application UI/UX to feel extremely clean, calm, friendly, and premium.

KEY DESIGN DIRECTION:

1. Color Palette:

   - Light Mode: Do NOT use pure stark 100% white background. Use soft warm porcelain / zinc (#F6F7F9) background with clean crisp white (#FFFFFF) elevated cards.

   - Dark Mode: Do NOT use harsh 100% pitch black (#000000). Use deep charcoal obsidian (#111215) background, elevated card surfaces (#18191F), and subtle border lines (border-white/[0.06]).

   - Accent: A calming, high-end Emerald/Teal (#10B981) for active states, highlights, and primary actions. STRICTLY AVOID purple and red accents.

   - Typography: Clean, modern sans-serif (Inter or Plus Jakarta Sans). High legibility with muted secondary text (#71717A in dark, #71717A in light).

2. Geometry & Spacing:

   - Soft curved borders: outer frames rounded-3xl / rounded-2xl, cards rounded-xl, action pills rounded-full or rounded-lg.

   - Generous breathing room, subtle micro-shadows, zero visual noise.

3. Master Layout Structure:

   - Ultra-clean 64px slim left Icon Dock (Navigation Rail) containing:

     * App Logo icon at the top

     * Icons: Home (Courses), Roadmaps, Instructors, Analytics

     * Bottom icons: Theme Toggle (Dark/Light), Settings, and Storage status dot.

   - The main content area sits beside the icon rail inside a floating, rounded workspace canvas with smooth transitions.

Create the master App Shell layout, theme provider, and design system variables (colors, border radii, shadows) implementing this exact aesthetic.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc3a51de-7e4e-4a1f-a4c4-d53dab13ab44).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Workspace Routes & Features

- `/` — Course Library grid with Add/Edit Course modals, Folder & Vault Sync preview, and quick resume cards
- `/learn/$courseId` — Course Player with multi-module playlist, live AI transcript, and rich timestamped Notes tab (IndexedDB `media://` image storage, inline cropper, smart pause, and autocomplete)
- `/canvas/$courseId` — Dedicated Course Notes Whiteboard Canvas with lesson Video Artboards, chronological arrows, two-way synced note editing, Canvas-only notes/images, deep-links back to lesson timestamps, and `perfect-freehand` drawing
- `/roadmap` — Multi-course learning pathway graph
- `/instructors` — Instructor directory and course views with inline avatar customization
- `/history` & `/analytics` — Chronological watch log and study consistency telemetry
- `/manage/$courseId` — Course curriculum manager & vault rescan trigger
- `/admin` — Generative artwork and instructor avatar theme studio

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
