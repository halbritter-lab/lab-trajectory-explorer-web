/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the static build works under any subpath (e.g. GitHub
  // Pages project sites) and from file://. Deliberate; do not change to '/'
  // without revisiting the deployment target.
  base: './',
  build: {
    rollupOptions: {
      // public/workspace.html is a static redirect for links to the former
      // second entry point; index.html is the only application entry.
      input: { app: 'index.html' },
      output: {
        // Keep the large spreadsheet library in its own chunk so the main
        // bundle stays lean and it caches independently.
        manualChunks: {
          xlsx: ['xlsx'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
})
