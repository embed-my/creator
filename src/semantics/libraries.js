/**
 * The libraries the editor reads content with: loaded as h5p-author's build loads them — the
 * newest of each major the source has, the content's interface texts in its language, its plain
 * text defaults escaped as H5P saves them — and then, as H5P's editor shows a form to an author
 * who works in that language, each library's own translation laid over the labels and
 * descriptions too, so German content reads with H5P's German labels. Only the words the model
 * reads change: a default stays the loader's, which the content model compares the content with.
 *
 * Pure but for the source of the libraries, which is handed in: the pack h5p-author's `openPack`
 * opens, or the one `packageLibraries` makes of a package's own folders with the pack behind them.
 */

import { loadLibraries } from '@missing-elements/h5p-author/core'

/**
 * @param {import('@missing-elements/h5p-author/core').LibrarySource} source
 * @param {{ type: string, language: string, params?: unknown }} content
 */
export async function editorLibraries(source, content) {
  const loaded = await loadLibraries(source, content)
  const language = content.language.toLowerCase()
  const entries = new Map()
  for (const [folder, entry] of loaded.entries) {
    const record = entry.semantics ? source.libraries.find((each) => each.folder === folder) : undefined
    if (!record) {
      entries.set(folder, entry)
      continue
    }
    const part = await source.open(record)
    const name = [language, language.split('-')[0]].find((each) => part.translations.includes(each))
    entries.set(folder, name ? { ...entry, semantics: labelled(entry.semantics, await source.translation(part, name)) } : entry)
  }
  return { ...loaded, entries, main: entries.get(loaded.main.folder) ?? loaded.main }
}

/**
 * A translation laid over semantics as H5P's editor lays `language/<code>.json` over
 * `semantics.json` — item by item in a list, key by key in an object, a translated value in place
 * of the one it translates — but for the defaults, which are the loader's.
 */
export function labelled(base, translation) {
  if (translation === undefined || translation === null) return base
  if (Array.isArray(base)) return base.map((item, index) => labelled(item, Array.isArray(translation) ? translation[index] : undefined))
  if (isObject(base)) {
    if (!isObject(translation)) return base
    const out = { ...base }
    for (const [key, value] of Object.entries(translation)) if (key !== 'default') out[key] = key in base ? labelled(base[key], value) : value
    return out
  }
  // A translation of a value is another value of its kind; anything else is left as it was.
  return typeof translation === typeof base ? translation : base
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
