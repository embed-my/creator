/**
 * The model's edits applied to the content: `changes`, an object from outline ids to complete
 * new values. Code reads each value as its field's kind — text in the field's format (where it
 * may hold HTML, and which tags), true or false, a number in range, one of the choices — and
 * refuses what the field refuses, with the rule restated, so the model can be asked once more.
 * Nothing that breaks a format is cleaned and applied: it is refused, and the refusal says why.
 * The parameters are not changed; a copy comes back with the applied edits.
 *
 * Code also says what a turn changed (`changeNote`), since a model's reply can claim a change
 * it did not make, and finds feedback a changed answer left behind (`staleFeedback`), which the
 * second try asks about with the refusals.
 */

import { checkModelText, escapeHtml, stripMarkup, toHtml } from '../semantics/dialects.js'
import { formatHint } from '../semantics/outline.js'

/**
 * @typedef {{ id: string, label: string, kind: 'id' | 'format' | 'value', problem: string }} Violation
 *   `format`: text that broke its field's format (where HTML may go); `value`: a value outside
 *   what the field takes; `id`: no such field
 */

/**
 * @param {any} params
 * @param {Record<string, unknown> | null | undefined} changes
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId the outline's ids
 * @returns {{ params: any, applied: { id: string, label: string, from: any, to: any }[], violations: Violation[] }}
 */
export function applyChanges(params, changes, byId) {
  const next = structuredClone(params)
  const applied = []
  /** @type {Violation[]} */
  const violations = []
  const entries = changes && typeof changes === 'object' && !Array.isArray(changes) ? Object.entries(changes) : []
  for (const [id, given] of entries) {
    const node = byId.get(id)
    if (!node) {
      violations.push({ id, label: '', kind: 'id', problem: 'There is no field with this id.' })
      continue
    }
    const read = parse(node, given)
    if ('problem' in read) {
      violations.push({ id, label: `${node.label} [${formatHint(node)}]`, kind: read.kind, problem: read.problem })
      continue
    }
    if (read.value === node.value) continue
    setAt(next, node.path, read.value)
    if (node.titleOf) {
      const sub = getAt(next, node.titleOf)
      // The title the editor writes is the question as one line of text, without its tags.
      const title = stripMarkup(read.value).replace(/\s+/g, ' ')
      if (sub?.metadata) sub.metadata.title = escapeHtml(title.length > 60 ? `${title.slice(0, 59)}…` : title)
    }
    applied.push({ id, label: node.label, from: node.value ?? '', to: read.value })
  }
  return { params: next, applied, violations }
}

/**
 * What a turn changed, said by code beside the model's reply: "Nothing changed.", "Changed 3 of
 * 20 text fields." A reply said "I translated all …" over a title alone.
 * @param {{ id: string }[]} applied
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId
 */
export function changeNote(applied, byId) {
  if (!applied.length) return 'Nothing changed.'
  const nodes = [...byId.values()]
  const texts = applied.filter((change) => byId.get(change.id)?.kind === 'text').length
  const parts = []
  if (texts) parts.push(`${texts} of ${nodes.filter((node) => node.kind === 'text').length} text fields`)
  if (applied.length > texts) parts.push(`${applied.length - texts} of ${nodes.filter((node) => node.kind !== 'text').length} other fields`)
  return `Changed ${parts.join(' and ')}.`
}

/** An answer's feedback and its tip: what is said about the answer, beside it in its list item. */
const FEEDBACK = /feedback|^tip$/i
const isFeedback = (node) => FEEDBACK.test(String(node.path.at(-1)))
const sameItem = (node, other) => Boolean(node.item && other.item) && node.item.join('.') === other.item.join('.')

/**
 * Feedback a turn left behind: where an answer's words changed and the feedback beside it, which
 * has words, did not — "The moon moves tides, not vapour." under an answer now reading
 * "Gravity". The second try asks about each, with the answer as it now reads and whether it is
 * right or wrong: told only the answer, a model wrote "Pressure changes … drive evaporation."
 * under the wrong answer "Atmospheric pressure". The model writes it again, or leaves it out
 * where it still fits. A changed Correct is no reason: which answer is right can change while
 * what is said about each answer stays true.
 * @param {{ id: string, to: any }[]} applied
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId
 * @returns {{ id: string, label: string, problem: string }[]}
 */
