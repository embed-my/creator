/**
 * A translation is not an edit like the others. It concerns every field, and it changes the
 * content's language, which is structure: so code runs it, and the model only translates.
 *
 * 1. `translationIntent`: a short question of its own — does the teacher ask for the activity in
 *    another language, and which? Asked before anything else, in a session of its own.
 * 2. `translateContent`: the content's text fields in batches small enough for the window, every
 *    id of a batch required by the schema, so no field is left out; each answer checked against
 *    the fields' formats like any edit, with one second try for what was refused.
 *
 * The caller then relabels the content type's own words into the new language
 * (`edit/language.js`) and says so in `h5p.json`. Chrome's model on 2026-10-20, asked to
 * "translate everything" as an ordinary edit, translated part of the content and did not say the
 * language had changed; the buttons stayed in the old one.
 *
 * Both take the model (`model/nano.js` or another with the same interface), not the browser.
 */

import { LANGUAGES } from '../authoring.js'
import { lineFor } from '../semantics/outline.js'
import { applyChanges } from './operations.js'
import { INTENT_SCHEMA, INTENT_SYSTEM, LOOSE_INTENT_SCHEMA, LOOSE_TRANSLATE_SCHEMA, fixPrompt, intentPrompt, translatePrompt, translateSchema, translateSystem } from './prompt.js'

/** How much of the content goes in one translation prompt: the window is small. */
export const BATCH_CHARACTERS = 1200
export const BATCH_FIELDS = 12

/**
 * The language the teacher asks the whole activity in, or `null` for any other request.
 * @param {{ session: Function }} model
 * @param {{ message: string, language: string, signal?: AbortSignal, onDownload?: (loaded: number) => void }} request
 */
export async function translationIntent(model, { message, language, signal, onDownload }) {
  const session = await model.session({ system: INTENT_SYSTEM, language: 'en', outputs: [language], signal, onDownload })
  try {
    const { answer } = await prompt(session, intentPrompt(message, language), INTENT_SCHEMA, LOOSE_INTENT_SCHEMA, signal)
    const to = parseJson(answer)?.translateTo
    return typeof to === 'string' && to in LANGUAGES && to !== language ? to : null
  } finally {
    session.destroy()
  }
}

/**
 * The text fields' ids in batches: in the outline's order, at most `BATCH_FIELDS` fields and
 * about `BATCH_CHARACTERS` of their lines each, a longer field alone.
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId
 */
export function batches(byId, { characters = BATCH_CHARACTERS, fields = BATCH_FIELDS } = {}) {
  const out = []
  let batch = []
  let size = 0
  for (const [id, node] of byId) {
    if (node.kind !== 'text') continue
    const length = lineFor(id, node).length
    if (batch.length && (batch.length >= fields || size + length > characters)) {
      out.push(batch)
      batch = []
      size = 0
    }
    batch.push(id)
    size += length
  }
  if (batch.length) out.push(batch)
  return out
}

/**
 * The content's text fields translated, batch by batch.
 * @param {{ session: Function }} model
 * @param {{ params: any, byId: Map<string, import('../semantics/content-model.js').Node>, from: string, to: string, signal?: AbortSignal, onBatch?: (done: number, total: number) => void }} request
 */
export async function translateContent(model, { params, byId, from, to, signal, onBatch }) {
  const session = await model.session({ system: translateSystem(from, to), language: from, outputs: [to], signal })
  let current = params
  const applied = []
  let violations = []
  let formatBreaks = 0
  let tries = 0
  let schema = 'strict'
  /** The raw answers, in order, for whoever judges them. */
  const answers = []
  const parts = batches(byId)
  try {
    for (const [index, ids] of parts.entries()) {
      onBatch?.(index, parts.length)
      const lines = ids.map((id) => lineFor(id, /** @type {any} */ (byId.get(id)))).join('\n')
      const first = await prompt(session, translatePrompt(lines, to), translateSchema(byId, ids), LOOSE_TRANSLATE_SCHEMA, signal)
      tries++
      answers.push(first.answer)
      if (first.schema !== 'strict') schema = first.schema
      const changes = parseJson(first.answer)?.changes
      let result = applyChanges(current, changes, byId)
      // Not in the answer at all, where the loose schema let a field be left out. A field given
      // back unchanged — a name that reads the same in both languages — is not missing.
      const answered = new Set(changes && typeof changes === 'object' ? Object.keys(changes) : [])
      const missing = ids.filter((id) => !answered.has(id))
      formatBreaks += result.violations.filter((violation) => violation.kind === 'format').length
      if (result.violations.length) {
        const again = result.violations.map((violation) => violation.id).filter((id) => byId.has(id))
        const second = await prompt(session, fixPrompt(result.violations), translateSchema(byId, again), LOOSE_TRANSLATE_SCHEMA, signal)
        tries++
        answers.push(second.answer)
        const retried = applyChanges(result.params, parseJson(second.answer)?.changes, byId)
        result = { params: retried.params, applied: [...result.applied, ...retried.applied], violations: retried.violations }
      }
      current = result.params
      applied.push(...result.applied)
      violations = [...violations, ...result.violations]
      // A field the answer left out: said, not hidden.
      for (const id of missing) if (!result.applied.some((change) => change.id === id)) violations.push({ id, label: byId.get(id)?.label ?? '', kind: 'value', problem: 'Left out of the translation.' })
    }
    onBatch?.(parts.length, parts.length)
    return { params: current, applied, violations, formatBreaks, batches: parts.length, tries, schema, answers, quota: session.quota() }
  } finally {
    session.destroy()
  }
}

/** Asks with the full schema; where the browser's model refuses it, with the loose one, and says which. */
async function prompt(session, text, schema, loose, signal) {
  try {
    return { answer: await session.prompt(text, { schema, omitSchema: true, signal }), schema: 'strict' }
  } catch (error) {
    if (error?.name !== 'NotSupportedError' && error?.name !== 'TypeError' && error?.name !== 'SyntaxError') throw error
    return { answer: await session.prompt(text, { schema: loose, omitSchema: true, signal }), schema: `loose (${error.name}: ${error.message})` }
  }
}

function parseJson(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}
