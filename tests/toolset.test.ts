import { execFile } from 'node:child_process'
import { openAsBlob } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildPackage, openPack } from '@missing-elements/h5p-author'
import { verifyPackage, summarize } from '@missing-elements/h5p-verify'
import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { editContent, openForEdit, outlineOf, pathOf } from '../src/edit/package-edit.js'
import { rewritePackage } from '../src/package/rewrite.js'
import { toModel } from '../src/semantics/dialects.js'
import { PARTS_DIR } from '../scripts/pack-parts.mjs'

/**
 * The agent toolset's editing commands (`toolset/h5p-edit.mjs` over `src/edit/package-edit.js`), on
 * packages h5p-author builds with their libraries and on one Create made without: ids that name
 * the same field whatever the outline shows; changes applied by id with nothing else changed —
 * every other file byte for byte, every sub-content id kept — and played untrusted with no change
 * from the content check; values a field does not take, and content h5p-author's build would not
 * write, refused with nothing written; problems a package already held counted, not refused.
 */

const run = promisify(execFile)
const AUTHORS = [{ name: 'Ann Author', role: 'Author' }]
const QUIZ = {
  type: 'H5P.QuestionSet',
  title: 'Rivers',
  language: 'en',
  license: 'CC BY',
  licenseVersion: '4.0',
  authors: AUTHORS,
  params: {
    passPercentage: 50,
    questions: [
      {
        library: 'H5P.MultiChoice',
        metadata: { title: 'The longest river' },
        params: { question: 'Which river is the longest in Europe?', answers: [{ text: 'Volga', correct: true }, { text: 'Danube', correct: false }] }
      },
      { library: 'H5P.TrueFalse', metadata: { title: 'The Rhine' }, params: { question: 'The Rhine flows into the North Sea.', correct: 'true' } }
    ]
  }
}
const SCENARIO = {
  type: 'H5P.BranchingScenario',
  title: 'Crossing the river',
  language: 'en',
  license: 'CC BY',
  licenseVersion: '4.0',
  authors: AUTHORS,
  params: {
    branchingScenario: {
      title: 'Crossing the river',
      startScreen: { startScreenTitle: 'Crossing the river', startScreenSubtitle: 'Choose a way across.' },
      content: [
        { type: { library: 'H5P.AdvancedText', params: { text: 'You reach a river after heavy rain.' } }, nextContentId: 1 },
        {
          type: {
            library: 'H5P.BranchingQuestion',
            params: { branchingQuestion: { question: 'How do you cross?', alternatives: [{ text: 'Wade across here', nextContentId: 2 }, { text: 'Walk to the bridge', nextContentId: 3 }] } }
          }
        },
        { type: { library: 'H5P.AdvancedText', params: { text: 'The current knocks you over.' } }, nextContentId: -1, feedback: { title: 'Swept away', endScreenScore: 0 } },
        { type: { library: 'H5P.AdvancedText', params: { text: 'You cross safely.' } }, nextContentId: -1, feedback: { title: 'Safely across', endScreenScore: 1 } }
      ],
      endScreens: [{ endScreenTitle: 'The end' }]
    }
  }
}

type Pack = Awaited<ReturnType<typeof openPack>>
type Opened = Awaited<ReturnType<typeof openForEdit>>
let pack: Pack
let dir: string
let quizFile: string
let scenarioFile: string

beforeAll(async () => {
  pack = await openPack()
  dir = await mkdtemp(join(tmpdir(), 'h5p-edit-'))
  quizFile = join(dir, 'quiz.h5p')
  scenarioFile = join(dir, 'scenario.h5p')
  await buildPackage(QUIZ, quizFile)
  await buildPackage(SCENARIO, scenarioFile)
})

afterAll(async () => {
  await pack?.close()
  await rm(dir, { recursive: true, force: true })
})

/** The id of the field at a path, as h5p-author's checks write paths. */
const idOf = (opened: Opened, path: string) => {
  const found = [...outlineOf(opened, { settings: true, empty: true }).byId].find(([, node]) => pathOf(node.path) === path)
  if (!found) throw new Error(`No field at ${path}`)
  return found[0]
}

