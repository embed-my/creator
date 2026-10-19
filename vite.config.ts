import { defineConfig } from 'vite'
import { authoringPackPlugin } from './scripts/authoring-pack.mjs'

// `virtual:h5p-authoring-pack`: the semantics and translations Create builds content from, read
// from the installed pack, and loaded by `create.js` the first time Create is used.
export default defineConfig({
  plugins: [authoringPackPlugin()]
})
