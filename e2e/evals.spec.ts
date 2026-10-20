import { expect, test } from '@playwright/test'

/*
 * The eval page with a stand-in model: the spine from the outline to the player works in every
 * engine, so a run with the real model measures the model and nothing else.
 */

/**
 * A `LanguageModel` that changes the first text field of whatever outline it is given: first in
 * an <h1>, which the title's format does not allow, and, asked again, as the text alone. It
 * keeps the schemas it was given, to check that the ids are the only keys.
 */
function standIn() {
  const schemas: unknown[] = []
  Object.defineProperty(window, '__schemas', { value: schemas })
  Object.defineProperty(window, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => 'available',
      create: async () => {
        let first: string | null = null
        return {
          prompt: async (text: string, options: { responseConstraint?: unknown }) => {
            // The request is read first: not a translation.
            if (text.includes('translateTo')) return JSON.stringify({ translateTo: 'none' })
            schemas.push(options.responseConstraint)
            if (first === null) {
              first = JSON.parse(/^t1 [^[\n]*\[[^\]]*\]: (".*")$/m.exec(text)?.[1] ?? '""')
              return JSON.stringify({ changes: { t1: `<h1>EDITED ${first}</h1>` }, reply: 'Changed the title.' })
            }
            return JSON.stringify({ changes: { t1: `EDITED ${first}` }, reply: 'Changed the title, as text.' })
          },
          contextWindow: 6000,
          contextUsage: 1200,
          destroy: () => {}
        }
      }
    }
  })
}

test('a run edits the outline, plays the result and logs the run', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
  await page.addInitScript(standIn)
  await page.goto('/evals/')

  const outline = page.getByLabel('The outline the model reads')
  await expect(outline).toContainText('t1 Title [html: strong em sub sup code]: "The water cycle"')
  await expect.poll(() => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)).toBe('ready')

  await page.getByRole('button', { name: 'Run' }).click()
  // The <h1> is refused and counted, and the second try is applied.
  await expect(page.getByRole('status')).toContainText('1 field(s) changed, 0 refused, 1 format break(s) on the first try')
  await expect(outline).toContainText('t1 Title [html: strong em sub sup code]: "EDITED The water cycle"')
  await expect(page.locator('#applied li')).toHaveText(['t1 Title: The water cycle → EDITED The water cycle'])
  await expect(page.locator('#runs tbody tr')).toHaveCount(1)
  const cells = page.locator('#runs tbody tr td')
  await expect(cells.nth(2)).toContainText('(2 tries)')
  await expect(cells.nth(3)).toHaveText('1200/6000')
  await expect(cells.nth(6)).toHaveText('1')
  await expect(cells.nth(7)).toHaveText('strict')

  // The schema's only keys are the outline's ids, each with its kind of value.
  const schema = await page.evaluate(() => (window as unknown as { __schemas: { properties: { changes: { properties: Record<string, { type: string }>; additionalProperties: boolean } } }[] }).__schemas[0])
  expect(schema.properties.changes.additionalProperties).toBe(false)
  expect(schema.properties.changes.properties.t1).toEqual({ type: 'string' })
  expect(schema.properties.changes.properties.s1).toEqual({ type: 'boolean' })

  await expect.poll(() => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)).toBe('ready')
  await expect(page.frameLocator('h5p-player iframe').first().getByText('EDITED The water cycle')).toBeVisible()
  expect(problems, problems.join('\n')).toEqual([])
})

/**
 * A `LanguageModel` asked for the activity in German. Asked whether the request wants another
 * language, it answers `intent`. Asked to translate a batch, it gives every field back as
 * "Auf Deutsch: …", the title as "Der Wasserkreislauf", and keeps the schemas it was given. As
 * an ordinary edit (where `intent` is "none"), it translates every field all the same. Where
 * `detector` is set, a `LanguageDetector` reads German in any text holding "Auf Deutsch".
 */