/** Every entry of a package: its name, and its bytes as stored, compressed or not. */
async function stored(file: Blob) {
  const reader = new ZipReader(new BlobReader(file))
  const entries: Entry[] = await reader.getEntries()
  const all = []
  for (const entry of entries) {
    all.push({ name: entry.filename, crc: entry.directory ? 0 : entry.signature, bytes: entry.directory ? '' : Buffer.from(await (entry as FileEntry).getData(new Uint8ArrayWriter(), { passThrough: true })).toString('base64') })
  }
  const content = JSON.parse(await (entries.find((entry) => entry.filename === 'content/content.json') as FileEntry).getData(new TextWriter()))
  await reader.close()
  return { all, content }
}

async function plays(file: Blob, name: string, libraries?: string) {
  const path = join(dir, name)
  await writeFile(path, new Uint8Array(await file.arrayBuffer()))
  const report = await verifyPackage({ file: path, untrusted: true, settle: 1_000, ...(libraries ? { libraries } : {}) })
  expect(report.verdict, summarize(report)).toBe('pass')
  expect(report.contentCheck?.changes).toEqual([])
  expect(report.warnings).toEqual([])
}

describe('the outline', () => {
  it('names a field by the same id whatever it shows', async () => {
    const opened = await openForEdit(await openAsBlob(quizFile), pack)
    const words = outlineOf(opened).text
    const everything = outlineOf(opened, { settings: true, empty: true }).text
    const lines = (text: string) => text.split('\n').filter((line) => /^[ts]\d+ /.test(line))
    expect(lines(words).length).toBeLessThan(lines(everything).length)
    for (const line of lines(words)) expect(lines(everything)).toContain(line)
    expect(words).toContain('Which river is the longest in Europe?')
    expect(words).not.toContain('Pass percentage')
    expect(everything).toMatch(/s\d+ Pass percentage \(Percentage of Total score required for passing the quiz\.\) \[number 0-100\]: 50/)
  })

  it('carries the revision of the content it was read from', async () => {
    const source = await openAsBlob(quizFile)
    const opened = await openForEdit(source, pack)
    expect(opened.revision).toMatch(/^[0-9a-f]{12}$/)
    expect((await openForEdit(source, pack)).revision).toBe(opened.revision)
    const changed = await rewritePackage(source, { params: { ...opened.params, passPercentage: 60 } })
    expect((await openForEdit(changed, pack)).revision).not.toBe(opened.revision)
  })
})

