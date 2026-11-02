#!/usr/bin/env node
/**
 * The agent toolset's editing commands: what a teacher's own coding agent runs to change an
 * existing package by its fields, beside h5p-author, which creates one, and H5P Preview, which
 * plays one. No model inside; the agent is the model. The pipeline is `src/edit/package-edit.js`,
 * the app's editing spine; this file reads the arguments and the files, and prints.
 *
 * `outline` prints the content's fields, one per line: an id, the field's label in H5P's words, its
 * format and its value. `apply` reads `{ "revision": "…", "changes": { "t3": "new text" } }` and
 * either writes the package with those fields changed and nothing else, never over a file, or
 * writes nothing and says by id what it refused: a value its field does not take, or content
 * h5p-author's build would not write. The libraries are the package's own, then the pack
 * h5p-author pins. Exit status: 0 written or nothing to change, 1 refused, 2 not run.
 */

import { existsSync, openAsBlob } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { openPack } from '@missing-elements/h5p-author'
import { editContent, openForEdit, outlineOf, pathOf } from '../src/edit/package-edit.js'
import { rewritePackage } from '../src/package/rewrite.js'
import { toModel } from '../src/semantics/dialects.js'
import { formatHint } from '../src/semantics/outline.js'

const USAGE = `Change an H5P package's text and settings by its fields' ids.

  h5p-edit outline <file.h5p> [--settings] [--empty] [--json]
  h5p-edit apply <file.h5p> <changes.json | -> <out.h5p> [--json]

outline prints one line per field: its id, its label, its format and its value.
  t3 Text [html: strong em]: "The sun"
  --settings adds the settings: true/false, numbers and choices outside list items.
  --empty adds empty fields an author could fill, such as an answer's feedback.
  A field's id is the same whatever is shown.

apply takes the changes as JSON, from a file, or - for standard input:
  { "revision": "<from outline>", "changes": { "t3": "The Sun", "s1": false } }
  Each value is the field's complete new value, in its format:
  [text]                 plain text, no HTML
  [html: strong em ...]  text in which only the tags listed may mark words; no <p>, <br>
                         or attributes: an empty line starts a new paragraph
  [...; blank: *word*]   the word between asterisks is the blank
  [true/false], [a/b/c], [number 0-100]
  It writes <out.h5p>, never over a file, with those fields changed and nothing else, or
  writes nothing and says by id what it refused.`

