# Changelog

All notable changes to TutIn will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-26

### 🎉 Initial Public Release

This is the first major release of TutIn - an AI-powered, offline-first course learning platform.

### ✨ Features

#### 📚 Course Management
- **Multi-Source Import**: Import courses from local folders, YouTube playlists, or Google Drive
- **Smart Organization**: Custom tags, global search, and advanced filtering
- **Flexible Sorting**: Sort by name, progress, date added, or duration
- **Module Management**: Edit, reorder, and organize course modules with drag-and-drop

#### 🎬 Advanced Video Player
- **Custom Controls**: Full-featured player with native and custom controls
- **Smart Playback**: Auto-resume from last position, auto-play next video
- **Speed Control**: Adjustable playback speed (0.25x - 2x)
- **Picture-in-Picture**: Multitask while watching
- **Keyboard Shortcuts**: Comprehensive keyboard controls for efficient learning
- **Multi-Format Support**: MP4, WebM, HLS, YouTube, Google Drive, and more

#### 🤖 AI-Powered Features
- **In-Browser Transcription**: Offline speech-to-text using Whisper Tiny model (~40MB)
- **AI Summarization**: Structured summaries with Gemini 2.0 Flash (title, bullet points, notes, action items)
- **Closed Captions**: Auto-generated captions with draggable, dynamic positioning
- **Click-to-Seek**: Jump to any moment by clicking transcript text
- **Export**: Download transcripts and summaries as markdown

#### 📊 Learning Analytics
- **Progress Tracking**: Dual modes (by video count or watch time)
- **Statistics Dashboard**: Visual charts showing learning metrics
- **Watch History**: Complete history with quick resume
- **Completion Tracking**: Configurable auto-completion thresholds (90%, 95%, 100%)

#### 👥 Instructor Management
- **Instructor Pages**: Browse all courses organized by instructor
- **Avatar Support**: Automatic avatar fetching for YouTube instructors
- **Centralized Storage**: Deduplicated instructor data

#### 🗺️ Visual Roadmap Builder
- **Interactive Canvas**: Drag-and-drop course positioning with zoom and pan
- **Course Connections**: Visual prerequisite links with Bezier curves
- **Multiple Roadmaps**: Create different learning paths for different goals
- **Export/Import**: Share roadmaps as JSON files

#### 📝 Notes & Annotations
- **Timestamped Notes**: Add notes at specific video moments
- **Rich Editor**: Markdown support for formatting
- **Quick Actions**: Copy, edit, delete, and export notes
- **Favorites**: Star important videos for quick access

#### ⚙️ Settings & Customization
- **Theme Support**: Dark mode, light mode, or system preference
- **Customization**: Configurable playback speed, auto-play, and completion thresholds
- **Data Management**: Export/import all data, reset app functionality
- **Persistent Access**: Save folder handles for quick reconnection

### 🔧 Technical Highlights
- **Offline-First**: All data stored locally in IndexedDB
- **Privacy-Focused**: No cloud storage, no tracking, your data stays yours
- **Modern Stack**: React 18.3, Vite 6, Tailwind CSS 3.4
- **AI Processing**: Web Workers for non-blocking transcription
- **Performance**: Lazy loading, code splitting, optimized bundles

### 🌐 Browser Support
- ✅ **Full Support**: Chrome, Edge, Opera (Chromium-based)
- ⚠️ **Partial Support**: Brave (requires Shields disabled for File System API)
- ❌ **Limited Support**: Firefox, Safari (no File System Access API, YouTube/GDrive import still works)

### 📦 Dependencies
- React 18.3.1
- React Router 7.1.1
- Transformers.js 2.17.2 (Whisper AI)
- ReactPlayer 3.4.0
- Recharts 2.15.0
- Lucide React 0.469.0
- Tailwind CSS 3.4.17
- Vite 6.0.5

### 🐛 Known Issues
- File System Access API not available in Firefox/Safari (use YouTube or Google Drive import instead)
- First-time AI transcription requires ~40MB model download
- Very large playlists (>100 videos) may take time to import

### 📝 Notes
- Users must provide their own OpenRouter API key for AI summarization features
- AI transcription works completely offline after initial model download
- Recommended: Use Chromium-based browsers for best experience

---

## Future Releases

See [todo.md](todo.md) for planned features and improvements.