describe('apply', () => {
  it('changes the fields named and nothing else, and the package plays as a site would save it', async () => {
    const source = await openAsBlob(quizFile)
    const opened = await openForEdit(source, pack)
    const question = idOf(opened, 'params.questions[0].params.question')
    const danube = idOf(opened, 'params.questions[0].params.answers[1].text')
    const correct = idOf(opened, 'params.questions[1].params.correct')
    const result = editContent(opened, { [question]: 'Which river is <em>the longest</em> in Europe?', [danube]: 'The Danube', [correct]: 'false' })
    expect(result.violations).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.note).toBe('Changed 2 of 10 text fields and 1 of 34 other fields.')

    const edited = await rewritePackage(source, { params: result.params })
    const before = await stored(source)
    const after = await stored(edited)
    expect(after.all.map((entry) => entry.name)).toEqual(before.all.map((entry) => entry.name))
    expect(after.all.filter((entry) => entry.name !== 'content/content.json')).toEqual(before.all.filter((entry) => entry.name !== 'content/content.json'))

    const params = after.content
    const format = { html: true, tags: ['strong', 'em', 'sub', 'sup', 'code'], blanks: false }
    expect(toModel(params.questions[0].params.question, format)).toBe('Which river is <em>the longest</em> in Europe?')
    expect(params.questions[0].metadata.title).toBe('Which river is the longest in Europe?')
    expect(params.questions[1].params.correct).toBe('false')
    // Undo the three changes and the title that follows the question: what is left is the package as it was.
    const restored = structuredClone(params)
    restored.questions[0].params.question = before.content.questions[0].params.question
    restored.questions[0].metadata.title = before.content.questions[0].metadata.title
    restored.questions[0].params.answers[1].text = before.content.questions[0].params.answers[1].text
    restored.questions[1].params.correct = before.content.questions[1].params.correct
    expect(restored).toEqual(before.content)

    await plays(edited, 'quiz-edited.h5p')
  })

  it('refuses what a field does not take, by id and kind', async () => {
    const opened = await openForEdit(await openAsBlob(quizFile), pack)
    const volga = idOf(opened, 'params.questions[0].params.answers[0].text')
    const pass = idOf(opened, 'params.passPercentage')
    const result = editContent(opened, { [volga]: '<a href="https://example.org">Volga</a>', t999: 'Somewhere', [pass]: 150 })
    expect(result.violations.map(({ id, kind }) => [id, kind])).toEqual([
      [volga, 'format'],
      ['t999', 'id'],
      [pass, 'value']
    ])
    expect(result.violations[0].problem).toContain('<a> is not one of them')
  })

  it("refuses content h5p-author's build would not write: a path to a node that is not there", async () => {
    const opened = await openForEdit(await openAsBlob(scenarioFile), pack)
    const next = idOf(opened, 'params.branchingScenario.content[1].type.params.branchingQuestion.alternatives[0].nextContentId')
    const result = editContent(opened, { [next]: 9 })
    expect(result.violations).toEqual([])
    expect(result.problems).toEqual([{ id: next, path: 'params.branchingScenario.content[1].type.params.branchingQuestion.alternatives[0].nextContentId', message: 'is 9, but content has 4 nodes, 0 to 3' }])
    expect(result.notes.map(({ message }) => message)).toContain('is not reached from the first node, so no learner sees it')
  })

  it('counts the problems a package already held, and holds only new ones against a change', async () => {
    const source = await openAsBlob(quizFile)
    const opened = await openForEdit(source, pack)
    const params = structuredClone(opened.params)
    params.questions[0].params.writtenByAnOlderEditor = true
    const held = await openForEdit(await rewritePackage(source, { params }), pack)
    const result = editContent(held, { [idOf(held, 'params.questions[0].params.answers[0].text')]: 'The Volga' })
    expect(result.known).toBe(1)
    expect(result.problems).toEqual([])
    expect(result.params.questions[0].params.writtenByAnOlderEditor).toBe(true)
  })

  it("edits a package Create made, which carries no libraries, from the pack's", async () => {
    const answer = { title: 'Clouds', statements: [{ statement: 'Rain falls upwards.', isTrue: false, explanation: 'Gravity pulls it down.' }] }
    const source = await packageFrom(await contentFrom('true-false', answer, { pack, language: 'de' }))
    const opened = await openForEdit(source, pack)
    expect(opened.language).toBe('de')
    const statement = idOf(opened, 'params.questions[0].params.question')
    const result = editContent(opened, { [statement]: 'Regen fällt nach oben.' })
    expect([result.violations, result.problems, result.known]).toEqual([[], [], 0])
    await plays(await rewritePackage(source, { params: result.params }), 'create-edited.h5p', PARTS_DIR)
  })
})

