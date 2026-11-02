/**
 * Create's content, from what the model on this computer answered (`create.js` asks it). The
 * model writes the words and nothing else: it answers a small JSON shape per kind of activity, held
 * to it by the server's `response_format`, and this module puts those words into the content
 * type's own structure. That structure comes from h5p-author's `ContentGenerator`, from the pack's
 * `semantics.json` loaded as h5p-author's build loads it (`loadLibraries`), so every field the
 * content type reads is there with its default, its interface texts in the content's language from
 * the library's own translation, the library versions are the pack's, and the model never sees
 * H5P's form definitions, which are long and would crowd out the teacher's text in a small context
 * window. The content is then checked as the build checks what it writes (`checkContent`).
 *
 * Every string the model wrote is text: it is escaped before it goes into a field, and the
 * delimiters Fill in the Blanks reads are taken out of an answer. The content type's own defaults
 * in its plain text fields come escaped from the loader, as H5P's validator saves them on a site, so
 * the content is what an H5P site would have saved and the player's content check leaves it as it
 * is. What cannot be used — a question with no right answer, a sentence that does not hold its own
 * blank — is left out, and an answer with nothing usable left is an `AuthoringError`.
 *
 * Pure but for zip.js and h5p-author's core: the pack comes in as an argument (`libraryPack()` in
 * the app, h5p-author's `openPack()` in Node), and the package is a `File`.
 */

import { ContentGenerator, checkContent, libraryString, loadLibraries } from '@missing-elements/h5p-author/core'
import { BlobWriter, TextReader, ZipWriter, configure } from '@zip.js/zip.js'
import { escapeHtml, stripMarkup } from './semantics/dialects.js'

export { escapeHtml }

/** The languages Create writes in, by tag, as the instructions to the model name them; the libraries' interface texts come from their own translations into each. */
export const LANGUAGES = { en: 'English', de: 'German', es: 'Spanish', fr: 'French', ja: 'Japanese' }

/** How much of the teacher's text goes to the model: a small context window holds this and the answer. */
export const MAX_TEXT_LENGTH = 6000

/** The longest a title, and any one question, answer or card side, is kept. */
const MAX_TITLE = 120
const MAX_ITEM = 600

/** A problem with the model's answer that the teacher can act on, by trying again or with more text. */
export class AuthoringError extends Error {
  name = 'AuthoringError'
}

const STRING = { type: 'string' }
const BOOLEAN = { type: 'boolean' }
/** An object whose every property is required: a small model leaves out what it may. */
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties) })
const list = (items) => ({ type: 'array', items })

/**
 * The kinds of activity, each a content type in the pack: what the model is asked for, the shape
 * its answer is held to, one item of that answer cleaned (`null` when it cannot be used), and the
 * content type's parameters with the items laid in, where `sub(name)` is a library's string at the
 * pack's version. The parameters name only what the words change: the generator fills in the rest.
 */
