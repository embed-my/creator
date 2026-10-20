/**
 * The model's edits applied to the content: `changes`, an object from outline ids to complete
 * new values. Code reads each value as its field's kind — text in the field's format (where it
 * may hold HTML, and which tags), true or false, a number in range, one of the choices — and
 * refuses what the field refuses, with the rule restated, so the model can be asked once more.
 * Nothing that breaks a format is cleaned and applied: it is refused, and the refusal says why.
 * The parameters are not changed; a copy comes back with the applied edits.
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
    applied.push({ id, label: node.label, from: node.value, to: read.value })
  }
  return { params: next, applied, violations }
}

/** @returns {{ value: any } | { problem: string, kind: 'format' | 'value' }} */
function parse(node, given) {
  const { field } = node
  switch (node.kind) {
    case 'text': {
      const checked = checkModelText(given, node.format)
      if ('problem' in checked) return { problem: checked.problem, kind: 'format' }
      if (field.maxLength && checked.text.length > field.maxLength) return { problem: `At most ${field.maxLength} characters.`, kind: 'value' }
      return { value: toHtml(checked.text, node.format, node.value) }
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

function setAt(object, path, value) {
  const parent = getAt(object, path.slice(0, -1))
  if (parent && typeof parent === 'object') parent[path[path.length - 1]] = value
}
