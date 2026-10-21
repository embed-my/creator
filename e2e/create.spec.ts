import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { readAuthoringPack } from '../scripts/authoring-pack.mjs'
import { MODEL, modelServer, type ChatRequest } from './model-server.js'

/*
 * The app in a real browser, with a stand-in model server on LM Studio's port: the app finds it,
 * Create asks it, the answer becomes a package that plays, and Save downloads that package. With
 * no server, the app says how to get one and still opens and plays a file.
 */

/** What the stand-in answers, by the list its schema asks for. */
const ANSWERS: Record<string, unknown> = {
  questions: {
    title: 'The water cycle',
    questions: [
      {
        question: 'What drives evaporation?',
        answers: [
          { text: 'The sun', correct: true, feedback: 'Its heat turns water into vapour.' },
          { text: 'The moon', correct: false, feedback: 'The moon moves tides, not vapour.' }
        ]
      }
    ]
  },
  statements: {
    title: 'Clouds',
    statements: [{ statement: 'Clouds are made of water droplets.', isTrue: true, explanation: 'Vapour condenses into droplets.' }]
  },
  sentences: {
    title: 'Words of the water cycle',
    sentences: [{ sentence: 'Water vapour cools and forms clouds.', answer: 'clouds' }]
  },
  cards: {
    title: 'Terms',
    cards: [{ front: 'Evaporation', back: 'Water turning into vapour.' }]
  }
}

/** Each kind: its label in the dialog, the list it asks for, what it shows once it plays, and the file Save names. */
const KINDS = [
  { label: 'Quiz', kind: 'quiz', list: 'questions', shows: 'What drives evaporation?', file: 'The-water-cycle.h5p' },
  { label: 'True or false', kind: 'true-false', list: 'statements', shows: 'Clouds are made of water droplets.', file: 'Clouds.h5p' },
  { label: 'Fill in the blanks', kind: 'blanks', list: 'sentences', shows: 'Water vapour cools and forms', file: 'Words-of-the-water-cycle.h5p' },
  { label: 'Flashcards', kind: 'cards', list: 'cards', shows: 'Evaporation', file: 'Terms.h5p' }
]

const pack = readAuthoringPack()

const TEXT = 'The sun heats water in rivers and seas, and it evaporates. The vapour rises, cools and condenses into clouds.'

/** Answers from `answers` by the list the request's schema asks for. */
const byList = (answers: Record<string, unknown>) => (request: ChatRequest) => {
  const list = Object.keys(request.response_format!.json_schema!.schema.properties).find((key) => key !== 'title')!
  return JSON.stringify(answers[list])
}

/** Fails the test on anything the page throws or logs as an error, but a port refusing while the app looks for servers. */
function watchConsole(page: Page, refusal: (message: ConsoleMessage) => boolean): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !refusal(message)) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  return problems
}

const playerState = (page: Page) => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)

for (const kind of KINDS) {
  test(`Create makes ${kind.label.toLowerCase()} that plays, and Save downloads it`, async ({ page }) => {
    const { asked, refusal } = await modelServer(page, byList(ANSWERS))
    const problems = watchConsole(page, refusal)
    await page.goto('/')
    await expect(page.getByRole('button', { name: `Model: ${MODEL}` })).toBeVisible()

    await page.getByRole('button', { name: 'Create from your text' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create from your text' })
    await dialog.getByLabel('Your text').fill(TEXT)
    await dialog.getByLabel(kind.label).check()
    await dialog.getByLabel('Language').selectOption('de')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect.poll(() => playerState(page)).toBe('ready')
    const frame = page.frameLocator('h5p-player iframe').first()
    const { params } = contentFrom(kind.kind, ANSWERS[kind.list], { pack: await pack, language: 'de' })
    // A Question Set opens on its cover, with Start in the content's language.
    if (params.introPage?.showIntroPage) await frame.getByRole('button', { name: params.introPage.startButtonText }).click()
    await expect(frame.getByText(kind.shows).first()).toBeVisible()

    // The model found, asked once, in the language chosen, with the teacher's text and the kind's shape.
    expect(asked).toHaveLength(1)
    expect(asked[0].model).toBe(MODEL)
    expect(asked[0].messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('Write everything in German') })
    expect(asked[0].messages[1]).toMatchObject({ role: 'user', content: expect.stringContaining(TEXT) })
    expect(asked[0].response_format?.type).toBe('json_schema')
    expect(Object.keys(asked[0].response_format!.json_schema!.schema.properties)).toContain(kind.list)

    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Save' }).click()
    expect((await download).suggestedFilename()).toBe(kind.file)
    expect(problems, problems.join('\n')).toEqual([])
  })
}

test('Create says so when the model wrote nothing usable', async ({ page }) => {
  await modelServer(page, byList({ ...ANSWERS, questions: { title: 'Empty', questions: [] } }))
  await page.goto('/')

  await page.getByRole('button', { name: 'Create from your text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create from your text' })
  await dialog.getByLabel('Your text').fill(TEXT)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(dialog.getByRole('status')).toHaveText('The model wrote nothing that could be used. Try again, or with a longer text.')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Your text')).toBeEnabled()
})

test('with no model server, the app says how to get one, and still plays a file', async ({ page }) => {
  const { refusal } = await modelServer(page, null)
  const problems = watchConsole(page, refusal)
  await page.goto('/')

  await expect(page.getByText('Creating needs a model server on this computer')).toBeVisible()
  // Create asks for a model first, and the Model dialog says none answers.
  await page.getByRole('button', { name: 'Create from your text' }).click()
  const models = page.getByRole('dialog', { name: 'Model' })
  await expect(models.getByRole('status')).toContainText('No model server answers on the usual ports')
  await models.getByRole('button', { name: 'Cancel' }).click()
  await expect(models).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Create from your text' })).toBeHidden()

  const content = contentFrom('cards', ANSWERS.cards, { pack: await pack })
  const file = await packageFrom(content)
  await page.locator('#file').setInputFiles({ name: file.name, mimeType: 'application/zip', buffer: Buffer.from(await file.arrayBuffer()) })

  await expect.poll(() => playerState(page)).toBe('ready')
  await expect(page.frameLocator('h5p-player iframe').first().getByText('Evaporation').first()).toBeVisible()
  // Not made here: nothing to save.
  await expect(page.getByRole('link', { name: 'Save' })).toBeHidden()
  expect(problems, problems.join('\n')).toEqual([])
})
