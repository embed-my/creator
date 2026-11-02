import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The semantics Create builds content from and the editor reads come from the library pack's
// parts, which the page fetches when it first needs them (`src/library-pack.js`). `evals/` is a
// second page: the editing spine against the real model, by hand.
export default defineConfig({
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
