/**
 * The outline the model reads: one line per field the turn may change, with an id that is good
 * for this turn only, the field's label in H5P's words, its format in brackets, and its value —
 * a text in quotation marks, as the answer's JSON writes it, so where the line's description
 * ends and the value begins is never in doubt. The format is where the model learns, field by
 * field, whether it may write HTML and which tags (`semantics/dialects.js`); the system prompt
 * says what each format means. Settings — the true/false, number and choice fields outside list
 * items — are left out unless asked for, since most turns are about words and the window is
 * small. Empty slots — an answer's feedback or tip not written yet — are left out too, unless a
 * turn asks for them (`empty`), as one that asks for feedback on every answer does.
 *
 *   t1 Title [html: strong em sub sup code]: "The water cycle"
 *   Question 1 (Multiple Choice)
 *   t2   Question [html: strong em sub sup code]: "What drives evaporation?"
 *     Option 1
 *   t3     Text [html: strong em sub sup code]: "The sun"
 *   s1     Correct [true/false]: true
 *   t4     Feedback on wrong answer [text]: "Gravity pulls it down."
 */

import { describeFormat } from './dialects.js'

/**
 * @param {import('./content-model.js').Node[]} nodes
 * @param {{ settings?: boolean, empty?: boolean }} [options]
 * @returns {{ text: string, byId: Map<string, import('./content-model.js').Node> }}
 */
export function outline(nodes, { settings = false, empty = false } = {}) {
  const lines = []
  const byId = new Map()
  let texts = 0
  let values = 0
  for (const node of nodes) {
    const indent = '  '.repeat(node.depth)
    if (node.kind === 'item') {
      lines.push(`${indent}${node.label}`)
      continue
    }
    if (!node.content && !settings) continue
    if (node.empty && !empty) continue
    const id = node.kind === 'text' ? `t${++texts}` : `s${++values}`
    byId.set(id, node)
    lines.push(lineFor(id, node, indent))
  }
  return { text: lines.join('\n'), byId }
}

/** One field's line: its id, its label, its format and its value. */
export function lineFor(id, node, indent = '') {
  return `${id} ${indent}${node.label} [${formatHint(node)}]: ${shown(node)}`
}

/** What a field takes: its text format, or the kind of value, as the answer's schema has it. */
export function formatHint(node) {
  const { field } = node
  switch (node.kind) {
    case 'text':
      return describeFormat(node.format)
    case 'boolean':
      return 'true/false'
    case 'select':
      return (field.options ?? []).map((option) => option.value).join('/')
    case 'number':
      return `number${field.min !== undefined || field.max !== undefined ? ` ${field.min ?? ''}-${field.max ?? ''}` : ''}`
    default:
      return ''
  }
}

/** A text as a JSON string, the way the answer gives it back; any other value as it is. */
function shown(node) {
  return node.kind === 'text' ? JSON.stringify(node.text) : String(node.value)
}
