/**
 * What the model is told for an edit: the rules once per session, and per turn the outline
 * and the teacher's words. The answer is held to `{ ops, reply }` by the Prompt API's
 * `responseConstraint`: the fields to change, each with its complete new text, and one
 * sentence for the chat. The chat's history is not sent: the content as it stands is the
 * history, and the window is small.
 */

import { LANGUAGES } from '../authoring.js'

const STRING = { type: 'string' }

/** The answer's shape: `ops` first, so the edits are decided before the sentence about them. */
export const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    ops: { type: 'array', items: { type: 'object', properties: { id: STRING, value: STRING }, required: ['id', 'value'] } },
    reply: STRING
  },
  required: ['ops', 'reply']
}

export function editSystem(language = 'en') {
  return [
    'You edit a learning activity for a teacher. The activity is given as numbered fields: an id, a label and the text.',
    'Change only what the teacher asks for, in the fields it concerns, and leave every other field out of your answer.',
    'Give each changed field its complete new text, as plain text; **bold** and *italics* are allowed.',
    'In a line with a blank, the word between asterisks (*like this*) is the answer: keep exactly one such word in the line.',
    'For a yes/no field answer yes or no; for a choice, one of the choices given; for a number, the number.',
    `The activity is in ${LANGUAGES[language] ?? 'English'}; keep that language unless the teacher asks for another.`,
    'End with one short sentence saying what you changed.'
  ].join(' ')
}

export function editPrompt(outline, message) {
  return `The activity:\n${outline}\n\nThe teacher asks: ${message}`
}

/** The second try, with what the first answer got wrong. */
export function fixPrompt(violations) {
  const lines = violations.map(({ id, problem }) => `- ${id}: ${problem}`).join('\n')
  return `Some of your changes could not be used:\n${lines}\n\nAnswer again with only those fields, corrected.`
}
