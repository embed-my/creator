/**
 * Chrome's on-device model, through the Prompt API (`LanguageModel`, on the web since Chrome
 * 148, on the desktop), behind the one small interface the app talks to. Nothing else in the
 * app touches `LanguageModel`: another model plugs in here.
 *
 * - `availability(language)`: `available`, `downloadable`, `downloading` or `unavailable`,
 *   asked with the same options a session is made with, as the API wants.
 * - `session({ system, language, signal, onDownload })`: a session with the rules as its system
 *   prompt. The first session downloads the model, from the click that asked, and reports its
 *   progress as a fraction.
 * - `session.prompt(text, { schema, signal })`: the answer, held to the JSON schema.
 * - `session.quota()`: tokens used and allowed, where the API says.
 */

/**
 * The options for a language: the instructions are English, the content and the answer in the
 * language chosen.
 */
export function languageOptions(language) {
  return {
    expectedInputs: [{ type: 'text', languages: [...new Set(['en', language])] }],
    expectedOutputs: [{ type: 'text', languages: [language] }]
  }
}

export const nano = {
  name: "Chrome's built-in model",

  async availability(language = 'en') {
    const model = globalThis.LanguageModel
    if (typeof model?.availability !== 'function') return 'unavailable'
    try {
      return await model.availability(languageOptions(language))
    } catch {
      return 'unavailable'
    }
  },

  async session({ system, language = 'en', signal, onDownload } = {}) {
    const session = await globalThis.LanguageModel.create({
      ...languageOptions(language),
      initialPrompts: system ? [{ role: 'system', content: system }] : [],
      signal,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => onDownload?.(event.loaded))
      }
    })
    return {
      prompt: (text, { schema, signal: own } = {}) => session.prompt(text, { ...(schema ? { responseConstraint: schema } : {}), signal: own ?? signal }),
      quota: () => (typeof session.inputQuota === 'number' ? { used: session.inputUsage ?? 0, total: session.inputQuota } : null),
      measure: (text) => (typeof session.measureInputUsage === 'function' ? session.measureInputUsage(text) : Promise.resolve(null)),
      destroy: () => session.destroy()
    }
  }
}
