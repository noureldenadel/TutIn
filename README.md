# TutIn - Course Learning Tracker

A modern, offline-first course management application for tracking video course progress. Built with React, Vite, and Tailwind CSS.

![TutIn Screenshot](./docs/screenshot.png)

## Features

### Core Features
- 📁 **Local Course Import** - Import video courses from local folders
- 🎬 **YouTube Import** - Import videos and playlists from YouTube
- 📊 **Progress Tracking** - Track watch progress for each video
- ✅ **Completion Marking** - Mark videos as complete manually or automatically
- 🔄 **Resume Playback** - Resume videos from where you left off
- 🌙 **Dark/Light Mode** - Toggle between themes
- 🏷️ **Filter Tabs** - Filter courses by All, Completed, In Progress, Not Started, or custom tags

### Video Player
- ⌨️ **Keyboard Shortcuts** - Full keyboard control (Space, Arrow keys, etc.)
- 🖼️ **Picture-in-Picture** - Watch while doing other things
- ⏭️ **Auto-play Next** - Automatically play next video
- 🎚️ **Speed Control** - Adjust playback speed (0.25x - 2x)
- 📝 **Notes** - Add timestamped notes while watching

### AI Features
- 🤖 **AI Transcription** - Transcribe videos using Whisper AI (runs in-browser)
- ✨ **AI Summary** - Generate structured summaries with Gemini AI
- 📋 **Key Points** - Auto-extract titles, bullet points, and action items
- 💾 **Offline Model** - AI model cached locally after first download (~40MB)

### Organization
- 🏷️ **Tags** - Organize courses with custom tags
- 🔍 **Search & Filter** - Find courses quickly
- 📈 **Sort Options** - Sort by name, progress, date, or duration
- 📚 **Module Organization** - Edit and organize course modules

### Data Management
- 💾 **Export/Import** - Backup and restore all data
- 📂 **Root Folder** - Set a parent folder for all courses (one-time access per session)
- ♻️ **Reset App** - Start fresh with clean data

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Chrome, Edge, or Opera (for File System Access API)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tutin.git

# Navigate to project folder
cd tutin

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

### Importing a Course
1. Click "Add Course" on the homepage
2. Select your course folder
3. Review the detected modules and videos
4. Click "Import Course"

### Setting Up Root Folder (Recommended)
1. Go to **Settings → Data → Courses Folder**
2. Select your parent folder containing all courses
3. Grant access once per browser session

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space/K | Play/Pause |
| ←/→ | Seek 5 seconds |
| ↑/↓ | Volume |
| F | Fullscreen |
| M | Mute |
| P | Picture-in-Picture |
| N | Skip Intro (10s) |
| Shift+N | Next Video |
| < / > | Speed down/up |
| A | Toggle Auto-play |
| 0-9 | Seek to % |

## Project Structure

```
src/
├── components/          # React components
│   ├── common/          # Reusable UI components
│   │   ├── ErrorBoundary.jsx
│   │   ├── LoadingSpinner.jsx
│   │   └── NotificationToast.jsx
│   ├── course/          # Course-related components
│   │   ├── CourseCard.jsx
│   │   ├── EditCourseModal.jsx
│   │   └── ImportPreviewModal.jsx
│   ├── layout/          # Layout components
│   │   └── Header.jsx
│   ├── player/          # Video player components
│   │   ├── AISummaryPanel.jsx
│   │   ├── EditModuleModal.jsx
│   │   ├── NotesPanel.jsx
│   │   ├── PlaylistSidebar.jsx
│   │   └── VideoPlayer.jsx
│   └── settings/        # Settings components
│       └── SettingsModal.jsx
├── contexts/            # React contexts
│   ├── SettingsContext.jsx
│   └── ThemeContext.jsx
├── pages/               # Page components
│   ├── CoursePlayerPage.jsx
│   └── HomePage.jsx
├── utils/               # Utility functions
│   ├── aiSummarization.js # AI transcription & summarization
│   ├── db.js            # IndexedDB operations
│   ├── fileSystem.js    # File System API utilities
│   ├── timeUtils.js     # Time formatting utilities
│   └── validation.js    # Validation utilities
├── App.jsx              # Root component
├── index.css            # Global styles
└── main.jsx             # Entry point
```

## Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **IndexedDB** - Local data storage
- **File System Access API** - Local file access
- **Transformers.js** - In-browser Whisper AI transcription
- **OpenRouter API** - Gemini AI summarization
- **Lucide React** - Icons
- **Recharts** - Progress visualization

## Browser Support

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome | ✅ Full | Recommended |
| Edge | ✅ Full | |
| Opera | ✅ Full | |
| Brave | ⚠️ Partial | Disable Shields |
| Firefox | ❌ Limited | No File System API |
| Safari | ❌ Limited | No File System API |

## Data Storage

All data is stored locally:
- **IndexedDB** - Courses, videos, progress, notes
- **localStorage** - Settings, preferences

No server required - works completely offline!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [Lucide](https://lucide.dev/) for beautiful icons
- [Tailwind CSS](https://tailwindcss.com/) for utility-first styling
- [Vite](https://vitejs.dev/) for fast development
