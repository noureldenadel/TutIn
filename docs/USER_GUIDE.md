# TutIn User Guide

Welcome to the **TutIn User Guide**! This document provides detailed, step-by-step instructions on how to navigate, organize, and utilize all the powerful features TutIn offers. 

> [!TIP]
> If you haven't installed TutIn yet, please see the [Installation Guide](INSTALL.md) first.

---

## 📚 Course Library Management

The homepage is your central hub for all your learning materials. TutIn allows you to import courses from various sources, managing them under a single unified dashboard. You can also mass-manage your content using the **Course Manager**.

### Course Manager (Bulk Editor)
Click on the **Course Manager** icon to open the bulk editor. Here you can:
- Edit video titles and playlist orders in bulk.
- Select multiple videos and queue background tasks for **Bulk Translation** and **Bulk Dubbing**.

### Importing a Local Folder
1. Click **Add Course** → **Import from Folder**.
2. Select your course folder from your computer.
3. TutIn will automatically scan the folder structure, detect videos, and organize them into modules based on your subfolders.
4. Review the structure, edit titles if needed, and click **Import Course**.

> [!NOTE]
> TutIn uses the **File System Access API** to read your local files securely. For persistent access, we highly recommend setting a Root Folder via **Settings → Data → Courses Folder**. This prevents your browser from asking for permission every single time you launch the app.

### Importing from YouTube
1. Click **Add Course** → **Import from YouTube**.
2. Paste the URL of a YouTube playlist or video.
3. TutIn automatically fetches the title, description, thumbnails, and channel avatars.
4. Preview the imported content and click **Import**.

### Importing from Google Drive
1. Click **Add Course** → **Import from Google Drive**.
2. Paste a Google Drive folder link or direct video link.
3. Ensure the folder/file permissions are set to "Anyone with link can view".
4. Review and click **Import**.

---

## 🎬 Video Player & Playback Features

TutIn features a highly optimized video player designed explicitly for learning. 

### Custom Player Controls
- **Playback Speed**: Adjust speed from `0.25x` to `2x`. You can also hold the `Shift` or `Right Arrow` key (depending on context) to temporarily speed up playback, similar to YouTube.
- **Picture-in-Picture (PiP)**: Keep watching while taking notes in another application.
- **Auto-Play & Auto-Resume**: The player remembers exactly where you left off. When enabled, it also seamlessly transitions to the next video when the current one finishes.

### Keyboard Shortcuts
Use these to navigate quickly without touching your mouse:

| Action | Shortcut |
|--------|----------|
| **Play/Pause** | `Space` or `K` |
| **Seek Forward 10s** | `L` |
| **Seek Backward 10s** | `J` |
| **Skip Intro/Outro** | `N` |
| **Volume Up/Down** | `↑` / `↓` |
| **Fullscreen Toggle** | `F` |

---

## 🤖 AI-Powered Features

TutIn's AI features run locally and privately. The AI pipeline is designed sequentially: generate transcript, translate it, and finally dub it.

### Transcription (Whisper AI)
1. In the course player, click the **AI Summary** tab in the sidebar.
2. Click **Transcribe Video**.
3. **First-time use:** TutIn will download a lightweight Whisper AI model (~40MB). 
4. The transcription runs entirely in your browser. Once complete, you will see a timestamped transcript. 
   > *Note on Files:* AI-generated transcripts are saved directly in your course folder under a `.tutin/transcripts` directory. They will carry a `-generated` tag along with their language code (e.g., `-generated.en.vtt`) to distinguish them from your own manually uploaded subtitle files.
5. Click on any word in the transcript to jump to that specific point in the video!

### Generating Summaries (Gemini)
> [!IMPORTANT]
> You must configure a free OpenRouter API key in your `.env` file to generate AI summaries. See the [Installation Guide](INSTALL.md) for details.

1. Once a video is transcribed, click **Generate Summary**.
2. Gemini AI will analyze the text and output a rich, Markdown-formatted summary containing learning objectives, bullet points, and action items.

### Automatic Punctuation Restoration & Smart Alignment
If you upload subtitle files (`.srt` or `.vtt`) that lack punctuation (e.g. raw speech-to-text dumps, YouTube auto-captions):
- TutIn automatically detects low punctuation density and restores punctuation marks (`.`, `?`, `!`, `،`, `؟`) and proper capitalization.
- **On-Demand Downloads:** Downloads only the specialized model for that language (~35MB for English, ~42MB for Arabic), keeping disk usage minimal.
- **Timestamp Accuracy:** Restored words are remapped back to original cue timestamps with millisecond precision, ensuring video captions never drift out of sync.
- **Audio vs Subtitle Decoupling:** If you upload an English subtitle file for a Spanish course video and set it as the AI Source, TutIn processes the text as English, translates from English, and allows dubbing/translating back into Spanish.
- **Cache Management:** Open **Settings → AI & API Keys** to view cached punctuation models, check disk usage, or delete models to free up storage.

