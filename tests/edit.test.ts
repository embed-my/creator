import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPackage, summarize } from '@missing-elements/h5p-verify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { applyChanges } from '../src/edit/operations.js'
import { editSchema, editSystem, fixPrompt } from '../src/edit/prompt.js'
import { readPackage } from '../src/package/read.js'
import { withContent } from '../src/package/working-copy.js'
import { contentModel, editable } from '../src/semantics/content-model.js'
import { checkModelText, describeFormat, formatOf, stripMarkup, toHtml, toModel } from '../src/semantics/dialects.js'
import { outline } from '../src/semantics/outline.js'
import { PARTS_DIR, readAuthoringPack } from '../scripts/authoring-pack.mjs'

/**
 * The editing spine, without a model: content read into the outline the model sees, every field
 * naming its format, edits applied as the model would answer them, text that breaks its field's
 * format refused with the rule, and the result played untrusted, the content check changing
 * nothing, as a site would play it.
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
const outlineOf = (content: ReturnType<typeof contentFrom>, options = {}) => outline(contentModel(content.params, main(content), pack, content.manifest.language), options)
const INLINE = 'html: strong em sub sup code'

describe('the outline', () => {
  it("lists the author's words, each with its field's format, and nothing of the library's own", () => {
    const { text, byId } = outlineOf(quiz())
    expect(text).toBe(
      [
        `t1 Title [${INLINE}]: The water cycle`,
        'Question 1 (Multiple Choice)',
        `t2   Question [${INLINE}]: What drives evaporation?`,
        '  Option 1',
        `t3     Text [${INLINE}]: The sun`,
        's1     Correct [true/false]: true',
        `t4     Message displayed if answer is selected [${INLINE}]: Its heat turns water into vapour.`,
        '  Option 2',
        `t5     Text [${INLINE}]: The moon`,
        's2     Correct [true/false]: false',
        `t6     Message displayed if answer is selected [${INLINE}]: The moon moves tides, not vapour.`,
        'Question 2 (Multiple Choice)',
        `t7   Question [${INLINE}]: What is rain called in science?`,
        '  Option 1',
        `t8     Text [${INLINE}]: Precipitation`,
        's3     Correct [true/false]: true',
        '  Option 2',
        `t9     Text [${INLINE}]: Condensation`,
        's4     Correct [true/false]: false',
        `t10     Message displayed if answer is selected [${INLINE}]: That is how clouds form.`
      ].join('\n')
    )
    expect(byId.get('t1')!.path).toEqual(['introPage', 'title'])
    expect(byId.get('t4')!.path).toEqual(['questions', 0, 'params', 'answers', 0, 'tipsAndFeedback', 'chosenFeedback'])
  })

  it('says where a field is plain text: True/False feedback has no tags', () => {
    const content = contentFrom('true-false', { title: 'Clouds', statements: [{ statement: 'Rain falls upwards.', isTrue: false, explanation: 'Gravity pulls it down.' }] }, { pack })
    const { text } = outlineOf(content)
    expect(text).toContain(`t2   Question [${INLINE}]: Rain falls upwards.`)
    expect(text).toContain('s1   Correct answer [true/false]: false')
    expect(text).toContain('t3   Feedback on correct answer [text]: Gravity pulls it down.')
  })

  it('shows settings only when asked, with what they take', () => {
    const content = quiz()
    expect(outlineOf(content).text).not.toContain('Pass percentage')
    const { text } = outlineOf(content, { settings: true })
    expect(text).toContain('Pass percentage [number 0-100]: 50')
    expect(text).toContain('Randomize questions [true/false]: false')
    expect(text).toContain('Progress indicator [textual/dots]: dots')
  })

  it('names the blank of a Fill in the Blanks line as part of its format', () => {
    const content = contentFrom('blanks', { title: 'Words', sentences: [{ sentence: 'Evaporation is driven by the Sun.', answer: 'Sun' }] }, { pack })
    const { text } = outlineOf(content)
    expect(text).toContain('t1   Line of text [html: strong em u del code; blank: *word*]: Evaporation is driven by the *Sun*.')
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

describe('the formats', () => {
  const plain = formatOf({ type: 'text' })
  const rich = formatOf({ type: 'text', tags: ['strong', 'em', 'sub', 'sup', 'h2', 'a', 'p'] })
  const blanks = formatOf({ type: 'text', tags: ['strong', 'em', 'u', 'del', 'code'] }, 'blanks')

  it("come from the field's own tags: inline ones only", () => {
    expect(describeFormat(plain)).toBe('text')
    expect(describeFormat(rich)).toBe('html: strong em sub sup')
    expect(describeFormat(blanks)).toBe('html: strong em u del code; blank: *word*')
  })

  it('accept text that keeps to them', () => {
    expect(checkModelText('Water on Earth', plain)).toEqual({ text: 'Water on Earth' })
    expect(checkModelText('What <strong>drives</strong> H<sub>2</sub>O?', rich)).toEqual({ text: 'What <strong>drives</strong> H<sub>2</sub>O?' })
    // A model's <b> is taken as the <strong> it means; a bare "<" is text.
    expect(checkModelText('Is 5 < 7 <b>true</b>?', rich)).toEqual({ text: 'Is 5 < 7 <b>true</b>?' })
    expect(checkModelText('Stars <em>shine</em> at *night*.', blanks)).toEqual({ text: 'Stars <em>shine</em> at *night*.' })
  })

  it('refuse text that breaks them, saying which rule', () => {
    expect(checkModelText('<h1>Water on Earth</h1>', plain)).toEqual({ problem: 'This field is plain text: write it without HTML tags such as <h1>.' })
    expect(checkModelText('<h1>Water on Earth</h1>', rich)).toEqual({ problem: 'Do not wrap the text in <h1>: paragraphs are added for you. Start a new paragraph with an empty line.' })
    expect(checkModelText('<p>What drives it?</p>', rich)).toMatchObject({ problem: expect.stringContaining('Do not wrap the text in <p>') })
    expect(checkModelText('See <a href="x">this</a>', rich)).toEqual({ problem: 'This field allows only the tags <strong>, <em>, <sub>, <sup>; <a> is not one of them.' })
    expect(checkModelText('A <strong class="x">word</strong>', rich)).toEqual({ problem: 'Write <strong> without attributes.' })
    expect(checkModelText('A <strong>word', rich)).toEqual({ problem: '<strong> is opened and never closed.' })
    expect(checkModelText('# Water on Earth', plain)).toEqual({ problem: 'Write no headings: only the text of the field.' })
    expect(checkModelText('Rivers flow to the sea.', blanks)).toEqual({ problem: 'The answer must stay between asterisks, like *this*.' })
    expect(checkModelText('  ', plain)).toEqual({ problem: 'The text is empty.' })
  })

  it('write checked text as the field holds it, wrapped as before', () => {
    expect(toHtml('A <b>bold</b> & <em>soft</em> word', rich, '<p style="text-align: center;">x</p>')).toBe('<p style="text-align: center;">A <strong>bold</strong> &amp; <em>soft</em> word</p>')
    expect(toHtml('One\ntwo\n\nThree', rich, '<div>x</div>')).toBe('<div>One<br>two</div><div>Three</div>')
    expect(toHtml("Plain 'text' & 5 < 7", plain)).toBe('Plain &#039;text&#039; &amp; 5 &lt; 7')
  })

  it('read a value back in the same format the model writes it', () => {
    expect(toModel('<p>A <strong>bold</strong> &amp; <span style="x">plain</span> word</p><p>Next</p>', rich)).toBe('A <strong>bold</strong> & plain word\n\nNext')
    expect(toModel('<p>A <strong>bold</strong> word</p>', plain)).toBe('<p>A <strong>bold</strong> word</p>')
    expect(toModel('Fish &amp; chips &#039;n&#039; peas', plain)).toBe("Fish & chips 'n' peas")
  })

  it("strip markup only in Create's guard", () => {
    expect(stripMarkup('<h1>Water on Earth</h1>')).toBe('Water on Earth')
    expect(stripMarkup('# Water on Earth')).toBe('Water on Earth')
  })
})

describe('the edits', () => {
  it('writes text as the field holds it, and the title of the question with it', () => {
    const content = quiz()
    const { byId } = outlineOf(content)
    const { params, applied, violations } = applyChanges(content.params, { t1: 'Water on Earth', t2: 'What <strong>drives</strong> evaporation & rain?', s2: true }, byId)
    expect(violations).toEqual([])
    expect(applied.map((change) => change.id)).toEqual(['t1', 't2', 's2'])
    expect(params.introPage.title).toBe('Water on Earth')
    expect(params.questions[0].params.question).toBe('<p>What <strong>drives</strong> evaporation &amp; rain?</p>')
    expect(params.questions[0].metadata.title).toBe('What drives evaporation &amp; rain?')
    expect(params.questions[0].params.answers[1].correct).toBe(true)
    // Untouched: the original, and the copy is a copy.
    expect(content.params.introPage.title).toBe('The water cycle')
  })

  it('refuses an <h1> in the title, with the rule, and applies nothing for it', () => {
    const content = quiz()
    const { byId } = outlineOf(content)
    const { params, applied, violations } = applyChanges(content.params, { t1: '<h1>Water on Earth</h1>' }, byId)
    expect(applied).toEqual([])
    expect(params.introPage.title).toBe('The water cycle')
    expect(violations).toEqual([{ id: 't1', label: `Title [${INLINE}]`, kind: 'format', problem: expect.stringContaining('Do not wrap the text in <h1>') }])
    // What the second try is told: the field, its format, the rule.
    expect(fixPrompt(violations)).toContain(`- t1 Title [${INLINE}]: Do not wrap the text in <h1>`)
  })

  it('refuses what a field refuses, by id and kind', () => {
    const content = quiz()
    const { byId } = outlineOf(content, { settings: true })
    const id = (label: string) => [...byId].find(([, node]) => node.label === label)![0]
    const { applied, violations } = applyChanges(content.params, { t99: 'x', s1: 'maybe', [id('Pass percentage')]: 120, [id('Progress indicator')]: 'bars', t1: '' }, byId)
    expect(violations.map(({ id, kind }) => [id, kind])).toEqual([['t99', 'id'], ['s1', 'value'], [id('Pass percentage'), 'value'], [id('Progress indicator'), 'value'], ['t1', 'format']])
    expect(violations[2].problem).toBe('At most 100.')
    expect(applied).toEqual([])
    expect(applyChanges(content.params, { [id('Pass percentage')]: 60 }, byId).applied).toEqual([{ id: id('Pass percentage'), label: 'Pass percentage', from: 50, to: 60 }])
  })

  it('keeps asterisks in a Fill in the Blanks line, with tags where the field allows them', () => {
    const content = contentFrom('blanks', { title: 'Words', sentences: [{ sentence: 'Evaporation is driven by the Sun.', answer: 'Sun' }] }, { pack })
    const { byId } = outlineOf(content)
    expect(applyChanges(content.params, { t1: 'Rivers flow to the sea.' }, byId).violations[0].problem).toMatch(/asterisks/)
    const { params } = applyChanges(content.params, { t1: 'Rivers <em>always</em> flow to the *sea*.' }, byId)
    expect(params.questions[0]).toBe('<p>Rivers <em>always</em> flow to the *sea*.</p>')
  })

  it('tells the model the formats, and holds the answer to the ids and their kinds', () => {
    const system = editSystem('de')
    expect(system).toContain('[text]: plain text only. No HTML tags')
    expect(system).toContain('Never use <p>, <div>, <br>, <h1> to <h6> or <a>')
    expect(system).toContain('The activity is in German')
    const content = quiz()
    const schema = editSchema(outlineOf(content, { settings: true }).byId)
    expect(schema.required).toEqual(['changes', 'reply'])
    expect(schema.properties.changes.additionalProperties).toBe(false)
    expect(Object.keys(schema.properties.changes.properties)).toContain('t10')
    expect(schema.properties.changes.properties.s1).toEqual({ type: 'boolean' })
    const progress = Object.values(schema.properties.changes.properties).find((each) => 'enum' in each)
    expect(progress).toEqual({ type: 'string', enum: ['textual', 'dots'] })
  })
})

describe('the working copy and the package', () => {
  it('reads what Create wrote, and plays an edit untrusted with the content check changing nothing', async () => {
    const content = quiz()
    const original = await packageFrom(content)
    const read = await readPackage(original)
    expect(read.mainLibrary).toBe(main(content))
    expect(read.params).toEqual(content.params)

    const { byId } = outlineOf(content)
    const { params, violations } = applyChanges(content.params, { t1: 'Water on Earth', t2: 'What <strong>drives</strong> H<sub>2</sub>O to evaporate?' }, byId)
    expect(violations).toEqual([])
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
