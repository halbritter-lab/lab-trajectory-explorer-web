/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicy } from './src/build/contentSecurityPolicy'

/**
 * The webR runtime loads gzip files (`*.data.gz`) and unpacks them itself.
 * The development and preview servers (sirv) send such a file with
 * `Content-Encoding: gzip`, so the browser unpacks it first and webR fails to
 * load R packages. Serve the R files below webr/ and r-packages/ unchanged,
 * as a static host such as GitHub Pages does.
 */
function serveRRuntimeUnchanged(): Plugin {
  const handler = (root: string) => (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0])
    if (!/^\/(webr|r-packages)\/.+\.gz$/.test(path)) return next()
    const file = resolve(root, `.${path}`)
    if (!file.startsWith(root + sep) || !existsSync(file)) return next()
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Length', statSync(file).size)
    createReadStream(file).pipe(res)
  }
  return {
    name: 'serve-r-runtime-unchanged',
    configureServer: server => { server.middlewares.use(handler(resolve(server.config.root, server.config.publicDir))) },
    configurePreviewServer: server => { server.middlewares.use(handler(resolve(server.config.root, server.config.build.outDir))) },
  }
}

export default defineConfig({
  plugins: [react(), serveRRuntimeUnchanged(), {
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
