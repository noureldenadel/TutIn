---
trigger: always_on
---

## Living Documentation & Changelog Rule

dont update the live version documentation or changlog only update the new ui documentation and changelog

### Core principle
Every feature addition, modification, refactor, or removal must keep the project's documentation and changelog 100% synchronized with the actual code so the owner can return at any time and immediately understand what exists, how it works, and what changed.

### Tracked documentation files
- `README.md` — High-level features, scripts, quick-start, and project directory structure.
- `CHANGELOG.md` — Chronological record of all notable changes (`Added`, `Changed`, `Removed`, `Fixed`).
- `docs/ARCHITECTURE.md` — Technical architecture, data model, domain rules, and persistence/sync design.
- `docs/UI_UX_SYSTEM.md` — Visual tokens, typography, component patterns, interaction rules, and UI decision history.
- `TASKS.md` — Implementation roadmap and task completion checkboxes.

### Mandatory actions on every code change

1. **When adding a feature:**
   - Add the feature to `README.md` (if user-facing) and the relevant technical/UI doc (`docs/ARCHITECTURE.md` or `docs/UI_UX_SYSTEM.md`).
   - Record an entry under `### Added` in `CHANGELOG.md` with the affected files and a concise summary of what was built.
   - Check off or add the corresponding task in `TASKS.md`.

2. **When updating or changing a feature:**
   - Update the existing description in `README.md`, `docs/ARCHITECTURE.md`, and `docs/UI_UX_SYSTEM.md` in place — never leave outdated explanations alongside new ones.
   - Record an entry under `### Changed` (or `### Fixed` for bug fixes) in `CHANGELOG.md` explaining what changed and why.

3. **When removing a feature:**
   - Delete all references, instructions, and architecture sections for the removed feature from `README.md`, `docs/ARCHITECTURE.md`, and `docs/UI_UX_SYSTEM.md` so the docs never describe dead or non-existent functionality.
   - Record an entry under `### Removed` in `CHANGELOG.md` noting what was removed and why.

### Before finishing any task
- Verify that no documentation file contradicts the current codebase.
- Mention which documentation files and changelog sections were updated in your final response.

