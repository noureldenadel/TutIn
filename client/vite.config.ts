import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // Prevent Vite from walking up to the parent legacy repo's Tailwind v3 postcss.config.js
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env["VITE_API_TARGET"] || "http://127.0.0.1:9474",
        changeOrigin: true,
      },
      "/video": {
        target: process.env["VITE_API_TARGET"] || "http://127.0.0.1:9474",
        changeOrigin: true,
      },
    },
  },
});
