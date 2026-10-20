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
