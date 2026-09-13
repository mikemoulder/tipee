import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Resolved against this file, not the shell: the entry must not depend on cwd. */
const from = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The content script, alone, as one self-contained classic script.
 *
 * A MV3 content script listed under `content_scripts[].js` is injected as a
 * *classic* script — the manifest has no `"type": "module"` for that field, the
 * way `background` does. So an `import` statement anywhere in the emitted file
 * is a `SyntaxError` on the first line and the script never runs at all: no
 * button, no scrape, no tip, and nothing in the page console unless you think
 * to open the one for the extension.
 *
 * That is exactly what a shared build produced. Bundling this entry alongside
 * the service worker let Rollup hoist everything the two had in common —
 * `@tipee/shared`'s youtube module — into `assets/youtube-*.js` and leave an
 * `import` behind in both. The worker is a module and could take it; this file
 * could not. Worse, the hoist only happens *while* the two share something, so
 * moving an import in unrelated code silently turns injection on and off.
 *
 * Hence a build of its own, `iife` so there is no module syntax to emit, and
 * `inlineDynamicImports` so a lazy import cannot reintroduce a second file that
 * nothing is allowed to fetch — chunks are not in `web_accessible_resources`
 * and a content script's imports are not exempt from that.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: { content: from('src/content.ts') },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
})
