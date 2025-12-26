# TutIn v2.0.0 Release Notes

**Release Date**: December 26, 2025  
**Author**: noor  
**Repository**: [github.com/noureldenadel/TutIn](https://github.com/noureldenadel/TutIn)

---

## 🎉 Welcome to TutIn v2.0!

This is the first major public release of TutIn - an AI-powered, offline-first course learning platform that transforms how you manage and learn from video courses.

## 🌟 Highlights

- **🤖 AI-Powered Learning**: In-browser transcription with Whisper AI + smart summarization with Gemini 2.0
- **📚 Multi-Source Import**: Local folders, YouTube playlists, and Google Drive
- **🗺️ Visual Roadmaps**: Plan your learning journey with interactive course dependency graphs
- **📊 Rich Analytics**: Track your progress with comprehensive statistics and charts
- **🎬 Advanced Player**: Custom video player with 20+ keyboard shortcuts and PiP support
- **💾 Offline-First**: Everything works locally - your data, your privacy

## ✨ Key Features

### Course Management
- Import from local folders, YouTube, or Google Drive
- Smart module detection and organization
- Custom tags and advanced filtering
- Global search across all courses
- Flexible sorting options

### AI Features
- **Offline Transcription**: Uses Whisper Tiny model (~40MB, runs in browser)
- **Smart Summarization**: Generates structured summaries with Gemini 2.0 Flash
- **Auto Captions**: Click-to-seek timestamped captions
- **Export**: Download transcripts and summaries as markdown

### Video Player
- Picture-in-Picture mode
- 20+ keyboard shortcuts
- Auto-resume from last position
- Variable playback speed (0.25x-2x)
- Multi-format support (MP4, WebM, HLS, YouTube, etc.)

### Learning Analytics
- Progress tracking (by videos or watch time)
- Visual statistics dashboard with charts
- Watch history with quick resume
- Configurable completion thresholds

### Visual Roadmap
- Drag-and-drop course positioning
- Visual prerequisite connections
- Multiple roadmaps support
- Export/import as JSON

## 📦 What's Included

### Production Build
- **Optimized Bundle**: Minified and code-split for fast loading
- **Chunk Sizes**:
  - react-vendor: 175 KB (57.5 KB gzipped)
  - ui-vendor: 134 KB (41 KB gzipped)
  - Course Player: 67 KB (18.6 KB gzipped)
  - Total CSS: 59.5 KB (9.4 KB gzipped)

### Documentation
- **README.md**: Complete feature documentation
- **INSTALL.md**: Step-by-step installation guide
- **CHANGELOG.md**: Detailed changelog
- **.env.example**: Environment configuration template

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/noureldenadel/TutIn.git
cd TutIn

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

### For End Users

1. Download and extract the release
2. Install [Node.js 18+](https://nodejs.org/)
3. Run `npm install`
4. Run `npm run dev`
5. Open browser to `http://localhost:3000`

📖 See [INSTALL.md](INSTALL.md) for detailed setup instructions.

## 🌐 Deployment

### Static Hosting

The production build in `/dist` can be deployed to any static hosting service:

**GitHub Pages:**
```bash
npm run build
# Deploy the dist/ folder to gh-pages branch
```

**Netlify:**
- Build command: `npm run build`
- Publish directory: `dist`

**Vercel:**
- Framework Preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

## ⚡ Performance

- **First Load**: ~200 KB (gzipped)
- **AI Model Download**: 40 MB (one-time, cached)
- **Lighthouse Scores**: 
  - Performance: 95+
  - Accessibility: 90+
  - Best Practices: 95+
  - SEO: 100

## 🌐 Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | Recommended |
| Edge 90+ | ✅ Full | All features work |
| Opera 76+ | ✅ Full | All features work |
| Brave | ⚠️ Partial | Disable Shields for File System API |
| Firefox | ❌ Limited | No File System API (use YouTube/GDrive) |
| Safari | ❌ Limited | No File System API (use YouTube/GDrive) |

## 🔑 API Keys

For AI summarization, you'll need a free OpenRouter API key:

1. Sign up at [openrouter.ai](https://openrouter.ai/)
2. Create a new API key
3. Add to `.env` file: `VITE_OPENROUTER_API_KEY=your_key`

**Note**: AI transcription works completely offline without any API key.

## 🐛 Known Issues

1. **File System Access API** not available in Firefox/Safari
   - Workaround: Use YouTube or Google Drive import
   
2. **First transcription** requires ~40MB model download
   - This is one-time; model is cached for future use
   
3. **Large playlists** (100+ videos) may take time to import
   - Consider importing in smaller batches

4. **YouTube embeds** may not work for restricted videos
   - Video must allow embedding

## 🔄 Upgrading

This is the first major release. Future upgrades will include:
- Data export before upgrading (Settings → Export All Data)
- Import after upgrade to restore your courses

## 📚 Documentation

- **[README.md](README.md)**: Complete documentation
- **[INSTALL.md](INSTALL.md)**: Installation guide
- **[CHANGELOG.md](CHANGELOG.md)**: Version history

## 🙏 Acknowledgments

Built with:
- React 18.3
- Vite 6.0
- Transformers.js (Whisper AI)
- Tailwind CSS 3.4
- And many other amazing open-source libraries

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/noureldenadel/TutIn/issues)
- **Discussions**: [GitHub Discussions](https://github.com/noureldenadel/TutIn/discussions)
- **Documentation**: See README.md

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to Lock In & Learn!** 🚀

Download the release, follow the installation guide, and start organizing your learning journey today!
