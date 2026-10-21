import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPackage, summarize } from '@missing-elements/h5p-verify'
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AuthoringError,
  KINDS,
  blankSentence,
  contentFrom,
  escapeHtml,
  fileName,
  packageFrom,
  promptFor,
  schemaFor,
  translated
} from '../src/authoring.js'
import { AUTHORING_LIBRARIES, PARTS_DIR, readAuthoringPack } from '../scripts/authoring-pack.mjs'
import { mediaIn } from '../scripts/sweep-content.mjs'

/**
 * Create's content, from answers written the way Chrome's model answers, against the real pack:
 * whatever the model wrote, what the app makes has to play. Each package is played untrusted by
 * `h5p-verify`, in Chromium, with the installed pack: as a site plays a package it did not make,
 * through the runtime's content check, the port of H5P's validator, which must change nothing.
 */

type Pack = Awaited<ReturnType<typeof readAuthoringPack>>
let pack: Pack
/** Where the packages are written for the verifier, which reads a file from disk. */
let dir: string

beforeAll(async () => {
  pack = await readAuthoringPack()
  dir = await mkdtemp(join(tmpdir(), 'creator-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** What the model answers for each kind: two good items, then one the app has to leave out. */
const ANSWERS: Record<string, Record<string, unknown>> = {
  quiz: {
    title: 'The water cycle',
    questions: [
      {
        question: 'What drives evaporation?',
        answers: [
          { text: 'The sun', correct: true, feedback: 'Its heat turns water into vapour.' },
          { text: 'The moon', correct: false, feedback: 'The moon moves tides, not vapour.' },
          { text: 'Wind', correct: false, feedback: 'Wind helps, but heat drives it.' }
        ]
      },
      {
        question: 'What is rain called <b>in science</b>?',
        answers: [
          { text: 'Precipitation', correct: true, feedback: '' },
          { text: 'Condensation', correct: false, feedback: 'That is how clouds form.' }
        ]
      },
      // No right answer: not a question.
      { question: 'Which is wrong?', answers: [{ text: 'A', correct: false, feedback: '' }, { text: 'B', correct: false, feedback: '' }] }
    ]
  },
  'true-false': {
    title: 'Clouds',
    statements: [
      { statement: 'Clouds are made of water droplets.', isTrue: true, explanation: 'Vapour condenses into droplets.' },
      { statement: 'Rain falls upwards.', isTrue: false, explanation: 'Gravity pulls it down.' },
      { statement: 'Undecided.', explanation: 'No answer given.' }
    ]
  },
  blanks: {
    title: 'Words of the water cycle',
    sentences: [
      { sentence: 'Water vapour cools and forms clouds.', answer: 'clouds' },
      { sentence: 'Evaporation is driven by the Sun.', answer: 'sun' },
      // The answer is not in the sentence: there is no blank to make.
      { sentence: 'Rivers flow to the sea.', answer: 'ocean' }
    ]
  },
  cards: {
    title: 'Terms',
    cards: [
      { front: 'Evaporation', back: 'Water turning into vapour.' },
      { front: 'Condensation', back: 'Vapour turning back into droplets.' },
      { front: '', back: 'A side is missing.' }
    ]
  }
}

describe("Create's content", () => {
  for (const kind of Object.keys(KINDS)) {
    for (const language of ['en', 'de', 'ja']) {
      it(`makes ${kind} in ${language} that plays untrusted, the content check changing nothing`, async () => {
        const content = contentFrom(kind, ANSWERS[kind], { pack, language })

        expect(content.items).toBe(2)
        expect(content.written).toBe(3)
        // Nothing to carry: no media.
        expect(mediaIn(content.params)).toEqual([])

        const file = join(dir, `${kind}-${language}.h5p`)
        await writeFile(file, new Uint8Array(await (await packageFrom(content)).arrayBuffer()))
        const report = await verifyPackage({ file, untrusted: true, libraries: PARTS_DIR, settle: 1_000 })
        // The summary names whatever failed, and every field the check changed.
        expect(report.verdict, summarize(report)).toBe('pass')
        expect(report.contentCheck?.changes).toEqual([])
        expect(report.warnings).toEqual([])
      })
    }
  }

  it("names the pack's versions, in h5p.json and in the sub-content", () => {
    const content = contentFrom('quiz', ANSWERS.quiz, { pack, language: 'en' })
    const version = (name: string) => pack.libraries.find((entry) => entry.library.machineName === name)!.library
    expect(content.manifest).toMatchObject({
      title: 'The water cycle',
      mainLibrary: 'H5P.QuestionSet',
      language: 'en',
      defaultLanguage: 'en',
      preloadedDependencies: [
        { machineName: 'H5P.QuestionSet', majorVersion: version('H5P.QuestionSet').majorVersion, minorVersion: version('H5P.QuestionSet').minorVersion },
        { machineName: 'H5P.MultiChoice', majorVersion: version('H5P.MultiChoice').majorVersion, minorVersion: version('H5P.MultiChoice').minorVersion }
      ]
    })
    const multiChoice = version('H5P.MultiChoice')
    expect(content.params.questions.map((question: { library: string }) => question.library)).toEqual([
      `H5P.MultiChoice ${multiChoice.majorVersion}.${multiChoice.minorVersion}`,
      `H5P.MultiChoice ${multiChoice.majorVersion}.${multiChoice.minorVersion}`
    ])
    // A UUID each, as the editor gives them, and the core marks statements with.
    const ids = content.params.questions.map((question: { subContentId: string }) => question.subContentId)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('drops the markup the model wrote, and escapes the rest', () => {
    const content = contentFrom('quiz', ANSWERS.quiz, { pack })
    const [, second] = content.params.questions
    // The <b> the model wrote is noise, not content; an ampersand it writes is text, escaped.
    expect(second.params.question).toBe('<p>What is rain called in science?</p>')
    expect(content.params.questions[0].params.answers[1].text).toBe('<div>The moon</div>')
    expect(second.params.answers[0]).toMatchObject({ text: '<div>Precipitation</div>', correct: true })
    expect(content.params.questions[0].params.answers[1].tipsAndFeedback.chosenFeedback).toBe('<div>The moon moves tides, not vapour.</div>')
    expect(content.params.introPage).toMatchObject({ showIntroPage: true, title: 'The water cycle' })
  })

  it('writes the true or false of each statement', () => {
    const content = contentFrom('true-false', ANSWERS['true-false'], { pack })
    expect(content.params.questions.map((question: { params: { correct: string } }) => question.params.correct)).toEqual(['true', 'false'])
    expect(content.params.questions[1].params.behaviour).toMatchObject({ feedbackOnCorrect: 'Gravity pulls it down.', feedbackOnWrong: 'Gravity pulls it down.' })
  })

  it("gives the content type's buttons in the content's language", () => {
    const english = contentFrom('quiz', ANSWERS.quiz, { pack, language: 'en' })
    const german = contentFrom('quiz', ANSWERS.quiz, { pack, language: 'de' })
    expect(english.params.texts.finishButton).toBe('Finish')
    expect(german.params.texts.finishButton).not.toBe(english.params.texts.finishButton)
    expect(german.params.questions[0].params.UI.checkAnswerButton).not.toBe(english.params.questions[0].params.UI.checkAnswerButton)
    const cards = contentFrom('cards', ANSWERS.cards, { pack, language: 'fr' })
    expect(cards.params.answer).not.toBe('Turn')
  })

  it('keeps at most as many items as were asked for', () => {
    const many = { title: 'Many', cards: Array.from({ length: 9 }, (_, index) => ({ front: `Term ${index}`, back: `Meaning ${index}` })) }
    expect(contentFrom('cards', many, { pack, count: 5 }).params.dialogs).toHaveLength(5)
  })

  it('says so when nothing the model wrote can be used', () => {
    expect(() => contentFrom('quiz', { title: 'Empty', questions: [] }, { pack })).toThrow(AuthoringError)
    expect(() => contentFrom('blanks', { sentences: [{ sentence: 'A', answer: 'B' }] }, { pack })).toThrow(/None of the 1 items/)
    expect(() => contentFrom('cards', null, { pack })).toThrow(/nothing that could be used/)
  })

  it('titles an activity whose answer has none by its kind', () => {
    const { title, manifest } = contentFrom('cards', { cards: ANSWERS.cards.cards }, { pack })
    expect(title).toBe('Flashcards')
    expect(manifest.title).toBe('Flashcards')
  })

  it('packages it as a content-only export', async () => {
    const content = contentFrom('blanks', ANSWERS.blanks, { pack, language: 'de' })
    const file = await packageFrom(content)
    expect(file.name).toBe('Words-of-the-water-cycle.h5p')
    const reader = new ZipReader(new BlobReader(file))
    const entries = await reader.getEntries()
    expect(entries.map((entry) => entry.filename)).toEqual(['h5p.json', 'content/content.json'])
    const read = async (index: number) => {
      const entry = entries[index]
      if (entry.directory) throw new Error(`${entry.filename} is a folder`)
      return JSON.parse(await entry.getData(new TextWriter()))
    }
    expect(await read(0)).toEqual(content.manifest)
    expect(await read(1)).toEqual(content.params)
    await reader.close()
  })
})

describe('what the model is asked', () => {
  it('asks for every kind in a shape the app can read, every field required', () => {
    for (const kind of Object.keys(KINDS)) {
      const schema = schemaFor(kind)
      expect(schema.required).toEqual(['title', KINDS[kind as keyof typeof KINDS].items])
      // The model's answers above are in that shape; a field renamed on one side would show here.
      expect(Object.keys(ANSWERS[kind]).sort()).toEqual([...schema.required].sort())
      const item = schema.properties[KINDS[kind as keyof typeof KINDS].items].items
      expect(item.required).toEqual(Object.keys(item.properties))
    }
  })

  it('names the language, the count and the text, and no more of the text than fits', () => {
    const { system, prompt } = promptFor('quiz', { text: '§'.repeat(10_000), count: 4, language: 'fr' })
    expect(system).toContain('in French')
    expect(prompt).toMatch(/^Write 4 multiple-choice questions/)
    expect(prompt.match(/§+/)![0]).toHaveLength(6000)
  })

  it('reads only libraries the pack has', () => {
    for (const { main, parts } of Object.values(KINDS)) for (const name of [main, ...parts]) expect(AUTHORING_LIBRARIES).toContain(name)
    expect(pack.libraries.map((entry) => entry.library.machineName)).toEqual(AUTHORING_LIBRARIES)
    for (const entry of pack.libraries) expect(Object.keys(entry.translations).sort()).toEqual(['de', 'es', 'fr', 'ja'])
  })
})

describe('the pieces', () => {
  it('makes a blank of the answer, in the case the sentence has it', () => {
    expect(blankSentence('Evaporation is driven by the Sun.', 'sun')).toBe('<p>Evaporation is driven by the *Sun*.</p>')
    expect(blankSentence('A <tag> & the word.', 'word')).toBe('<p>A &lt;tag&gt; &amp; the *word*.</p>')
    // Asterisks would end the blank, a slash would make two answers of one, a colon a tip.
    expect(blankSentence('Stars *shine* at night.', 'shine')).toBe('<p>Stars *shine* at night.</p>')
    expect(blankSentence('Use and/or here.', 'and/or')).toBeNull()
    expect(blankSentence('Nothing to blank.', '')).toBeNull()
  })

  it('lays a translation over the semantics as the editor does', () => {
    const semantics = [{ name: 'a', type: 'text', default: 'Check', label: 'A' }, { name: 'b', type: 'group', fields: [{ name: 'c', type: 'text', default: 'Retry' }] }]
    const out = translated(semantics, [{ default: 'Prüfen' }, { fields: [{ default: 'Wiederholen' }] }])
    expect(out).toEqual([{ name: 'a', type: 'text', default: 'Prüfen', label: 'A' }, { name: 'b', type: 'group', fields: [{ name: 'c', type: 'text', default: 'Wiederholen' }] }])
    // Untouched where the translation says nothing, or something of another kind.
    expect(translated(semantics, undefined)).toBe(semantics)
    expect(translated([{ default: 3 }], [{ default: 'three' }])).toEqual([{ default: 3 }])
  })

  it('escapes the five characters markup reads, as H5P saves text', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#039;y&#039;&gt;&amp;&lt;/a&gt;')
    // The model's words are text: what looks like a reference is the characters it is written with.
    expect(escapeHtml('Fish &amp; chips')).toBe('Fish &amp;amp; chips')
    // A default keeps its references, as the validator does.
    expect(escapeHtml("Fish &amp; chips & 'peas'&nbsp;", { keepReferences: true })).toBe('Fish &amp; chips &amp; &#039;peas&#039;&nbsp;')
  })

  it('names the file after the title, in any script', () => {
    expect(fileName('The water cycle!')).toBe('The-water-cycle')
    expect(fileName('水の循環')).toBe('水の循環')
    expect(fileName('???')).toBe('h5p-content')
  })
})
