import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Resolved against this file, not the shell: the entry must not depend on cwd. */
const from = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The service worker, alone, as an ES module.
 *
 * `background.type` in the manifest is `"module"`, so this entry may keep real
 * `import`s and let viem's lazy paths stay split — a worker resolves them
 * against its own URL inside the extension origin, where nothing needs to be
 * web-accessible.
 *
 * It builds separately from the content script for the reason spelled out in
 * `vite.config.content.ts`: sharing one Rollup pass is what let a common module
 * be hoisted into a chunk that the content script could not legally import.
 * Two passes cost a duplicated copy of `@tipee/shared` — kilobytes — and buy a
 * content script whose output shape cannot be changed by an edit made over here.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: { 'service-worker': from('src/background/service-worker.ts') },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
  },
})
