import { fileURLToPath } from 'node:url'
import { build, type Rollup } from 'vite'
import { describe, expect, it } from 'vitest'

const extensionRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * Guards the one property of the content bundle that Chrome enforces and no
 * unit test can see: that it is loadable at all.
 *
 * `content_scripts[].js` has no `"type": "module"` the way `background` does, so
 * the file is injected as a *classic* script. One `import` in it is a
 * `SyntaxError` on the first line, the whole script is discarded, and the
 * symptom is an action row with no gift button — while every test in
 * `content.test.ts` keeps passing, because those run the TypeScript source and
 * never see the bundle.
 *
 * It broke that way once already. Sharing a Rollup pass with the service worker
 * let `@tipee/shared` be hoisted into a chunk and left an `import` in both
 * outputs; only the worker, a module, was allowed to have one. That also made it
 * intermittent — the hoist happens only while the two entries share a module, so
 * an unrelated edit could start or stop the injection path without touching it.
 *
 * So this builds the real config and reads the real output.
 */
describe('the content script bundle', () => {
  it('is a classic script Chrome can inject, with no module syntax', async () => {
    const chunks = await buildContent()
    const content = chunks.find((chunk) => chunk.fileName === 'content.js')

    expect(content, 'the build emitted no content.js').toBeDefined()
    // Rollup writes module syntax at the start of a line and nowhere else, so
    // anchoring avoids tripping over the word inside a string or a comment.
    expect(content?.code).not.toMatch(/^\s*(?:import|export)[\s{*(]/m)
    expect(content?.code).not.toMatch(/\bimport\s*\(/)
  })

  it('emits exactly one file, since nothing beside it is web-accessible', async () => {
    // A content script's own imports are subject to `web_accessible_resources`.
    // A second chunk would be fetched from the page's origin and refused, which
    // fails the same way an import statement does but only in a real browser.
    const chunks = await buildContent()
    expect(chunks.map((chunk) => chunk.fileName)).toEqual(['content.js'])
  })
})

/** Runs the shipped config in memory — no `dist/`, nothing written. */
async function buildContent(): Promise<Rollup.OutputChunk[]> {
  const result = await build({
    root: extensionRoot,
    // `fileURLToPath`, not `.pathname`: on Windows the latter yields a leading
    // slash before the drive letter and percent-encodes the spaces in the path.
    configFile: fileURLToPath(new URL('../vite.config.content.ts', import.meta.url)),
    logLevel: 'silent',
    build: { write: false },
  })

  const outputs = Array.isArray(result) ? result : [result]
  return outputs
    .flatMap((bundle) => ('output' in bundle ? bundle.output : []))
    .filter((chunk): chunk is Rollup.OutputChunk => chunk.type === 'chunk')
}
