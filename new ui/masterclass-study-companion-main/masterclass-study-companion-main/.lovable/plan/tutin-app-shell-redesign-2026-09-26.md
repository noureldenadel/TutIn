# TutIn App Shell Redesign

## What I’ll build
- Replace the placeholder with a polished TutIn learning workspace that immediately demonstrates the new shell.
- Add the 64px icon dock with primary navigation, theme control, settings, and storage status.
- Create a floating rounded workspace with a welcoming header, current-course area, progress overview, and recent lessons.
- Add working light and dark themes, with the selected theme remembered on the device and initialized without a flash.

## Design system
- Use the requested warm porcelain and crisp elevated surfaces in light mode.
- Use obsidian and charcoal surfaces with subtle translucent borders in dark mode.
- Use emerald/teal only for emphasis and primary actions; avoid purple and red.
- Centralize colors, radii, shadows, typography, focus states, and motion in the global design system.
- Use Plus Jakarta Sans with semantic styling throughout.

## Technical details
- Keep the experience on the existing home page and implement the shared shell in reusable React components.
- Use semantic Tailwind tokens and Lucide icons, with accessible labels and tooltips for icon-only controls.
- Add page-specific metadata and preserve the existing TanStack application structure.
- Verify compilation and inspect the finished interface at desktop and mobile widths.
