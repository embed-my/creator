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
 * - `session.prompt(text, { schema, omitSchema, signal })`: the answer, held to the JSON schema.
 *   The API sends the schema to the model as part of the prompt unless `omitSchema` says the
 *   prompt already describes the answer.
 * - `session.quota()`: tokens used and the window's size. The API calls them `contextUsage` and
 *   `contextWindow`; Chrome before the rename called them `inputUsage` and `inputQuota`.
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
      prompt: (text, { schema, omitSchema = false, signal: own } = {}) =>
        session.prompt(text, { ...(schema ? { responseConstraint: schema, ...(omitSchema ? { omitResponseConstraintInput: true } : {}) } : {}), signal: own ?? signal }),
      quota: () => {
        const total = session.contextWindow ?? session.inputQuota
        const used = session.contextUsage ?? session.inputUsage
        return typeof total === 'number' ? { used: typeof used === 'number' ? used : 0, total } : null
      },
      destroy: () => session.destroy()
    }
  }
}
