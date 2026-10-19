import { expect, test, type Page } from '@playwright/test'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { readAuthoringPack } from '../scripts/authoring-pack.mjs'

/*
 * The app in a real browser, with a stand-in for Chrome's model: Create asks it, the answer
 * becomes a package that plays, and Save downloads that package. Without the model, the app still
 * opens and plays a file.
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

/**
 * `LanguageModel` as Chrome has it, answering from `answers` by the list the schema asks for, and
 * keeping what it was asked in `__model`. In every document, the content's frame too.
 */
function standIn(answers: Record<string, unknown>) {
  const asked: { options: unknown; prompts: string[] } = { options: null, prompts: [] }
  Object.defineProperty(window, '__model', { value: asked })
  Object.defineProperty(window, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => 'available',
      create: async (options: { expectedInputs: unknown; expectedOutputs: unknown; initialPrompts: unknown }) => {
        asked.options = { expectedInputs: options.expectedInputs, expectedOutputs: options.expectedOutputs, initialPrompts: options.initialPrompts }
        return {
          prompt: async (text: string, { responseConstraint }: { responseConstraint: { properties: Record<string, unknown> } }) => {
            asked.prompts.push(text)
            const list = Object.keys(responseConstraint.properties).find((key) => key !== 'title')!
            return JSON.stringify(answers[list])
          },
          destroy: () => {}
        }
      }
    }
  })
}

/** Fails the test on anything the page throws or logs as an error. */
function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  return problems
}

const playerState = (page: Page) => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)

for (const kind of KINDS) {
  test(`Create makes ${kind.label.toLowerCase()} that plays, and Save downloads it`, async ({ page }) => {
    const problems = watchConsole(page)
    await page.addInitScript(standIn, ANSWERS)
    await page.goto('/')

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

    // Asked in the language chosen, with the teacher's text.
    const asked = await page.evaluate(() => (window as unknown as { __model: { options: { expectedOutputs: unknown }; prompts: string[] } }).__model)
    expect(asked.options.expectedOutputs).toEqual([{ type: 'text', languages: ['de'] }])
    expect(asked.prompts).toHaveLength(1)
    expect(asked.prompts[0]).toContain(TEXT)

    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Save' }).click()
    expect((await download).suggestedFilename()).toBe(kind.file)
    expect(problems, problems.join('\n')).toEqual([])
  })
}

test('Create says so when the model wrote nothing usable', async ({ page }) => {
  await page.addInitScript(standIn, { ...ANSWERS, questions: { title: 'Empty', questions: [] } })
  await page.goto('/')

  await page.getByRole('button', { name: 'Create from your text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create from your text' })
  await dialog.getByLabel('Your text').fill(TEXT)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(dialog.getByRole('status')).toHaveText('The model wrote nothing that could be used. Try again, or with a longer text.')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Your text')).toBeEnabled()
})

test('without the model, the app offers no Create and still plays a file', async ({ page }) => {
  const problems = watchConsole(page)
  await page.addInitScript(() => Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined }))
  await page.goto('/')

  await expect(page.getByText('Creating needs desktop Chrome 148 or later')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create from your text' })).toBeHidden()

  const content = contentFrom('cards', ANSWERS.cards, { pack: await pack })
  const file = await packageFrom(content)
  await page.locator('#file').setInputFiles({ name: file.name, mimeType: 'application/zip', buffer: Buffer.from(await file.arrayBuffer()) })

  await expect.poll(() => playerState(page)).toBe('ready')
  await expect(page.frameLocator('h5p-player iframe').first().getByText('Evaporation').first()).toBeVisible()
  // Not made here: nothing to save.
  await expect(page.getByRole('link', { name: 'Save' })).toBeHidden()
  expect(problems, problems.join('\n')).toEqual([])
})
