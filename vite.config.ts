import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { authoringPackPlugin } from './scripts/authoring-pack.mjs'

// `virtual:h5p-authoring-pack`: the semantics and translations Create builds content from and
// the editor reads, from the installed pack, loaded by `create.js` the first time Create is
// used. `evals/` is a second page: the editing spine against the real model, by hand.
export default defineConfig({
  plugins: [authoringPackPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        evals: fileURLToPath(new URL('./evals/index.html', import.meta.url)),
        desktop: fileURLToPath(new URL('./desktop-check/index.html', import.meta.url))
      }
    }
  }
})
