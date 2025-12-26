# Deployment Guide

This guide covers deploying TutIn to various static hosting platforms.

## 📋 Prerequisites

- Production build created (`npm run build`)
- The `dist/` folder contains your application
- Git repository initialized and connected to GitHub

## 🚀 Deployment Options

### 1. GitHub Pages (Recommended for GitHub Users)

#### Option A: Manual Deployment

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Install gh-pages package:**
   ```bash
   npm install -D gh-pages
   ```

3. **Add deploy script to package.json:**
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     }
   }
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **Configure GitHub Pages:**
   - Go to your repository on GitHub
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` / `root`
   - Save

Your site will be available at: `https://yourusername.github.io/TutIn/`

#### Option B: GitHub Actions (Automated)

1. **Create workflow file:**
   `.github/workflows/deploy.yml`

   ```yaml
   name: Deploy to GitHub Pages
   
   on:
     push:
       branches: [main]
     workflow_dispatch:
   
   permissions:
     contents: read
     pages: write
     id-token: write
   
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4
         
         - name: Setup Node
           uses: actions/setup-node@v4
           with:
             node-version: 18
             cache: 'npm'
         
         - name: Install dependencies
           run: npm ci
         
         - name: Build
           run: npm run build
         
         - name: Upload artifact
           uses: actions/upload-pages-artifact@v2
           with:
             path: ./dist
     
     deploy:
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       runs-on: ubuntu-latest
       needs: build
       steps:
         - name: Deploy to GitHub Pages
           id: deployment
           uses: actions/deploy-pages@v3
   ```

2. **Configure GitHub Pages:**
   - Settings → Pages
   - Source: GitHub Actions

3. **Push to trigger deployment:**
   ```bash
   git add .
   git commit -m "Add deployment workflow"
   git push
   ```

---

### 2. Netlify

#### Option A: Drag & Drop

1. **Build locally:**
   ```bash
   npm run build
   ```

2. **Deploy:**
   - Visit [app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag and drop the `dist/` folder
   - Your site is live!

#### Option B: Continuous Deployment

1. **Connect GitHub repository:**
   - Login to Netlify
   - New site from Git
   - Choose GitHub → Select TutIn repository

2. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: 18

3. **Deploy:**
   - Click "Deploy site"
   - Automatic deployments on every push

4. **Environment Variables (Optional):**
   - Site settings → Environment variables
   - Add: `VITE_OPENROUTER_API_KEY` (if providing a shared key)

---

### 3. Vercel

1. **Install Vercel CLI (Optional):**
   ```bash
   npm install -g vercel
   ```

2. **Deploy via Dashboard:**
   - Login to [vercel.com](https://vercel.com)
   - Import Project → GitHub → TutIn
   - Configure:
     - Framework Preset: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - Deploy

3. **Deploy via CLI:**
   ```bash
   # From project directory
   vercel
   
   # Follow prompts
   # For production: vercel --prod
   ```

4. **Automatic Deployments:**
   - Every push to main branch triggers deployment
   - Pull requests get preview deployments

---

### 4. Cloudflare Pages

1. **Connect repository:**
   - Login to Cloudflare Dashboard
   - Pages → Create a project
   - Connect to Git → Select TutIn

2. **Configure:**
   - Framework preset: None (or Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`

3. **Deploy:**
   - Click "Save and Deploy"
   - Site goes live on `*.pages.dev`

---

### 5. Firebase Hosting

1. **Install Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Initialize Firebase:**
   ```bash
   firebase login
   firebase init hosting
   ```

3. **Configure hosting:**
   - Public directory: `dist`
   - Single-page app: Yes
   - Automatic builds: Optional

4. **Build and deploy:**
   ```bash
   npm run build
   firebase deploy
   ```

---

### 6. Render

1. **Create new Static Site:**
   - Login to Render
   - New → Static Site
   - Connect GitHub repository

2. **Configure:**
   - Build Command: `npm run build`
   - Publish Directory: `dist`

3. **Deploy:**
   - Click "Create Static Site"

---

### 7. AWS S3 + CloudFront

1. **Build:**
   ```bash
   npm run build
   ```

2. **Create S3 bucket:**
   - Enable static website hosting
   - Upload `dist/` contents

3. **Configure CloudFront:**
   - Create distribution
   - Origin: S3 bucket
   - Enable HTTPS

4. **Deploy:**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name --delete
   aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
   ```

---

## 🔧 Configuration Tips

### Base Path
If deploying to a subdirectory (e.g., `example.com/tutin`), update `vite.config.js`:

```javascript
export default defineConfig({
  base: '/tutin/', // Change ./ to /tutin/
  // ... rest of config
})
```

### Environment Variables
For production deployments with shared API key:

**Netlify/Vercel/etc:**
- Add `VITE_OPENROUTER_API_KEY` in dashboard settings

**GitHub Actions:**
- Add as repository secret
- Reference in workflow: `${{ secrets.VITE_OPENROUTER_API_KEY }}`

### Custom Domain
Most platforms support custom domains:
1. Add domain in platform dashboard
2. Update DNS records (CNAME or A record)
3. Enable HTTPS/SSL

---

## ✅ Post-Deployment Checklist

- [ ] Site loads correctly
- [ ] All routes work (refresh on any page)
- [ ] Assets load (CSS, JS, images)
- [ ] Dark/light mode works
- [ ] Video player functions
- [ ] IndexedDB works (import a course)
- [ ] AI transcription works
- [ ] API key configured (if needed)
- [ ] HTTPS enabled
- [ ] Custom domain configured (if desired)

---

## 🐛 Troubleshooting

### Blank Page After Deployment
- Check browser console for errors
- Verify `base` path in vite.config.js
- Ensure SPA fallback is configured (redirect all to index.html)

### 404 on Refresh
- Configure SPA routing on your hosting platform
- Most platforms have a "rewrites" or "redirects" setting
- Point all routes to `index.html`

### Assets Not Loading
- Check base path configuration
- Verify all files uploaded to hosting
- Check CORS settings (for external assets)

### API Key Not Working
- Verify environment variable name: `VITE_OPENROUTER_API_KEY`
- Rebuild after adding env vars
- Check if platform properly injects env vars at build time

---

## 📊 Monitoring & Analytics

### Recommended Tools
- **Google Analytics**: Page views and user behavior
- **Sentry**: Error tracking
- **Cloudflare Analytics**: Performance metrics
- **Lighthouse CI**: Continuous performance monitoring

---

## 🔄 CI/CD Best Practices

1. **Run tests before deployment** (if you add them)
2. **Use staging environments** for testing
3. **Enable preview deployments** for pull requests
4. **Set up automatic deployments** from main branch
5. **Monitor build times** and optimize if needed
6. **Use caching** for node_modules

---

## 📝 Notes

- TutIn is a static site - no server configuration needed
- All data stored in browser (IndexedDB) - no backend required
- Consider CDN for better global performance
- Enable gzip/brotli compression for faster loading

---

**Happy Deploying!** 🚀
