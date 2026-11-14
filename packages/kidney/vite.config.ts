import { defineConfig } from 'vite'

// Library build of src/index.ts into one ESM file. Run from the repository
// root with `pnpm build:kidney`; tsc writes the declarations afterwards.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    // SheetJS stays a runtime dependency instead of being bundled.
    rollupOptions: { external: ['xlsx'] },
  },
})
