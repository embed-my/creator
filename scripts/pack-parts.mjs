import { resolve } from 'node:path'

/**
 * The installed pack's parts: one archive per library, and `index.json`. The tests play packages
 * against it with h5p-verify, so no network is needed.
 */
export const PARTS_DIR = resolve(import.meta.dirname, '..', 'node_modules', '@missing-elements', 'h5p-libraries', 'parts')
