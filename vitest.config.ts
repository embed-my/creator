import { defineConfig } from 'vitest/config'

// Node, not a browser environment: the authoring code is pure, and each package is played by
// `h5p-verify` in a Chromium of its own, which takes a few seconds a package.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000
  }
})
