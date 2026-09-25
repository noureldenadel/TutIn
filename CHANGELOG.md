# Changelog

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
