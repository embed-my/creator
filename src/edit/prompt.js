/**
 * What the model is told for an edit, in one place each:
 *
 * - The system prompt, once per session: the task, what each format in the outline means —
 *   where HTML may go and which tags, where it may not — and the shape of the answer.
 * - The turn: the outline, every line naming its field's format, and the teacher's words.
 * - The second try (`fixPrompt`), at most one: the refused fields with the rules they broke, and
 *   the feedback a changed answer left behind.
 * - The schema (`editSchema`), per turn: the answer's shape with the outline's ids as the only
 *   keys and each value's type, so a wrong id or a "maybe" for a true/false field cannot be
 *   written. The server holds the answer to it (`response_format`), and the system prompt says
 *   the same in words, for the model.
 *
 * The chat's history is not sent: the content as it stands is the history.
 */

import { LANGUAGES } from '../authoring.js'

const STRING = { type: 'string' }

export function editSystem(language = 'en') {
  return [
    'You edit a learning activity for a teacher.',
    'The activity is a list of fields, one per line, like this:',
    't7 Question [html: strong em]: "What is rain called in science?"',
    'Here t7 is the id, Question is the field\'s name, [html: strong em] is its format, and the text in quotation marks is its current value.',
    'A note in parentheses after a field\'s name says what the field is for and when the learner sees it. Read it before you choose which field to change.',
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
    'Answer with a JSON object of the changed fields and one short sentence saying what you changed. For the line above, an answer that puts "rain" in italics is:',
    '{"changes": {"t7": "What is <em>rain</em> called in science?"}, "reply": "I put rain in italics."}',
    'A value is only the new text: never the id, the field\'s name, the format in brackets or the quotation marks round the old value.'
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

/**
 * The second try: each refused field with its name, its format and the rule it broke, and each
 * feedback a changed answer left behind (`staleFeedback`), with the answer as it now reads.
 * @param {{ id: string, label: string, problem: string }[]} violations
 * @param {{ id: string, label: string, problem: string }[]} [stale]
 */
export function fixPrompt(violations, stale = []) {
  const list = (entries) => entries.map(({ id, label, problem }) => `- ${id}${label ? ` ${label}` : ''}: ${problem}`).join('\n')
  const parts = []
  if (violations.length) parts.push(`These changes could not be used:\n${list(violations)}`)
  if (stale.length) parts.push(`This feedback belongs to answers you changed, and may no longer fit them:\n${list(stale)}`)
  return `${parts.join('\n\n')}\n\nAnswer again with only those fields, keeping to each field's format.`
}
