import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        composer: 'composer.html',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
