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
 * An empty slot and a setting carry H5P's description of the field, in parentheses after its
 * label: their labels alone do not tell them apart. A tip, a message when the answer is chosen
 * and one when it is not are three empty slots side by side, and a quiz's pass percentage and
 * each question's share a label though only the quiz's counts. The author's words need no note:
 * the value says what the field is.
 *
 *   t1 Title [html: strong em sub sup code]: "The water cycle"
 *   Question 1 (Multiple Choice)
 *   t2   Question [html: strong em sub sup code]: "What drives evaporation?"
 *     Option 1
 *   t3     Text [html: strong em sub sup code]: "The sun"
 *   s1     Correct [true/false]: true
 *   t4     Feedback on wrong answer [text]: "Gravity pulls it down."
 *   t5     Tip text (Hint for the user. This will appear before user checks his answer/answers.) [html: strong em code]: ""
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

/** One field's line: its id, its label, a note for an empty slot or a setting, its format and its value. */
export function lineFor(id, node, indent = '') {
  const about = node.empty || !node.content ? note(node.field) : ''
  return `${id} ${indent}${node.label}${about ? ` (${about})` : ''} [${formatHint(node)}]: ${shown(node)}`
}

/**
 * What H5P says a field is for: its description without markup, as many whole sentences as fit
 * in about a line, and the first one at least — "This setting often won't have any effect."
 */
export function note(field) {
  const text = String(field?.description ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let said = ''
  for (const sentence of text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []) {
    if (said && said.length + sentence.length > 120) break
    said += sentence
  }
  said = said.trim()
  return said.length > 200 ? `${said.slice(0, 199)}…` : said
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
