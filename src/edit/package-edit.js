/**
 * Editing a package by its fields' ids, as the agent toolset's commands do (`toolset/h5p-edit.mjs`):
 * the package read, its libraries loaded as h5p-author's build loads them — the package's own where
 * it carries a major of a library, the pack's where it does not, the semantics in the content's
 * language (`semantics/libraries.js`) — its content walked into the outline, changes applied with each field's checks
 * (`operations.js`), and the result checked as the build checks what it writes (`checkContent`).
 * Nothing is rebuilt: every value no change names, every sub-content id and every file stays as it
 * was, so the package is what its author saved, with those fields changed.
 *
 * The outline's ids are stable: a field keeps its id whether a call shows it or not, so `apply`
 * takes the ids an `outline` printed with any options. The revision, from a hash of the package's
 * two JSON files, ties them to the content they were read from.
 *
 * Pure but for zip.js and h5p-author's core: the file is a `Blob`, and the pack is handed in —
 * `openPack()` from `@missing-elements/h5p-author` in Node, from its `/browser` in a page.
 */

import { checkContent, packageLibraries } from '@missing-elements/h5p-author/core'
import { mainLibraryOf, openPackage } from '../package/read.js'
import { contentModel } from '../semantics/content-model.js'
import { editorLibraries } from '../semantics/libraries.js'
import { outline } from '../semantics/outline.js'
import { applyChanges, changeNote, staleFeedback } from './operations.js'

/**
 * @typedef {import('@missing-elements/h5p-author/core').LibrarySource} LibrarySource
 * @typedef {import('../semantics/content-model.js').Node} Node
 * @typedef {{ path: string, message: string, id?: string }} Problem `id` the field the path is in, where it is one
 * @typedef {Awaited<ReturnType<typeof openForEdit>>} Opened
 */

/**
 * A package read for editing.
 * @param {Blob} file
 * @param {LibrarySource} pack
 */
export async function openForEdit(file, pack) {
  const files = await openPackage(file)
  try {
    const manifestText = await files.read('h5p.json')
    const paramsText = await files.read('content/content.json')
    const manifest = JSON.parse(manifestText)
    const params = JSON.parse(paramsText)
    const mainLibrary = mainLibraryOf(manifest)
    if (!mainLibrary) throw new Error('h5p.json names no main library among its dependencies')
    const language = typeof manifest.language === 'string' && manifest.language !== 'und' ? manifest.language : 'en'
    const libraries = await editorLibraries(await packageLibraries(files, pack), { type: mainLibrary, language, params })
    const nodes = contentModel(params, mainLibrary, libraries.entries)
    return { manifest, params, mainLibrary, language, libraries, nodes, revision: await revisionOf(manifestText, paramsText) }
  } finally {
    await files.close()
  }
}

/**
 * The outline of a package read for editing, every field numbered whether it is shown or not:
 * `byId` holds them all.
 * @param {Opened} opened
 * @param {{ settings?: boolean, empty?: boolean }} [options]
 */
export function outlineOf(opened, { settings = false, empty = false } = {}) {
  return outline(opened.nodes, { settings, empty, stableIds: true })
}

/**
 * Changes applied to a package's content: each value read as its field takes it, and refused by id
 * and kind where it does not (`applyChanges`); then the content checked as h5p-author's build checks
 * what it writes. Only what the changes brought counts against them: a package often holds what
 * its own editor let an author save and the build would not — an empty alternative text, a key an
 * older editor wrote — and those are counted (`known`), not refused.
 * @param {Opened} opened
 * @param {Record<string, unknown> | null | undefined} changes by outline id, each a field's complete new value
 */
export function editContent(opened, changes) {
  const { byId } = outlineOf(opened, { settings: true, empty: true })
  const { params, applied, violations } = applyChanges(opened.params, changes, byId)
  const before = checkContent(opened.libraries, { type: opened.mainLibrary, params: opened.params })
  const after = applied.length ? checkContent(opened.libraries, { type: opened.mainLibrary, params }) : before
  const ids = new Map([...byId].map(([id, node]) => [pathOf(node.path), id]))
  /** @param {{ path: string, message: string }[]} known @param {{ path: string, message: string }[]} found */
  const brought = (known, found) => {
    const seen = new Set(known.map(key))
    return found.filter((each) => !seen.has(key(each))).map((each) => ({ ...each, id: idAt(ids, each.path) }))
  }
  return {
    params,
    applied,
    violations,
    /** @type {Problem[]} what H5P or the content type would not take, brought by the changes */
    problems: brought(before.problems, after.problems),
    /** @type {Problem[]} */
    notes: brought(before.notes, after.notes),
    stale: staleFeedback(applied, byId),
    note: changeNote(applied, byId),
    known: before.problems.length,
    byId
  }
}

/** A node's path as h5p-author's checks write one: `params.questions[0].params.question`. */
export function pathOf(/** @type {(string | number)[]} */ path) {
  return path.reduce((at, key) => (typeof key === 'number' ? `${at}[${key}]` : `${at}.${key}`), 'params')
}

/** The field a problem's path is in: the one at that path, or the nearest above it. */
function idAt(/** @type {Map<string, string>} */ ids, /** @type {string} */ path) {
  for (let at = path; ; ) {
    const id = ids.get(at)
    if (id) return id
    const shorter = at.replace(/(?:\.[^.[\]]+|\[\d+\])$/, '')
    if (shorter === at) return undefined
    at = shorter
  }
}

const key = (/** @type {{ path: string, message: string }} */ each) => `${each.path}\n${each.message}`

/** The revision of a package's content: the start of the SHA-256 of its two JSON files, as stored. */
async function revisionOf(/** @type {string} */ manifest, /** @type {string} */ params) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${manifest}\n${params}`)))
  return [...hash.subarray(0, 6)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
