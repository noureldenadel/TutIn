import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for deployment flexibility
  server: {
    port: 3000,
    open: true
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable source maps for smaller bundle
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        // Chunk splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['lucide-react', 'recharts', 'react-markdown'],
          'video-vendor': ['react-player', 'hls.js', 'mpegts.js'],
          'ai-vendor': ['@xenova/transformers']
        }
      }
    },
    // Increase chunk size warning limit for AI models
    chunkSizeWarningLimit: 2000
  }
})
