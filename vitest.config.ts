import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    // `shared` is pure computation. The extension packages will need a DOM
    // environment; when they arrive, split this into `test.projects` rather than
    // paying for jsdom on every money-math run.
    environment: 'node',
    clearMocks: true,
  },
})