let parsed
try {
  parsed = parseArgs({ allowPositionals: true, options: { settings: { type: 'boolean' }, empty: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
} catch (error) {
  stop(`${error.message}\n\n${USAGE}`)
}
const { values: flags, positionals } = parsed
const [command, ...args] = positionals

if (flags.help) console.log(USAGE)
else if (command === 'outline' && args.length === 1) await run(() => outlineCommand(args[0]))
else if (command === 'apply' && args.length === 3) await run(() => applyCommand(args[0], args[1], args[2]))
else stop(USAGE)

async function outlineCommand(/** @type {string} */ file) {
  await withPack(async (pack) => {
    const opened = await openForEdit(await openAsBlob(file), pack)
    const { text, byId } = outlineOf(opened, { settings: flags.settings, empty: flags.empty })
    const title = opened.manifest.title ?? ''
    if (flags.json) {
      const fields = [...byId].map(([id, node]) => ({ id, label: node.label, format: formatHint(node), value: node.kind === 'text' ? node.text : node.value, path: pathOf(node.path), ...(node.empty ? { empty: true } : {}), ...(node.content ? {} : { setting: true }) }))
      return console.log(JSON.stringify({ type: opened.mainLibrary, title, language: opened.language, revision: opened.revision, fields }, null, 2))
    }
    console.log(`${opened.mainLibrary} · ${JSON.stringify(title)} · ${opened.language} · revision ${opened.revision}`)
    console.log(text || 'No fields to edit.')
    const hidden = [flags.settings ? '' : 'settings (--settings)', flags.empty ? '' : 'empty fields (--empty)'].filter(Boolean)
    if (hidden.length) console.log(`\nNot shown: ${hidden.join(', ')}.`)
  })
}

async function applyCommand(/** @type {string} */ file, /** @type {string} */ changesFile, /** @type {string} */ out) {
  if (existsSync(out)) return refuse(`${out} is there already: give the package a new name.`)
  let request
  try {
    request = JSON.parse(changesFile === '-' ? await standardInput() : await readFile(changesFile, 'utf8'))
  } catch (error) {
    stop(`The changes could not be read as JSON: ${/** @type {Error} */ (error).message}`)
  }
  if (!isObject(request) || !isObject(request.changes)) stop('The changes are JSON: { "revision": "…", "changes": { "t3": "new text" } }.')

  await withPack(async (pack) => {
    const source = await openAsBlob(file)
    const opened = await openForEdit(source, pack)
    if (request.revision !== undefined && request.revision !== opened.revision) {
      return refuse(`${file} is not the package outlined: its revision is ${opened.revision}, the outline's ${request.revision}. Outline it again.`)
    }
    const result = editContent(opened, request.changes)
    const refused = result.violations.length > 0 || result.problems.length > 0
    let written = null
    if (!refused && result.applied.length) {
      const blob = await rewritePackage(source, { params: result.params })
      await writeFile(out, new Uint8Array(await blob.arrayBuffer()), { flag: 'wx' })
      written = out
    }
    const applied = result.applied.map(({ id, label, to }) => {
      const node = result.byId.get(id)
      return { id, label, value: node?.kind === 'text' ? toModel(to, node.format) : to }
    })
    if (flags.json) {
      const { violations, problems, notes, stale, note, known } = result
      console.log(JSON.stringify({ written, note: refused ? null : note, applied: refused ? [] : applied, violations, problems, notes, stale, known }, null, 2))
    } else if (refused) {
      if (result.violations.length) say('Nothing written. These changes could not be used:', result.violations.map(({ id, label, problem }) => `${id}${label ? ` ${label}` : ''}: ${problem}`))
      if (result.problems.length) say(`${result.violations.length ? '' : 'Nothing written. '}H5P would not take the content so changed:`, result.problems.map(located(result.byId)))
    } else if (!written) {
      console.log('Nothing changed; nothing written.')
    } else {
      say(result.note, applied.map(({ id, label, value }) => `${id} ${label}: ${JSON.stringify(value)}`))
      if (result.stale.length) say('Feedback that may no longer fit the answer it belongs to:', result.stale.map(({ id, label, problem }) => `${id} ${label}: ${problem}`))
      if (result.notes.length) say('Notes:', result.notes.map(located(result.byId)))
      if (result.known) console.log(`The package already held ${result.known} problem${result.known === 1 ? '' : 's'} its editor let through; ${result.known === 1 ? 'it is' : 'they are'} as before.`)
      console.log(`Wrote ${written}. Outline it before changing it again.`)
    }
    if (refused) process.exitCode = 1
  })
}

/** A problem by the field it is in, or by its path where it is in none the outline names. */
function located(/** @type {Map<string, any>} */ byId) {
  return (/** @type {{ id?: string, path: string, message: string }} */ { id, path, message }) => (id ? `${id} ${byId.get(id)?.label ?? ''}: ${message}` : `${path}: ${message}`)
}

/** Runs a command with the pack h5p-author pins, closed when it is done. */
async function withPack(/** @type {(pack: any) => Promise<void>} */ use) {
  const pack = await openPack()
  try {
    await use(pack)
  } finally {
    await pack.close()
  }
}

async function run(/** @type {() => Promise<void>} */ command) {
  try {
    await command()
  } catch (error) {
    const problems = /** @type {any} */ (error).problems
    stop(Array.isArray(problems) ? problems.map((each) => `${each.path}: ${each.message}`).join('\n') : /** @type {Error} */ (error).message)
  }
}

function say(/** @type {string} */ heading, /** @type {string[]} */ lines) {
  console.log([heading, ...lines.map((line) => `- ${line}`)].join('\n'))
}

function refuse(/** @type {string} */ message) {
  console.log(message)
  process.exitCode = 1
}

/** @returns {never} */
function stop(/** @type {string} */ message) {
  console.error(message)
  process.exit(2)
}

async function standardInput() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function isObject(/** @type {unknown} */ value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
