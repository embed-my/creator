import { expect, test } from '@playwright/test'

/*
 * The eval page with a stand-in model: the spine from the outline to the player works in every
 * engine, so a run with the real model measures the model and nothing else.
 */

/** A `LanguageModel` that changes the first text field of whatever outline it is given. */
function standIn() {
  Object.defineProperty(window, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (text: string) => {
          const line = /^t1 (.*?): (.*)$/m.exec(text)
          return JSON.stringify({ ops: [{ id: 't1', value: `EDITED ${line?.[2] ?? ''}` }], reply: 'Changed the first field.' })
        },
        inputQuota: 6000,
        inputUsage: 1200,
        destroy: () => {}
      })
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
  await expect(outline).toContainText('t1 Title: The water cycle')
  await expect.poll(() => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)).toBe('ready')

  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByRole('status')).toContainText('1 field(s) changed, 0 refused')
  await expect(outline).toContainText('t1 Title: EDITED The water cycle')
  await expect(page.locator('#applied li')).toHaveText(['t1 Title: The water cycle → EDITED The water cycle'])
  await expect(page.locator('#runs tbody tr')).toHaveCount(1)
  await expect(page.locator('#runs tbody tr td').nth(3)).toHaveText('1200/6000')

  await expect.poll(() => page.locator('h5p-player').evaluate((element: HTMLElement & { state?: string }) => element.state)).toBe('ready')
  await expect(page.frameLocator('h5p-player iframe').first().getByText('EDITED The water cycle')).toBeVisible()
  expect(problems, problems.join('\n')).toEqual([])
})
