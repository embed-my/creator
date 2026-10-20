/**
 * The outline the model reads: one line per field the turn may change, with an id that is
 * good for this turn only, the field's label in H5P's words, and its text. Settings — the
 * yes/no, number and choice fields outside list items — are left out unless asked for, since
 * most turns are about words and the window is small.
 *
 *   t1 Title: The water cycle
 *   Question 1 (Multiple Choice)
 *   t2   Question: What drives evaporation?
 *   Option 1
 *   t3     Text: The sun
 *   s1     Correct [yes/no]: yes
 */

/**
 * @param {import('./content-model.js').Node[]} nodes
 * @param {{ settings?: boolean }} [options]
 * @returns {{ text: string, byId: Map<string, import('./content-model.js').Node> }}
 */
export function outline(nodes, { settings = false } = {}) {
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
    const id = node.kind === 'text' ? `t${++texts}` : `s${++values}`
    byId.set(id, node)
    lines.push(`${id} ${indent}${node.label}${hint(node)}: ${shown(node)}`)
  }
  return { text: lines.join('\n'), byId }
}

/** What a non-text field takes, so the model answers in kind. */
function hint(node) {
  const { field } = node
  switch (node.kind) {
    case 'boolean':
      return ' [yes/no]'
    case 'select':
      return ` [${(field.options ?? []).map((option) => option.value).join('/')}]`
    case 'number':
      return ` [number${field.min !== undefined || field.max !== undefined ? ` ${field.min ?? ''}-${field.max ?? ''}` : ''}]`
    default:
      return ''
  }
}

function shown(node) {
  switch (node.kind) {
    case 'text':
      return node.text
    case 'boolean':
      return node.value ? 'yes' : 'no'
    default:
      return String(node.value)
  }
}
