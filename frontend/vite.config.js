import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so other PCs on the LAN can open http://<this-pc-ip>:5173.
    host: true,
    // The browser calls /api on the same origin; Vite forwards it to the backend, so no CORS
    // is needed. Override the target with PRAISE_API_URL when the backend is elsewhere.
    // ws: true also forwards the live-notification WebSocket (/api/ws).
    proxy: {
      '/api': { target: process.env.PRAISE_API_URL ?? 'http://127.0.0.1:5050', ws: true },
    },
  },
  // Same for `vite preview` (serving a production build locally).
  preview: {
    host: true,
  },
})
