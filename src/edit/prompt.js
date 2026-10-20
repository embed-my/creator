/**
 * What the model is told, in one place each:
 *
 * - For an edit: the system prompt once per session (the task, what each format in the outline
 *   means — where HTML may go and which tags, where it may not — and the shape of the answer);
 *   the turn (the outline, every line naming its field's format, and the teacher's words); the
 *   schema (`editSchema`), with the outline's ids as the only keys and each value's type.
 * - For the request (`intentPrompt`): whether the teacher asks for the activity in another
 *   language. A narrow question a small model answers well, asked before anything else.
 * - For a translation (`translateSystem`): every field of a batch, each one required by the
 *   schema (`translateSchema`), so none can be left out.
 *
 * Schemas are not sent to the model as text (`omitSchema`): each prompt describes its answer in
 * words, and the window is small. The chat's history is not sent: the content as it stands is the
 * history.
 */

import { LANGUAGES } from '../authoring.js'

const STRING = { type: 'string' }
const CODES = Object.keys(LANGUAGES)

/** How the outline reads, and what each format allows: the same for an edit and a translation. */
const FIELDS_AND_FORMATS = [
  'The activity is a list of fields, one per line, like this:',
  't7 Question [html: strong em]: "What is rain called in science?"',
  'Here t7 is the id, Question is the field\'s name, [html: strong em] is its format, and the text in quotation marks is its current value.',
  '',
  'What each format allows:',
  '- [text]: plain text only. No HTML tags, no markdown, no headings.',
  '- [html: strong em ...]: text in which you may mark words with the HTML tags listed for that field, and no others: <strong>bold</strong>, <em>italics</em>, <u>underline</u>, <del>struck</del>, H<sub>2</sub>O, x<sup>2</sup>, <code>code</code>. Tags have no attributes. Never use <p>, <div>, <br>, <h1> to <h6> or <a>: paragraphs are made for you, so start a new paragraph with an empty line.',
  '- "; blank: *word*": a line with a gap. The word between asterisks is what the learner fills in. Keep exactly one word or short phrase between asterisks.',
  '- [true/false]: true or false.',
  '- [a/b/c]: exactly one of the choices listed.',
  '- [number 0-100]: a number in that range.'
]

const VALUE_ONLY = 'A value is only the new text: never the id, the field\'s name, the format in brackets or the quotation marks round the old value.'

export function editSystem(language = 'en') {
  return [
    'You edit a learning activity for a teacher.',
    ...FIELDS_AND_FORMATS,
    '',
    'Change only what the teacher asks for, and only in the fields it concerns. Give each changed field its complete new value. Leave every other field out.',
    'Quotation marks the teacher puts round a phrase are not part of the phrase.',
    `The activity is in ${LANGUAGES[language] ?? 'English'}. Write in that language.`,
    '',
    'Answer with a JSON object of the changed fields and one short sentence saying what you changed. For the line above, an answer that puts "rain" in italics is:',
    '{"changes": {"t7": "What is <em>rain</em> called in science?"}, "reply": "I put rain in italics."}',
    VALUE_ONLY
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

export const INTENT_SYSTEM = 'You read one request a teacher makes about a learning activity, and say whether it asks for the activity in another language.'

/** Whether the request asks for the whole activity in another language, and which. */
export function intentPrompt(message, language = 'en') {
  const names = CODES.map((code) => `${code} (${LANGUAGES[code]})`).join(', ')
  return [
    `The activity is in ${LANGUAGES[language] ?? 'English'}.`,
    `The teacher's request: ${JSON.stringify(message)}`,
    `If the request asks for the activity, or all of it, in another language, answer that language's code: ${names}. If it asks for anything else, including translating only a part, answer "none".`,
    'Answer as {"translateTo": "<code or none>"}.'
  ].join('\n')
}

export const INTENT_SCHEMA = {
  type: 'object',
  properties: { translateTo: { type: 'string', enum: ['none', ...CODES] } },
  required: ['translateTo'],
  additionalProperties: false
}

export const LOOSE_INTENT_SCHEMA = { type: 'object', properties: { translateTo: STRING }, required: ['translateTo'] }

export function translateSystem(from, to) {
  return [
    `You translate a learning activity from ${LANGUAGES[from] ?? from} into ${LANGUAGES[to] ?? to} for a teacher.`,
    ...FIELDS_AND_FORMATS,
    '',
    'Translate every field you are given, completely and faithfully, keeping its meaning and its format. Keep the tags that mark words round the same words, translated. In a line with a blank, keep the answer between asterisks, translated.',
    `Answer with a JSON object holding every field you were given, translated into ${LANGUAGES[to] ?? to}. For the line above, translated into German:`,
    '{"changes": {"t7": "Wie nennt man Regen in der Wissenschaft?"}}',
    VALUE_ONLY
  ].join('\n')
}

export function translatePrompt(lines, to) {
  return `Translate each of these fields into ${LANGUAGES[to] ?? to}:\n${lines}`
}

/**
 * A translation's shape: every id of the batch required, so the model cannot leave one out.
 * @param {Map<string, import('../semantics/content-model.js').Node>} byId
 * @param {string[]} ids
 */
export function translateSchema(byId, ids) {
  /** @type {Record<string, Record<string, any>>} */
  const properties = {}
  for (const id of ids) properties[id] = valueSchema(/** @type {any} */ (byId.get(id)))
  return { type: 'object', properties: { changes: { type: 'object', properties, required: ids, additionalProperties: false } }, required: ['changes'], additionalProperties: false }
}

export const LOOSE_TRANSLATE_SCHEMA = { type: 'object', properties: { changes: { type: 'object' } }, required: ['changes'] }

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
