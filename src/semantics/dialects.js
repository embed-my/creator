/**
 * How a field's text is shown to the model and written back. The model never sees or writes
 * markup: a field with `tags` is shown as text with a small markdown subset — `**bold**`,
 * `*italics*`, a blank line between paragraphs — and the text it writes goes back through that
 * subset into the field's allowed tags, escaped first, so nothing the model writes is ever HTML.
 * A field without `tags` is plain text both ways, escaped as H5P's validator saves it.
 *
 * A dialect is a field whose text carries meaning the subset would read wrongly. Fill in the
 * Blanks marks the blank with asterisks, so in its lines asterisks are left alone, both ways.
 */

import { escapeHtml } from '../authoring.js'

/** The dialects by library, by the field's path in the semantics with list indexes left out. */
const DIALECTS = { 'H5P.Blanks': { 'questions[].question': 'blanks' } }

export function dialectFor(machineName, fieldPath) {
  return DIALECTS[machineName]?.[fieldPath] ?? 'default'
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * A field's value as the model reads it: the subset for markup, entities decoded, one trimmed text.
 * @param {unknown} html
 * @param {{ tags?: boolean, dialect?: string }} [options] `tags`: whether the field holds markup
 */
export function toText(html, { tags = false, dialect = 'default' } = {}) {
  let text = String(html ?? '')
  if (tags) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
    if (dialect === 'default') text = text.replace(/<\/?(strong|b)(\s[^>]*)?>/gi, '**').replace(/<\/?(em|i)(\s[^>]*)?>/gi, '*')
    text = text.replace(/<[^>]+>/g, '')
  }
  return decode(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The model's text as the field holds it. A plain text field gets one escaped line. A field
 * with tags gets the subset rendered into those of its tags it names, and paragraphs wrapped as
 * the field's previous value wrapped them — `<p>` with its attributes kept, or `<div>` — since
 * H5P's validator allows those wrappers in every html field whatever its tags.
 * @param {unknown} text
 * @param {{ tags?: string[] | null, dialect?: string, previous?: string }} [options] `tags`: the field's, or none for plain text
 */
export function toHtml(text, { tags = null, dialect = 'default', previous = '' } = {}) {
  const plain = String(text ?? '').replace(/\r\n?/g, '\n').trim()
  if (!Array.isArray(tags)) return escapeHtml(plain.replace(/\s*\n\s*/g, ' '))
  const allowed = new Set(tags)
  const inline = (paragraph) => {
    let out = escapeHtml(paragraph)
    if (dialect === 'default') {
      if (allowed.has('strong')) out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      if (allowed.has('em')) out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    }
    return out.replace(/\n/g, '<br>')
  }
  const paragraphs = plain.split(/\n\s*\n/).map(inline)
  const wrap = /^\s*<(p|div)(\s[^>]*)?>/i.exec(previous)
  if (!wrap) return paragraphs.join('<br><br>')
  const [, tag, attrs = ''] = wrap
  return paragraphs.map((paragraph) => `<${tag}${attrs}>${paragraph}</${tag}>`).join('')
}

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(number) ? String.fromCodePoint(number) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}
