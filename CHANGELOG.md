# Changelog

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
