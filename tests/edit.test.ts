import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPackage, summarize } from '@missing-elements/h5p-verify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { applyOps } from '../src/edit/operations.js'
import { EDIT_SCHEMA, editSystem } from '../src/edit/prompt.js'
import { readPackage } from '../src/package/read.js'
import { withContent } from '../src/package/working-copy.js'
import { contentModel, editable } from '../src/semantics/content-model.js'
import { toHtml, toText } from '../src/semantics/dialects.js'
import { outline } from '../src/semantics/outline.js'
import { PARTS_DIR, readAuthoringPack } from '../scripts/authoring-pack.mjs'

/**
 * The editing spine, without a model: content read into the outline the model sees, edits
 * applied as the model would answer them, and the result played untrusted, the content check
 * changing nothing, as a site would play it.
 */

type Pack = Awaited<ReturnType<typeof readAuthoringPack>>
let pack: Pack
let dir: string

beforeAll(async () => {
  pack = await readAuthoringPack()
  dir = await mkdtemp(join(tmpdir(), 'h5p-edit-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

const QUIZ = {
  title: 'The water cycle',
  questions: [
    {
      question: 'What drives evaporation?',
      answers: [
        { text: 'The sun', correct: true, feedback: 'Its heat turns water into vapour.' },
        { text: 'The moon', correct: false, feedback: 'The moon moves tides, not vapour.' }
      ]
    },
    { question: 'What is rain called in science?', answers: [{ text: 'Precipitation', correct: true, feedback: '' }, { text: 'Condensation', correct: false, feedback: 'That is how clouds form.' }] }
  ]
}

const quiz = () => contentFrom('quiz', QUIZ, { pack, language: 'en' })
const main = (content: ReturnType<typeof contentFrom>) => `${content.manifest.mainLibrary} ${content.manifest.preloadedDependencies[0].majorVersion}.${content.manifest.preloadedDependencies[0].minorVersion}`

describe('the outline', () => {
  it("lists the author's words and nothing of the library's own", () => {
    const content = quiz()
    const { text, byId } = outline(contentModel(content.params, main(content), pack, 'en'))
    expect(text).toBe(
      [
        't1 Title: The water cycle',
        'Question 1 (Multiple Choice)',
        't2   Question: What drives evaporation?',
        '  Option 1',
        't3     Text: The sun',
        's1     Correct [yes/no]: yes',
        't4     Message displayed if answer is selected: Its heat turns water into vapour.',
        '  Option 2',
        't5     Text: The moon',
        's2     Correct [yes/no]: no',
        't6     Message displayed if answer is selected: The moon moves tides, not vapour.',
        'Question 2 (Multiple Choice)',
        't7   Question: What is rain called in science?',
        '  Option 1',
        't8     Text: Precipitation',
        's3     Correct [yes/no]: yes',
        '  Option 2',
        't9     Text: Condensation',
        's4     Correct [yes/no]: no',
        't10     Message displayed if answer is selected: That is how clouds form.'
      ].join('\n')
    )
    expect(byId.get('t1')!.path).toEqual(['introPage', 'title'])
    expect(byId.get('t4')!.path).toEqual(['questions', 0, 'params', 'answers', 0, 'tipsAndFeedback', 'chosenFeedback'])
  })

  it('shows settings only when asked, with what they take', () => {
    const content = quiz()
    const nodes = contentModel(content.params, main(content), pack, 'en')
    expect(outline(nodes).text).not.toContain('Pass percentage')
    const { text } = outline(nodes, { settings: true })
    expect(text).toContain('Pass percentage [number 0-100]: 50')
    expect(text).toContain('Randomize questions [yes/no]: no')
    expect(text).toContain('Progress indicator [textual/dots]: dots')
  })

  it('keeps the blank of a Fill in the Blanks line as the model must keep it', () => {
    const content = contentFrom('blanks', { title: 'Words', sentences: [{ sentence: 'Evaporation is driven by the Sun.', answer: 'Sun' }] }, { pack })
    const { text, byId } = outline(contentModel(content.params, main(content), pack, 'en'))
    expect(text).toContain('t1   Line of text: Evaporation is driven by the *Sun*.')
    expect(byId.get('t1')!.dialect).toBe('blanks')
    // The task description is the library's default: not the author's, not shown.
    expect(text).not.toContain('Fill in the missing words')
  })

  it("says which content it can edit: the pack's libraries", () => {
    const content = quiz()
    expect(editable(content.params, main(content), pack)).toBe(true)
    expect(editable(content.params, 'H5P.Nowhere 1.0', pack)).toBe(false)
    const foreign = structuredClone(content.params)
    foreign.questions[0].library = 'H5P.Custom 1.0'
    expect(editable(foreign, main(content), pack)).toBe(false)
  })
})

describe('the edits', () => {
  it('writes text as the field holds it, and the title of the question with it', () => {
    const content = quiz()
    const { byId } = outline(contentModel(content.params, main(content), pack, 'en'))
    const { params, applied, violations } = applyOps(content.params, [
      { id: 't1', value: 'Water on Earth' },
      { id: 't2', value: 'What **drives** evaporation & rain?' },
      { id: 's2', value: 'yes' }
    ], byId)
    expect(violations).toEqual([])
    expect(applied.map((change) => change.id)).toEqual(['t1', 't2', 's2'])
    expect(params.introPage.title).toBe('Water on Earth')
    expect(params.questions[0].params.question).toBe('<p>What <strong>drives</strong> evaporation &amp; rain?</p>')
    expect(params.questions[0].metadata.title).toBe('What **drives** evaporation &amp; rain?')
    expect(params.questions[0].params.answers[1].correct).toBe(true)
    // Untouched: the original, and the copy is a copy.
    expect(content.params.introPage.title).toBe('The water cycle')
  })

  it('refuses what the field refuses, by id, with the reason', () => {
    const content = quiz()
    const nodes = contentModel(content.params, main(content), pack, 'en')
    const { byId } = outline(nodes, { settings: true })
    const pass = [...byId].find(([, node]) => node.label === 'Pass percentage')![0]
    const progress = [...byId].find(([, node]) => node.label === 'Progress indicator')![0]
    const { applied, violations } = applyOps(content.params, [
      { id: 't99', value: 'x' },
      { id: 's1', value: 'maybe' },
      { id: pass, value: '120' },
      { id: progress, value: 'bars' },
      { id: 't1', value: '' },
      { id: pass, value: '60' }
    ], byId)
    expect(violations.map((violation) => violation.id)).toEqual(['t99', 's1', pass, progress, 't1'])
    expect(violations[2].problem).toBe('At most 100.')
    expect(applied).toEqual([{ id: pass, label: 'Pass percentage', from: 50, to: 60 }])
  })

  it('keeps asterisks in a Fill in the Blanks line and refuses a line without a blank', () => {
    const content = contentFrom('blanks', { title: 'Words', sentences: [{ sentence: 'Evaporation is driven by the Sun.', answer: 'Sun' }] }, { pack })
    const { byId } = outline(contentModel(content.params, main(content), pack, 'en'))
    const refused = applyOps(content.params, [{ id: 't1', value: 'Rivers flow to the sea.' }], byId)
    expect(refused.violations[0].problem).toMatch(/asterisks/)
    const { params } = applyOps(content.params, [{ id: 't1', value: 'Rivers flow to the *sea*.' }], byId)
    expect(params.questions[0]).toBe('<p>Rivers flow to the *sea*.</p>')
  })

  it('renders the subset into the tags a field allows, as its previous value wrapped it', () => {
    expect(toHtml('A **bold** and *soft* word', { tags: ['strong', 'em'], previous: '<p style="text-align: center;">x</p>' })).toBe('<p style="text-align: center;">A <strong>bold</strong> and <em>soft</em> word</p>')
    expect(toHtml('No *tags* here', { tags: ['code'], previous: '<div>x</div>' })).toBe('<div>No *tags* here</div>')
    expect(toHtml('One\ntwo\n\nThree <b>', { tags: ['strong'], previous: '<p>x</p>' })).toBe('<p>One<br>two</p><p>Three &lt;b&gt;</p>')
    expect(toHtml("Plain 'text' & <tag>")).toBe('Plain &#039;text&#039; &amp; &lt;tag&gt;')
    expect(toText('<p>A <strong>bold</strong> &amp; <em>soft</em> word</p><p>Next</p>', { tags: true })).toBe('A **bold** & *soft* word\n\nNext')
    expect(toText('<p>Stars *shine*</p>', { tags: true, dialect: 'blanks' })).toBe('Stars *shine*')
    expect(toText('Fish &amp; chips &#039;n&#039; peas')).toBe("Fish & chips 'n' peas")
  })

  it('asks for ops before the reply, in the language of the content', () => {
    expect(EDIT_SCHEMA.required).toEqual(['ops', 'reply'])
    expect(editSystem('de')).toContain('in German')
  })
})

describe('the working copy and the package', () => {
  it('reads what Create wrote, and plays an edit untrusted with the content check changing nothing', async () => {
    const content = quiz()
    const original = await packageFrom(content)
    const read = await readPackage(original)
    expect(read.mainLibrary).toBe(main(content))
    expect(read.params).toEqual(content.params)

    const { byId } = outline(contentModel(content.params, main(content), pack, 'en'))
    const { params } = applyOps(content.params, [{ id: 't1', value: 'Water on Earth' }, { id: 't2', value: 'What **drives** evaporation?' }], byId)
    const copy = await withContent(original, { params, manifest: { ...content.manifest, title: 'Water on Earth' } })
    expect(copy.size).toBeGreaterThan(original.size)
    const again = await readPackage(copy)
    expect(again.params).toEqual(params)
    expect(again.manifest.title).toBe('Water on Earth')
    expect(again.entries).toEqual(['h5p.json', 'content/content.json'])

    const file = join(dir, 'edited.h5p')
    await writeFile(file, new Uint8Array(await copy.arrayBuffer()))
    const report = await verifyPackage({ file, untrusted: true, libraries: PARTS_DIR, settle: 1_000 })
    expect(report.verdict, summarize(report)).toBe('pass')
    expect(report.contentCheck?.changes).toEqual([])
    expect(report.warnings).toEqual([])
  })
})