function translator({ intent, detector }: { intent: string; detector: boolean }) {
  const schemas: unknown[] = []
  Object.defineProperty(window, '__schemas', { value: schemas })
  const german = (text: string) => {
    const changes: Record<string, string> = {}
    for (const [, id, value] of text.matchAll(/^(t\d+) [^[\n]*\[[^\]]*\]: (".*")$/gm)) changes[id] = id === 't1' ? 'Der Wasserkreislauf' : `Auf Deutsch: ${JSON.parse(value)}`
    return changes
  }
  Object.defineProperty(window, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (text: string, options: { responseConstraint?: unknown }) => {
          if (text.includes('translateTo')) return JSON.stringify({ translateTo: intent })
          schemas.push(options.responseConstraint)
          if (text.startsWith('Translate each of these fields')) return JSON.stringify({ changes: german(text) })
          return JSON.stringify({ changes: german(text), reply: 'Ich habe alles übersetzt.' })
        },
        contextWindow: 6000,
        contextUsage: 900,
        destroy: () => {}
      })
    }
  })
  if (!detector) return
  Object.defineProperty(window, 'LanguageDetector', {
    configurable: true,
    value: {
      availability: async () => 'available',
      create: async () => ({
        detect: async (text: string) => (text.includes('Auf Deutsch') ? [{ detectedLanguage: 'de', confidence: 0.97 }, { detectedLanguage: 'en', confidence: 0.02 }] : [{ detectedLanguage: 'en', confidence: 0.99 }]),
        destroy: () => {}
      })
    }
  })
}

for (const { name, intent, detector, status, column } of [
  { name: 'asked for, every field is translated in batches', intent: 'de', detector: true, status: '20 of 20 field(s) translated in 2 batch(es)', column: 'en → de (asked; 2 batch(es); detector de 0.97)' },
  { name: 'asked for, it needs no detector', intent: 'de', detector: false, status: '20 of 20 field(s) translated in 2 batch(es)', column: 'en → de (asked; 2 batch(es); no detector)' },
  { name: 'translated in an ordinary edit, the detector notices', intent: 'none', detector: true, status: 'Language en → de (detected)', column: 'en → de (edit; detected; detector de 0.97)' }
]) {
  test(`a translation takes the buttons into the new language: ${name}`, async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(error.message))
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
    await page.addInitScript(translator, { intent, detector })
    await page.goto('/evals/')
    await page.getByLabel('Task').selectOption({ label: 'Translate to German' })
    const frame = () => page.frameLocator('h5p-player iframe').first()
    await expect(frame().getByRole('button', { name: 'Start Quiz' })).toBeVisible()
    await expect(page.locator('h5p-player')).toHaveAttribute('lang', 'en')

    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByRole('status')).toContainText(status)
    await expect(page.locator('#runs tbody tr td').nth(8)).toHaveText(column)
    // Every field in German, and the content type's words and H5P's own with them.
    await expect(page.getByLabel('The outline the model reads')).not.toContainText(/: "(?!Auf Deutsch|Der Wasserkreislauf)/)
    await expect(page.locator('h5p-player')).toHaveAttribute('lang', 'de')
    await expect(frame().getByText('Der Wasserkreislauf')).toBeVisible()
    await expect(frame().getByRole('button', { name: 'Quiz starten' })).toBeVisible()
    await expect(page.getByLabel('The system prompt')).toContainText('The activity is in German')

    if (intent !== 'none') {
      // Each batch's schema requires every field of the batch: none can be left out.
      const batches = await page.evaluate(() => (window as unknown as { __schemas: { properties: { changes: { properties: object; required: string[] } } }[] }).__schemas)
      expect(batches).toHaveLength(2)
      for (const schema of batches) expect(schema.properties.changes.required).toEqual(Object.keys(schema.properties.changes.properties))
      expect(batches.flatMap((schema) => schema.properties.changes.required)).toHaveLength(20)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
}
