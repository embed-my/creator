/**
 * Another language for the content. Its own words are the model's to translate; the content
 * type's words — its buttons, messages and labels, the defaults each library brings in each
 * language from its `language/<code>.json` — are code's. When an edit puts the content into
 * another language, every text field still holding the old language's default is given the new
 * language's, escaped as `Author` writes defaults, and `h5p.json` says the new language: what
 * H5P's editor does when a content's language is changed. A default an author changed is theirs
 * and is left alone.
 *
 * Whether the content is in another language is code's to decide too (`decideLanguage`): the
 * language detector reads the content's words after the edit (`contentTexts`), and the language
 * the model states counts only where there is no detector, or where the detector leans the same
 * way. A small model forgets to mention a translation; the text itself does not.
 */

import { ContentGenerator } from '../../scripts/sweep-content.mjs'
import { LANGUAGES, packFor } from '../authoring.js'
import { contentModel } from '../semantics/content-model.js'
import { escapeHtml, stripMarkup } from '../semantics/dialects.js'

/** How sure the detector must be to change the content's language on its word alone. */
export const DETECTION_CONFIDENCE = 0.8
/** Below this many characters of content, the detector is not asked: the docs warn it is unreliable. */
export const DETECTION_MIN_LENGTH = 24

/**
 * The content's own words, as the detector reads them: every text field the outline shows,
 * without its tags and without the blank's asterisks, one per line.
 */
export function contentTexts(params, mainLibrary, pack, language) {
  return contentModel(params, mainLibrary, pack, language)
    .filter((node) => node.kind === 'text' && node.content)
    .map((node) => stripMarkup(node.text ?? '').replace(/\*/g, ''))
    .join('\n')
}

/**
 * The content's language after an edit.
 * @param {{ current: string, stated?: unknown, detected?: { language: string, confidence: number }[] | null }} input
 *   `stated`: what the model said; `detected`: what the detector read, `null` or left out where
 *   there is no detector or too little text
 * @returns {{ language: string, by: 'detected' | 'stated' | 'stated and detected' | 'kept' }}
 */
export function decideLanguage({ current, stated, detected }) {
  const known = (code) => typeof code === 'string' && code in LANGUAGES
  const top = detected?.[0]
  if (top && known(top.language) && top.confidence >= DETECTION_CONFIDENCE) {
    return { language: top.language, by: top.language === current ? 'kept' : 'detected' }
  }
  if (!detected) return known(stated) && stated !== current ? { language: /** @type {string} */ (stated), by: 'stated' } : { language: current, by: 'kept' }
  // The detector is unsure, as with mixed text: the model's word counts where the detector leans the same way.
  if (known(stated) && stated !== current && top?.language === stated) return { language: /** @type {string} */ (stated), by: 'stated and detected' }
  return { language: current, by: 'kept' }
}

/**
 * @param {any} params
 * @param {string} mainLibrary `H5P.QuestionSet 1.21`
 * @param {{ libraries: any[] }} pack
 * @param {string} from the content's language
 * @param {string} to the new one
 * @returns {{ params: any, relabelled: number }}
 */
export function relabel(params, mainLibrary, pack, from, to) {
  const next = structuredClone(params)
  if (from === to) return { params: next, relabelled: 0 }
  const before = new ContentGenerator(packFor(pack, from))
  const after = new ContentGenerator(packFor(pack, to))
  let relabelled = 0

  const find = (generator, library) => {
    const match = /^(\S+) (\d+)\.(\d+)$/.exec(library ?? '')
    return match ? generator.find(match[1], Number(match[2])) : null
  }

  // The two sets of semantics differ only in their words, so they are walked side by side.
  const fields = (old, now, object) => {
    if (!object || typeof object !== 'object') return
    old.forEach((field, index) => walk(field, now[index], object, field.name))
  }
  const walk = (old, now, parent, key) => {
    const value = parent[key]
    switch (old.type) {
      case 'group': {
        const children = old.fields ?? []
        if (children.length === 1 && !old.isSubContent) return walk(children[0], now.fields[0], parent, key)
        return fields(children, now.fields ?? [], value)
      }
      case 'list':
        if (Array.isArray(value)) value.forEach((_, index) => walk(old.field, now.field, value, index))
        return
      case 'library': {
        if (!value || typeof value.library !== 'string') return
        const was = find(before, value.library)
        const is = find(after, value.library)
        if (was && is) fields(was.semantics, is.semantics, value.params)
        return
      }
      case 'text': {
        if (typeof value !== 'string' || typeof old.default !== 'string' || typeof now.default !== 'string') return
        const plain = !Array.isArray(old.tags)
        const saved = (text) => (plain ? escapeHtml(text, { keepReferences: true }) : text)
        if (value !== saved(old.default) && value !== old.default) return
        const replacement = saved(now.default)
        if (replacement !== value) {
          parent[key] = replacement
          relabelled++
        }
      }
    }
  }

  const main = find(before, mainLibrary)
  const mainNow = find(after, mainLibrary)
  if (main && mainNow) fields(main.semantics, mainNow.semantics, next)
  return { params: next, relabelled }
}
