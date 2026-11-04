import { defineConfig } from 'vitest/config'

// Node, not the app's jsdom setup. Run from the root with `pnpm test:mcp`.
export default defineConfig({ root: import.meta.dirname, test: { environment: 'node', include: ['test/**/*.test.ts'] } })