export const KINDS = {
  quiz: {
    main: 'H5P.QuestionSet',
    parts: ['H5P.MultiChoice'],
    title: 'Quiz',
    items: 'questions',
    task: (count) =>
      `Write ${count} multiple-choice questions about the text. Give each question three or four answers, exactly one of them correct, and for each answer one sentence of feedback that says why it is right or wrong.`,
    item: object({ question: STRING, answers: list(object({ text: STRING, correct: BOOLEAN, feedback: STRING })) }),
    clean(raw) {
      const question = text(raw?.question)
      const seen = new Set()
      const answers = (Array.isArray(raw?.answers) ? raw.answers : [])
        .map((answer) => ({ text: text(answer?.text), correct: answer?.correct === true, feedback: text(answer?.feedback) }))
        .filter((answer) => answer.text && !seen.has(answer.text.toLowerCase()) && seen.add(answer.text.toLowerCase()))
      // A question needs a right answer and a wrong one to be a question at all.
      if (!question || !answers.some((answer) => answer.correct) || !answers.some((answer) => !answer.correct)) return null
      return { question, answers }
    },
    written: (items, { title, sub }) => ({
      introPage: { showIntroPage: true, title: escapeHtml(title) },
      questions: items.map((item) => ({
        library: sub('H5P.MultiChoice'),
        params: {
          question: `<p>${escapeHtml(item.question)}</p>`,
          answers: item.answers.map((answer) => ({
            text: `<div>${escapeHtml(answer.text)}</div>`,
            correct: answer.correct,
            tipsAndFeedback: answer.feedback ? { chosenFeedback: `<div>${escapeHtml(answer.feedback)}</div>` } : {}
          }))
        },
        metadata: subTitle(item.question)
      }))
    })
  },

  'true-false': {
    main: 'H5P.QuestionSet',
    parts: ['H5P.TrueFalse'],
    title: 'True or false',
    items: 'statements',
    task: (count) =>
      `Write ${count} statements about the text, some true and some false. A false statement must contradict the text, not merely be missing from it. For each, say whether it is true, and write one sentence that explains why.`,
    item: object({ statement: STRING, isTrue: BOOLEAN, explanation: STRING }),
    clean(raw) {
      const statement = text(raw?.statement)
      if (!statement || typeof raw?.isTrue !== 'boolean') return null
      return { statement, isTrue: raw.isTrue, explanation: text(raw?.explanation) }
    },
    written: (items, { title, sub }) => ({
      introPage: { showIntroPage: true, title: escapeHtml(title) },
      questions: items.map((item) => ({
        library: sub('H5P.TrueFalse'),
        params: {
          question: `<p>${escapeHtml(item.statement)}</p>`,
          correct: item.isTrue ? 'true' : 'false',
          behaviour: item.explanation ? { feedbackOnCorrect: escapeHtml(item.explanation), feedbackOnWrong: escapeHtml(item.explanation) } : {}
        },
        metadata: subTitle(item.statement)
      }))
    })
  },

  blanks: {
    main: 'H5P.Blanks',
    parts: [],
    title: 'Fill in the blanks',
    items: 'sentences',
    task: (count) =>
      `Choose ${count} sentences that state key facts from the text. For each, write the sentence complete, exactly as it should read, and name the one important word or short phrase in it that the learner has to fill in.`,
    item: object({ sentence: STRING, answer: STRING }),
    clean(raw) {
      const sentence = blankSentence(text(raw?.sentence), text(raw?.answer))
      return sentence ? { sentence } : null
    },
    // Not case-sensitive: a learner who typed the right word with a capital is right.
    written: (items) => ({ questions: items.map((item) => item.sentence), behaviour: { caseSensitive: false } })
  },

  cards: {
    main: 'H5P.Dialogcards',
    parts: [],
    title: 'Flashcards',
    items: 'cards',
    task: (count) =>
      `Write ${count} flashcards about the key terms or facts in the text: a short question or term on the front, and its answer or definition on the back.`,
    item: object({ front: STRING, back: STRING }),
    clean(raw) {
      const front = text(raw?.front)
      const back = text(raw?.back)
      return front && back ? { front, back } : null
    },
    written: (items, { title }) => ({
      title: `<p>${escapeHtml(title)}</p>`,
      dialogs: items.map((item) => ({
        text: `<p style="text-align: center;">${escapeHtml(item.front)}</p>`,
        answer: `<p style="text-align: center;">${escapeHtml(item.back)}</p>`
      }))
    })
  }
}

/** The shape the model answers in for a kind: a title and its list of items. */
export function schemaFor(kind) {
  const { items, item } = KINDS[kind]
  return object({ title: STRING, [items]: list(item) })
}

/** What the model is told, once per session, and asked, once per activity. */
export function promptFor(kind, { text: source, count, language }) {
  return {
    system: `You make learning activities from a teacher's text. Use only what the text says, and never add facts of your own. Write everything in ${LANGUAGES[language] ?? 'English'}, short and clear. Every value you write is plain text: no HTML tags, no markdown, no headings, no quotation marks round it. The app lays out the activity itself.`,
    prompt: `${KINDS[kind].task(count)} Also give the activity a short title.\n\nThe text:\n"""\n${source.slice(0, MAX_TEXT_LENGTH)}\n"""`,
    schema: schemaFor(kind)
  }
}

/**
 * The content of a kind from the model's answer, in the language it wrote: `h5p.json` and the
 * parameters. At most `count` items are kept, of those that can be used.
 * @param {string} kind
 * @param {unknown} answer
 * @param {{ pack: import('@missing-elements/h5p-author/core').LibrarySource, language?: string, count?: number }} options
 */
