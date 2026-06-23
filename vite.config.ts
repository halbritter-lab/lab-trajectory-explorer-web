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
      output: {
        // Split the two large vendor libraries into their own chunks so the
        // main bundle stays lean and they cache independently.
        manualChunks: {
          xlsx: ['xlsx'],
          plot: ['@observablehq/plot'],
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
