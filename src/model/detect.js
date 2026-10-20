/**
 * Chrome's on-device language detector (`LanguageDetector`, Chrome 138 on the desktop, the same
 * browsers as the model), behind the small interface the app talks to. It says which language
 * the content reads in after an edit, so a translation is noticed by code and not only when the
 * model remembers to say so.
 *
 * - `session({ signal, onDownload })`: a detector, or `null` where there is none. The first one
 *   may download its model, which needs the click that asked, so it is made when the turn starts.
 * - `detector.detect(text)`: the languages it reads, most likely first, as `{ language,
 *   confidence }` with the language as a bare code (`de`, not `de-DE`). The docs warn that short
 *   texts are unreliable; callers send the content's whole text.
 */

export const languageDetector = {
  async session({ signal, onDownload } = {}) {
    const api = globalThis.LanguageDetector
    if (typeof api?.create !== 'function') return null
    try {
      if (typeof api.availability === 'function' && (await api.availability()) === 'unavailable') return null
      const detector = await api.create({
        signal,
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => onDownload?.(event.loaded))
        }
      })
      return {
        async detect(text) {
          const results = await detector.detect(text)
          return results.map((result) => ({ language: String(result.detectedLanguage).split('-')[0].toLowerCase(), confidence: Number(result.confidence) || 0 }))
        },
        destroy: () => detector.destroy?.()
      }
    } catch {
      return null
    }
  }
}
