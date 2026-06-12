# TutIn - AI-Powered Course Learning Platform

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](https://github.com/noureldenadel/TutIn/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Your offline-first, AI-enhanced video course management system

TutIn is a modern, powerful course learning platform that helps you organize, track, and master video courses from multiple sources. Built with React and powered by cutting-edge AI, it works completely offline after initial setup and gives you full control over your learning journey.

![TutIn](./screenshot.png)

## 🚀 Quick Start

The easiest way to launch TutIn is using the automated setup script for Windows. It will automatically check for Node.js, install any missing dependencies, and launch both the frontend and backend servers.

1. Double-click the `start-dev.bat` file in the root folder.
2. The script will handle the rest and open your browser automatically.

📖 **New to TutIn?** Check out the [User Guide](docs/USER_GUIDE.md) for detailed instructions.

📝 **What's New?** TutIn v4 introduces a native SQLite companion server for absolute data safety and no browser limits!

## ✨ Why TutIn?

- 🚀 **Offline-First**: All data stored locally, works without internet
- 🤖 **AI-Powered**: In-browser transcription + AI summarization
- 📊 **Visual Learning**: Interactive roadmap for course dependencies
- 🎯 **Multi-Source**: Import from local files, YouTube, Google Drive, or external links
- 💾 **Privacy-Focused**: No cloud, no tracking, your data stays yours
- ⚡ **Performance**: Fast, responsive, built with modern web technologies

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Features](#-features)
- [Getting Started](#-getting-started)
- [Usage](#-usage)
- [Architecture](#-architecture)
- [Keyboard Shortcuts](#%EF%B8%8F-keyboard-shortcuts)
- [Configuration](#%EF%B8%8F-configuration)
- [Browser Support](#-browser-support)

---

## 🎯 Features

### 📚 Course Management

#### Multi-Source Import
- **Local Courses**: Import video courses from local folders with automatic module detection
- **YouTube Integration**: Import entire playlists with automatic metadata fetching and channel avatars
- **Google Drive**: Import videos directly from your Google Drive
- **External Links**: Import videos from any other supported course site
- **Smart Preview**: Preview and edit course structure before importing
- **Persistent Access**: Set a root folder once, restore access automatically on next session

#### Organization & Search
- **Custom Tags**: Organize courses with custom tags for easy categorization
- **Global Search**: Instantly find courses by name or description
- **Smart Filtering**: Filter by status (All, Completed, In Progress, Not Started) or custom tags
- **Multiple Sort Options**: Sort by Recently Accessed, Title, Progress, or Date Added
- **Module Management**: Edit and reorder modules with custom titles
- **Bulk Edit Playlist**: Drag-and-drop video organization and module reordering across the entire course
- **Course Synchronization**: Automatically scan local folders for changes (added, removed, or moved files) while preserving progress
- **Hierarchical Structure**: Full support for nested sub-modules and complex directory trees

### 🎬 Advanced Video Player

#### Playback Features
- **Custom Controls**: Full-featured video player with native and custom controls
- **Picture-in-Picture**: Watch while working on other tasks
- **Speed Control**: Adjust playback speed (0.25x - 2x)
- **Auto-Resume**: Automatically resume from last watched position
- **Auto-Play Next**: Seamlessly continue to next video with a visual countdown timer
- **Hold-to-Speed-Up**: Press and hold to boost playback to 2x (YouTube-style)
- **Smooth Transitions**: Video-to-video transition overlays for a premium feel
- **Multiple Formats**: Support for MP4, WebM, HLS, YouTube, Google Drive, and more

#### Player Controls
- **Volume Control**: Persistent volume settings
- **Fullscreen Mode**: Immersive learning experience
- **10-Second Skip**: Quick intro/outro skipping
- **Seek Controls**: 5-second forward/backward seeking
- **Progress Tracking**: Visual progress bar with hover preview

#### Closed Captions
- **Dynamic Positioning**: YouTube-style caption positioning that avoids controls
- **Draggable**: Manually reposition captions anywhere on screen with persistence
- **Timestamped**: Click any caption to jump to that moment
- **WebVTT Support**: Industry-standard caption format

### 🤖 AI-Powered Features

#### Transcription (Whisper AI)
- **In-Browser Processing**: Runs completely offline using Transformers.js with WebGPU acceleration support
- **Whisper Tiny Model**: ~40MB download, cached locally after first use
- **Web Worker**: Non-blocking transcription won't freeze UI
- **High Accuracy**: State-of-the-art speech recognition
- **Timestamp Support**: Word-level timestamps for captions
- **Click-to-Seek**: Click any transcript word to jump to that moment

#### AI Summarization (Gemini 2.0 Flash)
- **Structured Summaries**: Auto-generated title, bullet points, notes, and action items
- **Smart Extraction**: Key concepts and learning objectives
- **Markdown Rendering**: Beautiful typography for summaries
- **Regenerate**: Re-run summarization with existing transcript
- **Fallback Mode**: Extractive summary if API is unavailable
- **Export**: Download transcripts and summaries as markdown

### 📊 Learning Analytics

#### Progress Tracking
- **Dual Modes**: Track progress "By Videos" (count) or "By Duration" (time watched)
- **Completion Thresholds**: Choose 90%, 95%, or 100% threshold for auto-completion
- **Smart Sorting**: In-progress courses sorted by completion percentage
- **Manual Override**: Mark videos as complete/incomplete manually
- **Resume Tracking**: Always know where you left off

#### Statistics Dashboard
- **Learning Metrics**: Total courses, completed courses, videos watched
- **Time Tracking**: Total watch time, average session duration
- **Progress Charts**: Visual charts using Recharts library
- **Completion Rates**: Track your learning velocity and daily activity
- **Learning Streak**: Stay motivated with daily learning streaks and activity heatmaps
- **Instructor Leaderboard**: See which instructors you learn from the most
- **Course Analytics**: Per-course statistics, total duration tracking, and progress insights

#### Watch History
- **Recently Watched**: Quick access to your latest videos
- **History Log**: Complete watch history with timestamps
- **One-Click Resume**: Jump back into any video instantly

### 👥 Instructor Management

- **Instructor Pages**: Browse all courses by instructor
- **Avatar Support**: Automatic avatar fetching for YouTube instructors
- **Centralized Storage**: Deduplicated avatar storage across courses
- **Instructor Profiles**: View all courses from a specific instructor
- **Quick Navigation**: Filter and find courses by instructor

### 🗺️ Visual Roadmap Builder

#### Interactive Canvas
- **Drag-and-Drop**: Position course nodes anywhere on canvas
- **Zoom & Pan**: Navigate large roadmaps with zoom controls
- **Grid Snapping**: Optional grid for precise alignment
- **Infinite Canvas**: Unlimited space for your learning path

#### Course Connections
- **Visual Links**: Draw connections between prerequisite courses
- **Bezier Curves**: Smooth, professional-looking connections
- **Smart Routing**: Automatic edge detection for optimal connection points
- **Hover Effects**: Highlight connection paths on hover
- **Remove Connections**: Click or double-click to remove links

#### Roadmap Management
- **Multiple Roadmaps**: Create different paths for different goals
- **Save/Load**: Persist roadmaps in IndexedDB with automatic background saving
- **Export/Import**: Share roadmaps as JSON files for backup or sharing
- **Course Status**: Visual indicators and badges for completed/in-progress courses

### 📝 Notes & Annotations

- **Timestamped Notes**: Add notes at specific video moments
- **Rich Editor**: Format notes with bold, italic, and bulleted lists
- **Image Support**: Insert, paste, or drag-and-drop images directly into your notes
- **Auto-Optimization**: Images are automatically resized and optimized for local storage
- **Click-to-Seek**: Jump to any note's timestamp instantly
- **Edit & Delete**: Full CRUD operations on notes with real-time updates
- **Copy Notes**: Quick copy to clipboard
- **Export as Markdown**: Download all notes for a video, including embedded images
- **Favorites**: Star important videos for quick access

### ⚙️ Settings & Customization

#### Appearance
- **Theme Toggle**: Dark mode, Light mode, or System preference
- **Accent Colors**: Customizable accent color
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Glassmorphism UI**: Modern, beautiful interface design

#### Playback
- **Default Speed**: Set your preferred playback speed
- **Auto-Play**: Enable/disable auto-play next video
- **Completion Threshold**: Choose automatic completion percentage
- **Progress Mode**: Track by video count or watch time

#### Data Management
- **Export All Data**: Backup courses, progress, notes, and settings as JSON
- **Import Data**: Restore from backup file
- **Reset App**: Clear all data and start fresh
- **Folder Handles**: Persistent folder access across sessions

---

## 🚀 Getting Started

### Prerequisites

- **Windows OS** (required for the automated `.bat` setup script)
- **Node.js** 18 or higher (the script will install this automatically if missing)
- **Modern Browser**: Chrome, Edge, or Opera (for File System Access API)
- *(Optional)* Python 3.10+ (if you plan to use local AI Dubbing)

### Installation

1. Download or clone the TutIn repository to your local machine.
2. Open the `tutin` folder.
3. Double-click **`start-dev.bat`**.

That's it! The script will automatically:
- Check if you have Node.js installed (and download it if you don't).
- Install all necessary dependencies for both the frontend and the companion server.
- Start the servers and open the app in your default browser.

### API Key Configuration (Optional)

TutIn is designed to be completely offline, but you can plug in API keys to unlock advanced features.

Instead of messing with `.env` files, **all API keys are managed directly in the app's UI:**
1. Open TutIn in your browser.
2. Click the **Settings** gear icon.
3. Go to the **AI & API Keys** tab.

Here you can configure:
- **Google API Key**: Required *only* if you want to import complete YouTube playlists or Google Drive folders. Single videos work without it.
- **OpenRouter API Key**: Required *only* if you want Gemini/Claude to generate structured summaries from your offline transcripts.

> **Note**: AI Transcription runs 100% locally on your machine via WebGPU. No API keys or internet connection are required to transcribe your videos.

## 📖 Usage

### Importing Your First Course

#### From Local Folder

1. Click **"Add Course"** button on the homepage
2. Select **"Import from Folder"**
3. Choose your course folder containing video files
4. Preview the detected modules and videos
5. Edit course title, description, and tags if needed
6. Click **"Import Course"**

**Recommended**: Set up a root folder for all your courses:
1. Go to **Settings → Data → Courses Folder**
2. Select your parent folder containing all course folders
3. On next visit, click **"Restore Access"** to reconnect (no need to re-pick)

#### From YouTube

1. Click **"Add Course"** → **"Import from YouTube"**
2. Paste a YouTube video URL or playlist URL
3. Wait for metadata to load (title, description, thumbnails)
4. Preview the playlist structure
5. Edit details if needed
6. Click **"Import"**

> **Tip**: Channel avatars are automatically fetched for YouTube playlists!

#### From Google Drive

1. Click **"Add Course"** → **"Import from Google Drive"**
2. Paste the Google Drive folder URL or video URL
3. Review the imported videos
4. Configure course details
5. Click **"Import"**

### Using AI Features

#### Transcribe a Video

1. Open any course and play a video
2. Click the **"AI Summary"** tab in the sidebar
3. Click **"Transcribe Video"**
4. Wait for the Whisper model to download (first time only, ~40MB)
5. Watch progress as transcription runs in background
6. View transcript with timestamps

#### Generate AI Summary

1. After transcription completes (or if transcript already exists)
2. Click **"Generate Summary"**
3. Wait for Gemini AI to analyze the transcript
4. View structured summary with:
   - Auto-generated title
   - Key bullet points
   - Detailed notes
   - Action items

#### Enable Closed Captions

1. After transcription, CC icon appears in video player
2. Click **CC** button to toggle captions on/off
3. Drag captions to reposition if needed
4. Captions automatically position to avoid controls

### Creating a Learning Roadmap

1. Navigate to **Roadmap** page from sidebar
2. Click **"Create New Roadmap"**
3. Give your roadmap a name
4. Click **"Add Course"** and select courses to add to canvas
5. Drag course nodes to position them
6. Click a course's connection icon, then click another course to link them
7. Use zoom controls to navigate large roadmaps
8. Click **"Save"** to persist your roadmap

### Tracking Progress

- **Automatic**: Videos auto-complete when you watch past the threshold (default 90%)
- **Manual**: Click the checkmark icon on any video to mark complete/incomplete
- **Dashboard**: View statistics on the **Statistics** page
- **Filter**: Use homepage filters to see "In Progress" or "Completed" courses

---

## 🏗️ Architecture

### Technology Stack

#### Frontend
- **React 18.3** - UI library with hooks and suspense
- **React Router 7** - Client-side routing with lazy loading
- **Vite 6** - Lightning-fast build tool and dev server
- **Tailwind CSS 3.4** - Utility-first styling with custom dark theme

#### State Management
- **React Context API** - Global state for theme, settings, sidebar, and search
- **Local State** - Component-level state with useState and useReducer

#### Backend Services (Companion Servers)
- **Node.js + Express**: Local API server handling data routing and heavy filesystem ops
- **SQLite 3**: Robust, scalable local database for course metadata and analytics
- **Python + FastAPI**: Dedicated dubbing server running Coqui XTTS v2 for voice cloning
- **Better-SQLite3**: High-performance synchronous SQLite driver for Node.js

#### Storage & Persistence
- **SQLite + IndexedDB**: Hybrid data store for absolute data safety without browser limits
- **localStorage**: User settings and UI preferences
- **File System Access API**: Persistent folder access for local courses

#### AI & Machine Learning
- **Transformers.js 2.17**: In-browser ML with Whisper Tiny model
- **Coqui XTTS v2**: High-quality zero-shot voice cloning for 16+ languages (via Python server)
- **OpenRouter API**: Cloud AI models (Gemini 2.0 Flash / Claude) for summarization

#### Video Playback
- **ReactPlayer 3.4** - Universal video player component
- **YouTube iframe API**: Native YouTube player embed with custom controls
- **WebGPU / WebNN**: Accelerated AI transcription via Transformers.js
- **HLS.js 1.6**: HTTP Live Streaming support
- **mpegts.js 1.8** - MPEG-TS streaming support

#### UI Libraries
- **Lucide React 0.469** - Beautiful, consistent icon set
- **Recharts 2.15** - Composable charting library
- **react-markdown 10.1** - Markdown rendering for summaries

### Project Structure

```
tutin/
├── public/                  # Static assets
├── src/
│   ├── components/
│   │   ├── common/          # Reusable UI components
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── NotificationToast.jsx
│   │   ├── course/          # Course management components
│   │   │   ├── CourseCard.jsx              # Course display card
│   │   │   ├── EditCourseModal.jsx        # Course editing modal
│   │   │   ├── ImportPreviewModal.jsx     # Import preview & editing
│   │   │   ├── InstructorProfileModal.jsx # Instructor details
│   │   │   ├── YouTubeImportModal.jsx     # YouTube import UI
│   │   │   └── GoogleDriveImportModal.jsx # Google Drive import UI
│   │   ├── layout/          # App layout components
│   │   │   ├── Header.jsx                  # Top navigation bar
│   │   │   └── Sidebar.jsx                 # Collapsible sidebar
│   │   ├── player/          # Video player components
│   │   │   ├── VideoPlayer.jsx             # Main video player (48KB!)
│   │   │   ├── PlaylistSidebar.jsx        # Course playlist sidebar
│   │   │   ├── NotesPanel.jsx             # Timestamped notes
│   │   │   ├── AISummaryPanel.jsx         # AI transcription & summary
│   │   │   ├── EditModuleModal.jsx        # Module editing
│   │   │   └── BulkEditPlaylist.jsx       # Bulk playlist operations
│   │   └── settings/        # Settings & preferences
│   │       └── SettingsModal.jsx          # Settings modal with tabs
│   ├── contexts/            # React Context providers
│   │   ├── ThemeContext.jsx               # Dark/light theme
│   │   ├── SettingsContext.jsx            # User settings
│   │   ├── SidebarContext.jsx             # Sidebar state
│   │   └── SearchContext.jsx              # Global search state
│   ├── pages/               # Main application pages
│   │   ├── HomePage.jsx                    # Course library & filters
│   │   ├── CoursePlayerPage.jsx           # Video player page
│   │   ├── InstructorsPage.jsx            # Browse by instructor
│   │   ├── HistoryPage.jsx                # Watch history
│   │   ├── StatisticsPage.jsx             # Learning analytics
│   │   ├── RoadmapPage.jsx                # Visual course roadmap
│   │   └── ProfilePage.jsx                # User profile settings
│   ├── utils/               # Utility modules
│   │   ├── db.js                          # IndexedDB wrapper (1200+ lines)
│   │   ├── fileSystem.js                  # File System Access API
│   │   ├── aiSummarization.js            # Whisper + Gemini AI
│   │   ├── whisperWorker.js              # Web Worker for Whisper
│   │   ├── googleDrive.js                # Google Drive URL parsing
│   │   ├── timeUtils.js                  # Time formatting utilities
│   │   └── validation.js                 # Input validation
│   ├── App.jsx              # Root component with routing
│   ├── main.jsx             # Application entry point
│   └── index.css            # Global styles & Tailwind
├── index.html               # HTML template
├── package.json             # Dependencies & scripts
├── vite.config.js          # Vite configuration
├── tailwind.config.js      # Tailwind theme customization
└── README.md               # This file
```

### Data Models

#### IndexedDB Stores

1. **courses** - Course metadata
   - id, title, description, sourceType, tags, completionPercentage, etc.

2. **modules** - Module organization
   - id, courseId, title, order, videoCount

3. **videos** - Video information & progress
   - id, courseId, moduleId, title, filePath, duration, watchedDuration, completed, lastWatched

4. **notes** - Timestamped notes
   - id, videoId, timestamp, content, createdAt

5. **instructors** - Instructor data (deduplicated)
   - id (instructor name), avatar (base64), courses (array of course IDs)

6. **roadmaps** - Visual learning paths
   - id, name, nodes (courses with position), connections

7. **handles** - Persistent folder handles
   - type, handle (FileSystemHandle), path

### Key Features Implementation

- **Offline-First**: All data is routed through the local SQLite companion server and IndexedDB, ensuring zero cloud dependency.
- **Persistent Folder Access**: FileSystemHandle stored locally, restored on app load
- **AI Processing**: Dedicated Web Workers and local Python servers prevent UI blocking during transcription or dubbing
- **Lazy Loading**: Pages and heavy components loaded on-demand
- **Error Boundaries**: Graceful error handling prevents app crashes
- **Responsive**: Mobile-first design with Tailwind breakpoints

---

## ⌨️ Keyboard Shortcuts

### Video Player

| Shortcut | Action |
|----------|--------|
| `Space` or `K` | Play / Pause |
| `L` | Seek forward 10s |
| `J` | Seek backward 10s |
| `←` | Rewind 5 seconds |
| `→` | Forward 5 seconds |
| `↑` | Volume up |
| `↓` | Volume down |
| `F` | Toggle fullscreen |
| `M` | Mute / Unmute |
| `P` | Picture-in-Picture |
| `N` | Skip intro (10 seconds forward) |
| `Shift + N` | Next video in playlist |
| `<` | Decrease playback speed |
| `>` | Increase playback speed |
| `A` | Toggle auto-play next |
| `0-9` | Seek to 0%-90% of video |

### Global

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Focus search (if search is visible) |
| `Esc` | Close modals |

> **Tip**: Hover over buttons to see tooltips with keyboard shortcuts!

---

## ⚙️ Configuration

### Theme Customization

Edit `tailwind.config.js` to customize colors, fonts, and animations:

```javascript
theme: {
  extend: {
    colors: {
      dark: {
        bg: '#050505',      // Pure black background
        surface: '#121212', // Dark grey surface
        // ... more colors
      }
    }
  }
}
```

### Playback Settings

Configure in **Settings → Playback**:
- **Default Speed**: 0.25x to 2x
- **Auto-play Next**: Enable/disable
- **Completion Threshold**: 90%, 95%, or 100%
- **Progress Mode**: By videos or by duration

### AI Configuration

- **Transcription Model**: Built-in `Xenova/whisper-tiny` (40MB, cached locally)
- **Summarization Model**: Configurable in UI (defaults to Gemini 2.0 Flash via OpenRouter)
- **Dubbing Model**: Local Coqui XTTS v2 running via the Python companion server

To configure AI keys:
1. Open the TutIn App in your browser.
2. Navigate to **Settings → AI & API Keys**.
3. Paste your OpenRouter API key and/or Google API key.
4. Changes are applied instantly. No restarts required!

---

## 🌐 Browser Support

| Browser | Support Level | Notes |
|---------|--------------|-------|
| **Chrome** | ✅ Full Support | Recommended - all features work |
| **Edge** | ✅ Full Support | Chromium-based, all features work |
| **Opera** | ✅ Full Support | Chromium-based, all features work |
| **Brave** | ⚠️ Partial | Works, but disable Shields for File System API |
| **Firefox** | ❌ Limited | No File System Access API - use YouTube/GDrive import |
| **Safari** | ❌ Limited | No File System Access API - use YouTube/GDrive import |

### Feature Availability

| Feature | Chrome/Edge/Opera | Firefox/Safari |
|---------|------------------|----------------|
| Local folder import | ✅ | ❌ Manual file picker |
| YouTube import | ✅ | ✅ |
| Google Drive import | ✅ | ✅ |
| AI Transcription | ✅ | ✅ |
| AI Summarization | ✅ | ✅ |
| Persistent folder access | ✅ | ❌ |

---

<div align="center">

**Made with ❤️ for learners who lock in**

</div>
