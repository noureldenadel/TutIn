# Quick GitHub Release Guide

Follow these steps to publish TutIn v2.0.0 on GitHub.

## Prerequisites
✅ All changes committed and pushed to GitHub  
✅ Production build tested (`npm run preview`)  
✅ Running from: `c:\Users\noure\Desktop\Tutin`

## Step 1: Commit All Changes

```bash
# Check what's changed
git status

# Add all new files
git add .

# Commit with version message
git commit -m "Release v2.0.0 - Initial public release"

# Push to GitHub
git push origin main
```

## Step 2: Create GitHub Release

### Option A: Via GitHub Web Interface (Recommended)

1. **Navigate to releases:**
   - Go to https://github.com/noureldenadel/TutIn
   - Click "Releases" (right sidebar)
   - Click "Create a new release"

2. **Configure release:**
   - **Choose a tag:** Type `v2.0.0` and select "Create new tag: v2.0.0 on publish"
   - **Target:** main branch
   - **Release title:** `v2.0.0 - Initial Public Release`
   - **Description:** Copy and paste from [RELEASE_NOTES.md](file:///c:/Users/noure/Desktop/Tutin/RELEASE_NOTES.md)

3. **Optional - Attach build:**
   - Zip the `dist` folder: Right-click dist → Send to → Compressed folder
   - Rename to `tutin-v2.0.0-dist.zip`
   - Drag and drop to "Attach binaries" section

4. **Publish:**
   - Check "Set as the latest release"
   - Click "Publish release"

### Option B: Via GitHub CLI

If you have GitHub CLI installed:

```bash
# Create release with notes from file
gh release create v2.0.0 \
  --title "v2.0.0 - Initial Public Release" \
  --notes-file RELEASE_NOTES.md \
  --latest

# Optional: Add dist.zip
# First zip the dist folder, then:
gh release upload v2.0.0 tutin-v2.0.0-dist.zip
```

## Step 3: Update Repository Settings

1. **Add repository description:**
   - Settings → General → Description
   - Add: `🚀 AI-Powered Course Learning Platform - Lock In & Learn`

2. **Add topics/tags:**
   - Settings → General → Topics
   - Add: `react`, `vite`, `ai`, `machine-learning`, `video-player`, `education`, `learning-platform`

3. **Set homepage URL** (after deployment):
   - Settings → General → Website
   - Add your deployed URL (e.g., `https://noureldenadel.github.io/TutIn`)

## Step 4: Deploy to GitHub Pages (Optional)

### Quick Deploy Method:

```bash
# Install gh-pages
npm install -D gh-pages

# Deploy (builds and publishes)
npm run build
npx gh-pages -d dist
```

### Configure GitHub Pages:

1. Go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: Select `gh-pages` → `/root`
4. Save

Wait 1-2 minutes, your site will be live at:
**https://noureldenadel.github.io/TutIn/**

### Automated Deployment (Recommended):

1. Create `.github/workflows/deploy.yml` (see [DEPLOYMENT.md](file:///c:/Users/noure/Desktop/Tutin/DEPLOYMENT.md))
2. Go to Settings → Pages
3. Source: GitHub Actions
4. Push changes - automatic deployment!

## Step 5: Announce the Release

### Update README Badge
Add at the top of README.md:
```markdown
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://noureldenadel.github.io/TutIn)
```

### Share on Social Media
```
🚀 Excited to release TutIn v2.0!

An AI-powered, offline-first course learning platform built with React + Vite.

✨ Features:
• In-browser AI transcription (Whisper)
• Smart summarization (Gemini)
• Visual learning roadmaps
• Multi-source import (Local/YouTube/GDrive)
• Advanced video player

Check it out: https://github.com/noureldenadel/TutIn

#WebDev #React #AI #MachineLearning #OpenSource
```

## Verification Checklist

After publishing:

- [ ] Release appears at https://github.com/noureldenadel/TutIn/releases
- [ ] Tag `v2.0.0` created
- [ ] Release notes are visible
- [ ] Assets attached (if applicable)
- [ ] GitHub Pages deployed (if enabled)
- [ ] Live demo link works
- [ ] All documentation links work

## Troubleshooting

**Problem:** Tag already exists
- Delete it: `git tag -d v2.0.0` and `git push origin :refs/tags/v2.0.0`
- Or use a different version: `v2.0.1`

**Problem:** GitHub Pages not building
- Check Settings → Pages source is correct
- Verify gh-pages branch exists
- Check Actions tab for build errors

**Problem:** Can't push to main
- Ensure you have write access
- Try: `git push -u origin main`

## Quick Reference Commands

```bash
# Check git status
git status

# Commit everything
git add . && git commit -m "Release v2.0.0"

# Push to GitHub
git push origin main

# Create and push tag
git tag v2.0.0
git push origin v2.0.0

# Deploy to GitHub Pages
npm run build && npx gh-pages -d dist
```

## Need Help?

- **GitHub Releases**: https://docs.github.com/en/repositories/releasing-projects-on-github
- **GitHub Pages**: https://docs.github.com/en/pages
- **GitHub CLI**: https://cli.github.com/manual/gh_release

---

**You're almost there! Just a few clicks and TutIn v2.0 will be live! 🚀**
