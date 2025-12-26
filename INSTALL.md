# TutIn Installation Guide

Complete installation guide for end users to get TutIn up and running.

## 📋 System Requirements

### Required
- **Node.js**: Version 18.0 or higher ([Download here](https://nodejs.org/))
- **npm**: Usually comes with Node.js (version 9.0 or higher)
- **Modern Browser**: One of the following:
  - Google Chrome (recommended)
  - Microsoft Edge
  - Opera
  - Brave (with Shields disabled for local file access)

### Recommended
- **RAM**: 4GB minimum, 8GB recommended (for AI transcription)
- **Storage**: 500MB free space (for app + AI models)
- **Internet**: Required for initial setup and YouTube/Google Drive imports

### Optional
- **OpenRouter API Key**: For AI summarization features ([Get one here](https://openrouter.ai/))
  - Free tier available
  - Only required for AI summary generation
  - AI transcription works offline without any API key

## 🚀 Installation

### Step 1: Install Node.js

If you don't have Node.js installed:

1. Visit [nodejs.org](https://nodejs.org/)
2. Download the **LTS version** (Long Term Support)
3. Run the installer and follow the prompts
4. Verify installation by opening a terminal and running:
   ```bash
   node --version
   npm --version
   ```
   You should see version numbers displayed.

### Step 2: Download TutIn

Choose one of the following methods:

#### Option A: Download from GitHub (Recommended)
1. Visit the [TutIn Repository](https://github.com/noureldenadel/TutIn)
2. Click the green **"Code"** button
3. Select **"Download ZIP"**
4. Extract the ZIP file to your desired location

#### Option B: Clone with Git
If you have Git installed:
```bash
git clone https://github.com/noureldenadel/TutIn.git
cd TutIn
```

### Step 3: Install Dependencies

1. Open a terminal/command prompt
2. Navigate to the TutIn folder:
   ```bash
   cd path/to/TutIn
   ```
3. Install all required packages:
   ```bash
   npm install
   ```
   This will take a few minutes on first run.

### Step 4: Configure API Key (Optional)

If you want to use AI summarization features:

1. Get an API key from [OpenRouter](https://openrouter.ai/)
   - Create a free account
   - Navigate to API Keys section
   - Create a new key
   
2. Create a file named `.env` in the TutIn folder
3. Add your API key:
   ```env
   VITE_OPENROUTER_API_KEY=your_api_key_here
   ```
4. Save the file

> **Note**: Without an API key, you can still use transcription and all other features. Only AI summarization will be unavailable.

### Step 5: Start the Application

Run the development server:
```bash
npm run dev
```

You should see output like:
```
  VITE v6.0.5  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open your browser and navigate to `http://localhost:5173/`

## 🎯 First-Time Setup

### Setting Up Your Course Library

1. **Create a Courses Folder** (Optional but Recommended):
   - Create a folder on your computer to store all your course videos
   - Example: `C:\My Courses\` or `~/Documents/Courses/`
   
2. **Configure Root Folder Access**:
   - Open TutIn in your browser
   - Click the settings icon (gear icon in top-right)
   - Go to **Data** tab
   - Under "Courses Folder", click **"Select Root Folder"**
   - Choose your courses folder
   - Grant permission when prompted
   - This allows TutIn to remember your folder location

### Import Your First Course

#### From Local Folder:
1. Click **"Add Course"** button on the homepage
2. Select **"Import from Folder"**
3. Navigate to a folder containing video files
4. TutIn will auto-detect modules and videos
5. Review and edit the course details
6. Click **"Import Course"**

#### From YouTube:
1. Find a YouTube playlist you want to import
2. Copy the playlist URL (e.g., `https://youtube.com/playlist?list=...`)
3. In TutIn, click **"Add Course"** → **"Import from YouTube"**
4. Paste the URL
5. Wait for metadata to load
6. Click **"Import"**

### Enable AI Features

#### First-Time Transcription:
1. Open any course and play a video
2. Click the **"AI Summary"** tab in the sidebar
3. Click **"Transcribe Video"**
4. On first use, the Whisper AI model (~40MB) will download
5. Wait for download and transcription to complete
6. The model is cached locally for future use

## 🔧 Troubleshooting

### "npm: command not found"
**Problem**: Node.js/npm not installed or not in PATH.

**Solution**: 
1. Install Node.js from [nodejs.org](https://nodejs.org/)
2. Restart your terminal after installation
3. Verify with `node --version`

### "Cannot restore folder access"
**Problem**: Browser lost permission or folder moved.

**Solution**:
1. Go to Settings → Data → Courses Folder
2. Click "Select Root Folder" again
3. Re-grant permission

### Videos won't play
**Problem**: Incorrect file format or permissions.

**Solutions**:
- Ensure videos are in supported formats (MP4, WebM, etc.)
- For local videos, verify folder permissions were granted
- Try a different browser (Chrome recommended)
- For YouTube, ensure video is embeddable

### AI Transcription is slow
**Problem**: Model still downloading or insufficient resources.

**Solutions**:
- First transcription downloads ~40MB model (wait for completion)
- Close other browser tabs to free up memory
- Try transcribing shorter videos first
- Transcription runs in background - you can continue using the app

### YouTube imports fail
**Problem**: Invalid URL or private playlist.

**Solutions**:
- Ensure playlist is public or unlisted
- Use full URL format: `https://youtube.com/playlist?list=PLxxxxxx`
- Try importing individual videos instead
- Wait a few minutes if rate-limited

### Port 5173 already in use
**Problem**: Another app is using the same port.

**Solution**:
```bash
# Kill existing process or use a different port
npm run dev -- --port 3000
```

## 🌐 Browser-Specific Setup

### Chrome / Edge / Opera (Recommended)
No additional setup needed. All features fully supported.

### Brave
1. Click the Brave Shields icon
2. Turn Shields **OFF** for localhost
3. Refresh the page
4. Required for File System Access API

### Firefox / Safari
⚠️ File System Access API not supported. Use these workarounds:
- Import courses from YouTube playlists
- Import from Google Drive
- Use file picker for individual videos (manual selection each time)

## 📦 Updating TutIn

To update to a newer version:

1. Download the latest release from GitHub
2. Back up your data first:
   - Settings → Data → Export All Data
   - Save the JSON file somewhere safe
3. Extract the new version
4. Run `npm install` to update dependencies
5. Run `npm run dev`
6. Import your data if needed (Settings → Import Data)

## 🆘 Getting Help

If you encounter issues:

1. Check the [Troubleshooting section in README.md](README.md#-troubleshooting)
2. Review [Known Issues in CHANGELOG.md](CHANGELOG.md#-known-issues)
3. Search existing issues on [GitHub](https://github.com/noureldenadel/TutIn/issues)
4. Create a new issue with:
   - Your browser and OS version
   - Steps to reproduce the problem
   - Error messages from browser console (F12)

## 🎓 Next Steps

Once installed, check out these guides:

- **[README.md](README.md)**: Complete feature documentation
- **[Keyboard Shortcuts](README.md#%EF%B8%8F-keyboard-shortcuts)**: Learn efficient navigation
- **[Usage Guide](README.md#-usage)**: Detailed usage instructions

---

**Ready to Lock In & Learn!** 🚀
