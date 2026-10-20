/**
 * What the model is told for an edit, in one place each:
 *
 * - The system prompt, once per session: the task, what each format in the outline means —
 *   where HTML may go and which tags, where it may not — and the shape of the answer.
 * - The turn: the outline, every line naming its field's format, and the teacher's words.
 * - The schema (`editSchema`), per turn: the answer's shape with the outline's ids as the only
 *   keys and each value's type, so a wrong id or a "maybe" for a true/false field cannot be
 *   written. It is not sent to the model as text (`omitSchema`): the system prompt already says
 *   it in words, and the window is small.
 *
 * The chat's history is not sent: the content as it stands is the history.
 */

import { LANGUAGES } from '../authoring.js'

const STRING = { type: 'string' }

export function editSystem(language = 'en') {
  return [
    'You edit a learning activity for a teacher.',
    'The activity is a list of fields, one per line: an id, the field\'s name, its format in square brackets, and its current value.',
    '',
    'What each format allows:',
    '- [text]: plain text only. No HTML tags, no markdown, no headings.',
    '- [html: strong em ...]: text in which you may mark words with the HTML tags listed for that field, and no others: <strong>bold</strong>, <em>italics</em>, <u>underline</u>, <del>struck</del>, H<sub>2</sub>O, x<sup>2</sup>, <code>code</code>. Tags have no attributes. Never use <p>, <div>, <br>, <h1> to <h6> or <a>: paragraphs are made for you, so start a new paragraph with an empty line.',
    '- "; blank: *word*": a line with a gap. The word between asterisks is what the learner fills in. Keep exactly one word or short phrase between asterisks.',
    '- [true/false]: true or false.',
    '- [a/b/c]: exactly one of the choices listed.',
    '- [number 0-100]: a number in that range.',
    '',
    'Change only what the teacher asks for, and only in the fields it concerns. Give each changed field its complete new value. Leave every other field out.',
    'Quotation marks the teacher puts round a phrase are not part of the phrase.',
    `The activity is in ${LANGUAGES[language] ?? 'English'}. Keep that language unless the teacher asks for another.`,
    '',
    'Answer with a JSON object: {"changes": {"<id>": <new value>}, "reply": "<one short sentence saying what you changed>"}.'
  ].join('\n')
}

export function editPrompt(outline, message) {
  return `The activity:\n${outline}\n\nThe teacher asks: ${message}`
}

/**
 * The answer's shape for this turn: `changes` keyed by the outline's ids, each with its kind of
 * value, and nothing else; `reply`, the sentence for the chat. `changes` comes first, so the
 * edits are decided before the sentence about them.
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId
 */
export function editSchema(byId) {
  /** @type {Record<string, Record<string, any>>} each id's kind of value */
  const properties = {}
  for (const [id, node] of byId) properties[id] = valueSchema(node)
  return {
    type: 'object',
    properties: { changes: { type: 'object', properties, additionalProperties: false }, reply: STRING },
    required: ['changes', 'reply'],
    additionalProperties: false
  }
}

/** The same shape without the ids and types: for a browser whose model refuses the full schema. */
export const LOOSE_EDIT_SCHEMA = {
  type: 'object',
  properties: { changes: { type: 'object' }, reply: STRING },
  required: ['changes', 'reply']
}

function valueSchema(node) {
  const { field } = node
  switch (node.kind) {
    case 'boolean':
      return { type: 'boolean' }
    case 'number':
      return { type: 'number', ...(field.min !== undefined ? { minimum: field.min } : {}), ...(field.max !== undefined ? { maximum: field.max } : {}) }
    case 'select':
      return { type: 'string', enum: (field.options ?? []).map((option) => String(option.value)) }
    default:
      return field.maxLength ? { type: 'string', maxLength: field.maxLength } : STRING
  }
}

/** The second try: each refused field with its name, its format and the rule it broke. */
export function fixPrompt(violations) {
  const lines = violations.map(({ id, label, problem }) => `- ${id}${label ? ` ${label}` : ''}: ${problem}`).join('\n')
  return `These changes could not be used:\n${lines}\n\nAnswer again with only those fields, keeping to each field's format.`
}
