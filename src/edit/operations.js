/**
 * The model's edits applied to the content: `set` operations, each naming a field by its
 * outline id and giving its complete new value as text. Code reads the text as the field's
 * kind — markup through the field's dialect, yes/no, a number in range, one of the choices —
 * and refuses what the field refuses, with the reason, so the model can be asked once more.
 * The parameters are not changed; a copy comes back with the applied edits.
 */

import { escapeHtml } from '../authoring.js'
import { toHtml } from '../semantics/dialects.js'

const YES = new Set(['yes', 'true', 'on', '1'])
const NO = new Set(['no', 'false', 'off', '0'])

/**
 * @param {any} params
 * @param {{ id: string, value: string }[]} ops
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId the outline's ids
 * @returns {{ params: any, applied: { id: string, label: string, from: any, to: any }[], violations: { id: string, problem: string }[] }}
 */
export function applyOps(params, ops, byId) {
  const next = structuredClone(params)
  const applied = []
  const violations = []
  for (const op of Array.isArray(ops) ? ops : []) {
    const id = String(op?.id ?? '')
    const node = byId.get(id)
    if (!node) {
      violations.push({ id, problem: 'There is no field with this id.' })
      continue
    }
    const given = typeof op.value === 'string' ? op.value : String(op.value ?? '')
    const read = parse(node, given)
    if ('problem' in read) {
      violations.push({ id, problem: read.problem })
      continue
    }
    if (read.value === node.value) continue
    setAt(next, node.path, read.value)
    if (node.titleOf) {
      const sub = getAt(next, node.titleOf)
      if (sub?.metadata) sub.metadata.title = escapeHtml(given.length > 60 ? `${given.slice(0, 59)}…` : given)
    }
    applied.push({ id, label: node.label, from: node.value, to: read.value })
  }
  return { params: next, applied, violations }
}

/** @returns {{ value: any } | { problem: string }} */
function parse(node, text) {
  const { field } = node
  const trimmed = text.trim()
  switch (node.kind) {
    case 'text': {
      if (!trimmed) return { problem: 'The text is empty.' }
      if (field.maxLength && trimmed.length > field.maxLength) return { problem: `At most ${field.maxLength} characters.` }
      if (node.dialect === 'blanks' && !/\*[^*]+\*/.test(trimmed)) return { problem: 'The answer must stay between asterisks, like *this*.' }
      return { value: node.html ? toHtml(trimmed, { tags: field.tags, dialect: node.dialect, previous: node.value }) : toHtml(trimmed) }
    }
    case 'boolean': {
      const word = trimmed.toLowerCase()
      if (YES.has(word)) return { value: true }
      if (NO.has(word)) return { value: false }
      return { problem: 'Answer yes or no.' }
    }
    case 'number': {
      const number = Number(trimmed)
      if (!trimmed || !Number.isFinite(number)) return { problem: 'Not a number.' }
      if (field.min !== undefined && number < field.min) return { problem: `At least ${field.min}.` }
      if (field.max !== undefined && number > field.max) return { problem: `At most ${field.max}.` }
      if (!field.decimals && !Number.isInteger(number)) return { problem: 'A whole number.' }
      return { value: number }
    }
    case 'select': {
      const word = trimmed.toLowerCase()
      const option = (field.options ?? []).find((each) => String(each.value).toLowerCase() === word || String(each.label ?? '').toLowerCase() === word)
      return option ? { value: option.value } : { problem: `One of: ${(field.options ?? []).map((each) => each.value).join(', ')}.` }
    }
    default:
      return { problem: 'This field cannot be changed.' }
  }
}

function getAt(object, path) {
  return path.reduce((value, key) => value?.[key], object)
}

function setAt(object, path, value) {
  const parent = getAt(object, path.slice(0, -1))
  if (parent && typeof parent === 'object') parent[path[path.length - 1]] = value
}