export function staleFeedback(applied, byId) {
  const changed = new Set(applied.map((change) => change.id))
  const stale = new Map()
  for (const change of applied) {
    const answer = byId.get(change.id)
    if (answer?.kind !== 'text' || !answer.item || isFeedback(answer)) continue
    const correct = [...byId.values()].find((node) => node.kind === 'boolean' && String(node.path.at(-1)) === 'correct' && sameItem(node, answer))
    const which = correct === undefined ? '' : correct.value ? ' (the right answer)' : ' (a wrong answer)'
    const why = correct === undefined ? 'to fit that answer' : `so it says why that answer is ${correct.value ? 'right' : 'wrong'}`
    for (const [id, other] of byId) {
      if (changed.has(id) || stale.has(id) || other.kind !== 'text' || other.empty || !isFeedback(other) || !sameItem(answer, other)) continue
      const now = stripMarkup(String(change.to)).replace(/\s+/g, ' ').trim()
      stale.set(id, { id, label: `${other.label} [${formatHint(other)}]`, problem: `It still says "${other.text}", but the answer it belongs to now reads "${now}"${which}. Write it again ${why}, or leave it out if it still fits.` })
    }
  }
  return [...stale.values()]
}

/**
 * A value that repeats the outline line round it: an id, the field's format in brackets, a
 * quotation mark at each end. The model was asked for the value alone.
 */
const ECHO = /^\s*(?:[ts]\d+\b|[^"\n]{0,80}\[(?:text|html:[^\]\n]*)(?:;[^\]\n]*)?\])/

/** @returns {{ value: any } | { problem: string, kind: 'format' | 'value' }} */
function parse(node, given) {
  const { field } = node
  switch (node.kind) {
    case 'text': {
      const raw = String(given ?? '')
      // An empty slot left empty is no change.
      if (node.empty && !raw.trim()) return { value: node.value }
      const quoted = /^\s*["“„«].*["”»]\s*$/s.test(raw) && !/^["“„«]/.test(node.text ?? '')
      if (ECHO.test(raw) || quoted) {
        return { problem: 'Write only the new text: not the id, the field\'s name or its format in brackets, and no quotation marks round it.', kind: 'format' }
      }
      const checked = checkModelText(given, node.format)
      if ('problem' in checked) return { problem: checked.problem, kind: 'format' }
      if (field.maxLength && checked.text.length > field.maxLength) return { problem: `At most ${field.maxLength} characters.`, kind: 'value' }
      return { value: toHtml(checked.text, node.format, node.value || wrapper(field)) }
    }
    case 'boolean': {
      if (typeof given === 'boolean') return { value: given }
      const word = String(given ?? '').trim().toLowerCase()
      if (word === 'true' || word === 'yes') return { value: true }
      if (word === 'false' || word === 'no') return { value: false }
      return { problem: 'Answer true or false.', kind: 'value' }
    }
    case 'number': {
      const number = typeof given === 'number' ? given : Number(String(given ?? '').trim())
      if (!Number.isFinite(number) || String(given ?? '').trim() === '') return { problem: 'Not a number.', kind: 'value' }
      if (field.min !== undefined && number < field.min) return { problem: `At least ${field.min}.`, kind: 'value' }
      if (field.max !== undefined && number > field.max) return { problem: `At most ${field.max}.`, kind: 'value' }
      if (!field.decimals && !Number.isInteger(number)) return { problem: 'A whole number.', kind: 'value' }
      return { value: number }
    }
    case 'select': {
      const word = String(given ?? '').trim().toLowerCase()
      const option = (field.options ?? []).find((each) => String(each.value).toLowerCase() === word)
      return option ? { value: option.value } : { problem: `One of: ${(field.options ?? []).map((each) => each.value).join(', ')}.`, kind: 'value' }
    }
    default:
      return { problem: 'This field cannot be changed.', kind: 'value' }
  }
}

function getAt(object, path) {
  return path.reduce((value, key) => value?.[key], object)
}

/** Sets the value, making the groups on the way where an empty slot had none, as the editor saves them. */
function setAt(object, path, value) {
  let parent = object
  for (const key of path.slice(0, -1)) {
    if (parent[key] === undefined && typeof key === 'string') parent[key] = {}
    parent = parent[key]
    if (!parent || typeof parent !== 'object') return
  }
  parent[path[path.length - 1]] = value
}

/**
 * How H5P's editor wraps a rich text field's paragraphs where there is no previous value to follow:
 * in `<p>` where the semantics say `enterMode: "p"`, else in `<div>`.
 */
function wrapper(field) {
  if (field.widget !== 'html' && !Array.isArray(field.tags)) return ''
  return field.enterMode === 'p' ? '<p>' : '<div>'
}