### AI Dubbing (Voice Cloning)
TutIn can automatically dub videos into 16+ languages, cloning the original speaker's voice using Coqui XTTS v2.

**Advanced Audio Processing**:
- **Natural Sentence Prosody:** The engine stitches fragmented subtitle cues into complete grammatical sentences before translation and speech synthesis, ensuring fluent cadence, proper breathing, and natural vocal intonation.
- **Intelligent Time-Fitting & Rubber Band:** Speech duration is fitted using a 4-tier engine: inter-cue silence gap absorption (zero-stretch first), native XTTS speed pre-biasing ($0.88\times$ to $1.25\times$), internal pause trimming, and FFmpeg `rubberband` filtering for crisp, artifact-free speech.
- **Background Audio Preservation (Demucs AI):** Check the **"Preserve Background Music & Effects"** toggle to isolate original background music and SFX with Demucs. The pipeline ducks background music by ~16 dB under speech using sidechain compression and adds a subtle continuous room-tone ambience bed.
- **Overlap Prevention & Fading:** Segments automatically avoid collisions on the timeline, with a 20ms fade-in/fade-out eliminating harsh clicks between sentences.

1. Generate or upload a transcript for the video.
2. Click the **Translate** button in the AI panel to translate the captions into your target language (or allow the dubbing engine to auto-translate).
3. Click the **Dubbing** icon (headphones) on the video player controls.
4. Select your target language, toggle **Preserve Background Music & Effects** if desired, and click **Start Dubbing**. 
5. The audio will process and automatically play alongside the video when finished.

> [!WARNING]
> Dubbing requires the Python backend service to be running. If it isn't running, TutIn will prompt you to Auto-Start it from the UI. Ensure you have installed the required Python dependencies (`pip install -r python/requirements.txt`).

---

## 📝 Notes & Annotations

Take contextual notes directly alongside your video. 

1. Click the **Notes** tab in the sidebar.
2. Click **Add Note** to create a Markdown-supported note anchored to the current timestamp.
3. **Smart Pauser:** As soon as you start typing, the video will automatically pause. When you finish, a countdown visual will appear before resuming playback!
4. Use the Markdown editor to format your notes with headers, bold, italic, lists, and links.
5. **Images & Cropper:** You can paste or drag-and-drop images directly into the note editor. TutIn automatically compresses and saves them locally, and you can edit them instantly using the **Inline Image Cropper**.
6. Clicking on a note's timestamp will immediately seek the video back to that exact moment.

---

## 📊 Analytics & Progress Tracking

Stay motivated by tracking your learning journey! 

### Course Progress
- Progress bars on the homepage cards update automatically as you watch videos. 
- You can track progress by **Video Count** or **Watch Duration** (configure this in Settings).
- Videos automatically mark themselves as complete when you watch past the completion threshold (default is 90%). You can also manually toggle completion checkboxes in the playlist.

### Statistics Dashboard
Click the **Statistics** button in the sidebar to view:
- **Total Learning Time** and **Videos Completed**
- **Activity Heatmap** showing your learning streaks.
- **Module Breakdowns** visually charting your progress across different subjects.

---

## 🗺️ Visual Roadmap & Course Canvas

Design your own curriculum using the interactive visual tools.

### Global Roadmap
1. Navigate to the **Roadmap** page.
2. Click **Create New Roadmap**.
3. Click **Add Course** to drop courses onto the infinite canvas.
4. **Link Courses:** Drag connections from one course node to another to establish prerequisite relationships.
5. Your roadmaps save automatically and can be exported as JSON files for backup or sharing.

### Course Canvas
1. Inside any course, navigate to the **Course Canvas** view.
2. Use this dedicated infinite canvas to visually map out modules, connect concepts, and view your notes in a spatial, node-based layout.

---

## ⚙️ Settings & Data Management

Access the Settings modal via the gear icon in the top right.

- **Appearance:** Toggle Dark, Light, or System themes. Choose your preferred accent color.
- **Playback Defaults:** Set your preferred playback speed, skip intro durations, and completion thresholds.
- **Data Export/Import:** TutIn stores all its data locally in your browser's IndexedDB. **Regularly export your data** (Settings → Data → Export All Data) to a JSON file to keep a secure backup. If you clear your browser data or switch computers, you can restore everything using the Import button.

> [!CAUTION]
> If you clear your browser's site data or cache, you will lose your progress and metadata unless you have exported a backup! Always keep backups of your JSON export.

---

Enjoy learning with TutIn! If you run into issues, please refer to the **Troubleshooting** section in the [README.md](../README.md).
