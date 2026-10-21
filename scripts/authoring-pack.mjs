import { openAsBlob } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'

/**
 * The part of the library pack the app's Create needs (`src/authoring.js`): for each content type
 * it makes, and each it puts inside one, the newest library in the pack, with its `library.json`,
 * its `semantics.json`, and the library's own translations of those semantics in the languages
 * Create writes in. Read from `@missing-elements/h5p-libraries`' `parts/` when the site is
 * served or built (`authoringPackPlugin`), so the versions and defaults are those of the pack the
 * app plays with, and in Node by `tests/authoring.test.ts`.
 */

/** The libraries whose content Create writes; `src/authoring.js` names each by machine name. */
export const AUTHORING_LIBRARIES = ['H5P.QuestionSet', 'H5P.MultiChoice', 'H5P.TrueFalse', 'H5P.Blanks', 'H5P.Dialogcards']

/** Create's languages but English, whose strings are the semantics' own defaults. */
export const AUTHORING_TRANSLATIONS = ['de', 'es', 'fr', 'ja']

/** The installed pack's parts: one archive per library, and `index.json`. The tests play from it too. */
export const PARTS_DIR = resolve(import.meta.dirname, '..', 'node_modules', '@missing-elements', 'h5p-libraries', 'parts')

/** What a part's `library.json` says that Create uses. */
const LIBRARY_FIELDS = ['machineName', 'majorVersion', 'minorVersion', 'patchVersion', 'title']

/**
 * @returns {Promise<{ libraries: Array<{ folder: string, library: Record<string, unknown>, semantics: unknown[], translations: Record<string, unknown[]> }> }>}
 */
export async function readAuthoringPack(dir = PARTS_DIR) {
  /** @type {{ libraries: Array<{ folder: string, machineName: string, majorVersion: number, minorVersion: number }> }} */
  const index = JSON.parse(await readFile(resolve(dir, 'index.json'), 'utf8'))
  const libraries = []
  for (const machineName of AUTHORING_LIBRARIES) {
    // The newest major, then minor: the pack keeps one minor per major, and the player serves it
    // for content written for any minor of that major.
    const [newest] = index.libraries
      .filter((library) => library.machineName === machineName)
      .sort((a, b) => b.majorVersion - a.majorVersion || b.minorVersion - a.minorVersion)
    if (!newest) throw new Error(`[authoring] the pack has no ${machineName}`)
    const files = await readPart(resolve(dir, `${newest.folder}.h5p`), newest.folder)
    const library = files.get('library.json')
    const semantics = files.get('semantics.json')
    if (!library || !Array.isArray(semantics)) throw new Error(`[authoring] ${newest.folder} has no library.json or semantics.json`)
    const translations = {}
    for (const language of AUTHORING_TRANSLATIONS) {
      const translation = files.get(`language/${language}.json`)?.semantics
      if (Array.isArray(translation)) translations[language] = translation
    }
    libraries.push({ folder: newest.folder, library: Object.fromEntries(LIBRARY_FIELDS.map((field) => [field, library[field]])), semantics, translations })
  }
  return { libraries }
}

/** A part's JSON files under its folder, by their path in it. */
async function readPart(path, folder) {
  const reader = new ZipReader(new BlobReader(await openAsBlob(path)))
  const files = new Map()
  try {
    for (const entry of await reader.getEntries()) {
      if (!entry.filename.startsWith(`${folder}/`) || !entry.filename.endsWith('.json') || !entry.getData) continue
      const text = new TextDecoder().decode(await entry.getData(new Uint8ArrayWriter()))
      files.set(entry.filename.slice(folder.length + 1), JSON.parse(text))
    }
  } finally {
    await reader.close()
  }
  return files
}

const ID = 'virtual:h5p-authoring-pack'

/** `import pack from 'virtual:h5p-authoring-pack'`: `readAuthoringPack()` as a module, for the app. */
export function authoringPackPlugin() {
  return {
    name: 'h5p-authoring-pack',
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load: async (id) => (id === `\0${ID}` ? `export default ${JSON.stringify(await readAuthoringPack())}` : null)
  }
}