export async function contentFrom(kind, answer, { pack, language = 'en', count = Infinity }) {
  const definition = KINDS[kind]
  if (!definition) throw new Error(`No such kind of activity: ${kind}`)

  const raw = Array.isArray(answer?.[definition.items]) ? answer[definition.items] : []
  const items = raw.map((item) => definition.clean(item)).filter(Boolean).slice(0, count)
  if (items.length === 0) {
    throw new AuthoringError(
      raw.length === 0 ? 'The model wrote nothing that could be used.' : `None of the ${raw.length} items the model wrote could be used.`
    )
  }

  const title = text(answer?.title, MAX_TITLE) || definition.title
  // The parts are named so the loader loads them too; each is then the pack's newest.
  const loaded = await loadLibraries(pack, { type: definition.main, language, params: definition.parts.map((library) => ({ library })) })
  const generator = new ContentGenerator(loaded.entries, { metadata: subMetadata })
  const sub = (name) => libraryString(found(generator, name).library)
  const generated = generator.generate(loaded.main, definition.written(items, { title, sub }))
  // As h5p-author's build does, the content is checked last, in the form H5P saves it.
  const checked = checkContent(loaded, { type: libraryString(loaded.main.library), params: generated })
  const problems = [...generator.problems, ...checked.problems]
  if (problems.length) throw new Error(`The content is not as H5P saves it: ${problems.map(({ path, message }) => `${path} ${message}`).join('; ')}`)
  /** @type {Record<string, any>} the content type's parameters, `content.json` */
  const params = checked.params
  const libraries = [definition.main, ...definition.parts].map((name) => found(generator, name).library)
  const manifest = {
    title,
    language,
    defaultLanguage: language,
    mainLibrary: definition.main,
    license: 'U',
    embedTypes: ['div'],
    preloadedDependencies: libraries.map(({ machineName, majorVersion, minorVersion }) => ({ machineName, majorVersion, minorVersion }))
  }
  return { title, manifest, params, items: items.length, written: raw.length }
}

/** The content as a content-only package, `h5p.json` and `content/content.json`, named after its title. */
export async function packageFrom(content) {
  // In the page, no worker of zip.js's own: the two files are a few kilobytes.
  configure({ useWebWorkers: false })
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  await writer.add('h5p.json', new TextReader(JSON.stringify(content.manifest)))
  await writer.add('content/content.json', new TextReader(JSON.stringify(content.params)))
  const blob = await writer.close()
  return new File([blob], `${fileName(content.title)}.h5p`, { type: 'application/zip', lastModified: Date.now() })
}

/**
 * Fill in the Blanks' markup for a sentence with one blank: the answer between asterisks. The
 * answer has to be in the sentence, as written or in another case, and it loses what the content
 * type would read as more than a word — `*` ends a blank, `/` separates alternatives, `:` starts
 * a tip.
 */
export function blankSentence(sentence, answer) {
  const word = answer.replace(/[*/:]/g, ' ').replace(/\s+/g, ' ').trim()
  const plain = sentence.replaceAll('*', '')
  if (!word || !plain) return null
  let at = plain.indexOf(word)
  if (at < 0) at = plain.toLowerCase().indexOf(word.toLowerCase())
  if (at < 0) return null
  const found = plain.slice(at, at + word.length)
  return `<p>${escapeHtml(plain.slice(0, at))}*${escapeHtml(found)}*${escapeHtml(plain.slice(at + word.length))}</p>`
}

/** A file name from a title: letters and digits of any script, the rest as dashes. */
export function fileName(title) {
  const name = title.normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return name || 'h5p-content'
}

/** A library the content names, as the pack has it: the newest. */
function found(generator, name) {
  const entry = generator.find(name)
  if (!entry) throw new Error(`The app's pack has no ${name}`)
  return entry
}

/** A question's title in a set, as the editor writes it: the question as one line, at most 60 characters. */
function subTitle(question) {
  return { title: question.length > 60 ? `${question.slice(0, 59)}…` : question }
}

/** What the editor writes for a question in a set: its type, no licence, and its title, as text. */
function subMetadata(entry, written) {
  return { contentType: escapeHtml(String(entry.library.title)), license: 'U', title: escapeHtml(String(written?.title ?? entry.library.title)) }
}

/**
 * A string the model wrote, as one line of text, or `''`. The model is told to write plain text;
 * markup it writes anyway is dropped here, since Create has no second turn to ask again in.
 */
function text(value, max = MAX_ITEM) {
  return typeof value === 'string' ? stripMarkup(value).replace(/\s+/g, ' ').trim().slice(0, max).trim() : ''
}
