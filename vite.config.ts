/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicy } from './src/build/contentSecurityPolicy'

export default defineConfig({
  plugins: [react(), {
    // Build only: the development server injects an inline script for hot
    // reloading, which the policy would block.
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy() }, injectTo: 'head-prepend' }],
  }],
  // Relative base so the static build works under any subpath (e.g. GitHub
  // Pages project sites). Deliberate; do not change to '/' without revisiting
  // the deployment target. The build does not run from file://: Chromium
  // blocks the module script and the stylesheet there (origin 'null'), and
  // Firefox starts the app but cannot start the model worker. index.html
  // carries a static notice for that case; the build needs a web server.
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
    // Agent worktrees under .claude/ hold other branches' copies of the tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