describe('what real packages taught (2026-11-03)', () => {
  const RIVERS = { title: 'Rivers', language: 'en', license: 'CC BY', licenseVersion: '4.0', authors: AUTHORS }

  it("keeps a Drag the Words text's lines and its blanks", async () => {
    const file = join(dir, 'words.h5p')
    await buildPackage({ ...RIVERS, type: 'H5P.DragText', params: { textField: 'The *Danube* flows east.\nThe *Rhine* flows north.' } }, file)
    const source = await openAsBlob(file)
    const opened = await openForEdit(source, pack)
    const text = idOf(opened, 'params.textField')
    expect(outlineOf(opened).text).toContain(`${text} Text [text; blank: *word*]: "The *Danube* flows east.\\nThe *Rhine* flows north."`)
    // A line's words changed, and the line break between the two kept, as H5P's editor keeps it.
    const result = editContent(opened, { [text]: 'The *Danube* flows east, to the Black Sea.\nThe *Rhine* flows north.' })
    expect(result.violations).toEqual([])
    expect(result.params.textField).toBe('The *Danube* flows east, to the Black Sea.\nThe *Rhine* flows north.')
    // Without its asterisks the text would play with nothing to drag: refused.
    expect(editContent(opened, { [text]: 'The Danube flows east.\nThe Rhine flows north.' }).violations.map(({ id, problem }) => [id, problem])).toEqual([[text, 'The answer must stay between asterisks, like *this*.']])
    await plays(await rewritePackage(source, { params: result.params }), 'words-edited.h5p')
  })

  it('keeps the words a Mark the Words text marks', async () => {
    const file = join(dir, 'marks.h5p')
    await buildPackage({ ...RIVERS, type: 'H5P.MarkTheWords', params: { taskDescription: 'Click the verbs.', textField: 'Rivers *flow* to the sea and *carry* sand.' } }, file)
    const opened = await openForEdit(await openAsBlob(file), pack)
    const text = idOf(opened, 'params.textField')
    expect(outlineOf(opened).text).toContain(`${text} Textfield [html: strong em code; marked: *word*]: "Rivers *flow* to the sea and *carry* sand."`)
    expect(editContent(opened, { [text]: 'Rivers flow to the sea and carry sand.' }).violations.map(({ id, problem }) => [id, problem])).toEqual([[text, 'The words to mark must stay between asterisks, like *this*.']])
    expect(editContent(opened, { [text]: 'Rivers *flow* to the sea and *bring* sand.' }).violations).toEqual([])
  })
})

describe('the command line', () => {
  const command = join(import.meta.dirname, '..', 'toolset', 'h5p-edit.mjs')
  const h5pEdit = (...args: string[]) => run(process.execPath, [command, ...args]).then(
    ({ stdout }) => ({ code: 0, stdout }),
    (error: { code: number, stdout: string, stderr: string }) => ({ code: error.code, stdout: error.stdout + error.stderr })
  )

  it('outlines, applies, and never writes over a file', async () => {
    const outlined = await h5pEdit('outline', quizFile)
    expect(outlined.code).toBe(0)
    const revision = /revision ([0-9a-f]{12})/.exec(outlined.stdout)?.[1]
    expect(revision).toBeDefined()
    const question = /^(t\d+) +Question \[html[^\]]*\]: "Which river/m.exec(outlined.stdout)?.[1]
    expect(question).toBeDefined()

    const changes = join(dir, 'changes.json')
    const out = join(dir, 'quiz-cli.h5p')
    await writeFile(changes, JSON.stringify({ revision, changes: { [question!]: 'Which river is the longest in the EU?' } }))
    const applied = await h5pEdit('apply', quizFile, changes, out)
    expect(applied.code, applied.stdout).toBe(0)
    expect(applied.stdout).toContain('Changed 1 of 10 text fields.')
    expect((await stored(await openAsBlob(out))).content.questions[0].params.question).toContain('the longest in the EU?')

    const again = await h5pEdit('apply', quizFile, changes, out)
    expect([again.code, again.stdout]).toEqual([1, `${out} is there already: give the package a new name.\n`])

    await writeFile(changes, JSON.stringify({ revision: '000000000000', changes: { [question!]: 'x' } }))
    const stale = await h5pEdit('apply', quizFile, changes, join(dir, 'quiz-stale.h5p'))
    expect(stale.code).toBe(1)
    expect(stale.stdout).toContain('is not the package outlined')

    expect((await h5pEdit('outline')).code).toBe(2)
    expect(JSON.parse((await readFile(changes, 'utf8'))).revision).toBe('000000000000')
  })
})
