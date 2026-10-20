/**
 * Where the model may write HTML and where it may not, by each field's own rule in its
 * semantics: the field's `tags`. A field without `tags` is plain text. A field with `tags` holds
 * markup, and the model may write the inline tags among them — bold, italics, underline,
 * strikethrough, sub- and superscript, code — and no others: no attributes, no headings, no
 * links, no paragraphs, which code writes as the field's previous value wrapped them.
 *
 * The rule is told to the model, not enforced behind its back: the outline names every field's
 * format (`describeFormat`), the system prompt defines the formats (`edit/prompt.js`), and text
 * that breaks its field's format is refused with the rule restated (`checkModelText`), for the
 * model to correct. Only Create, which has no second turn, strips markup as a guard
 * (`stripMarkup`).
 *
 * A dialect is a field whose text means more than its format: Fill in the Blanks marks the
 * blank with asterisks, which no format uses, so the two never collide.
 */

/** The tags the model may write, where a field's `tags` include them: they mark words, nothing more. */
export const INLINE_TAGS = ['strong', 'em', 'u', 'del', 'sub', 'sup', 'code']

/** Tags a model writes for one of those: taken as that one, since they mean the same. */
const SYNONYMS = { b: 'strong', i: 'em', s: 'del', strike: 'del' }

/** The dialects by library, by the field's path in the semantics with list indexes left out. */
const DIALECTS = { 'H5P.Blanks': { 'questions[].question': 'blanks' } }

export function dialectFor(machineName, fieldPath) {
  return DIALECTS[machineName]?.[fieldPath] ?? 'default'
}

/**
 * @typedef {{ html: boolean, tags: string[], blanks: boolean }} Format `html`: the field holds
 *   markup; `tags`: the inline tags the model may write in it; `blanks`: a Fill in the Blanks line
 */

/** A text field's format, from its semantics. */
export function formatOf(field, dialect = 'default') {
  const html = Array.isArray(field?.tags)
  return { html, tags: html ? INLINE_TAGS.filter((tag) => field.tags.includes(tag)) : [], blanks: dialect === 'blanks' }
}

/** The format as the outline names it: `text`, or `html: strong em`, and the blank's rule. */
export function describeFormat(format) {
  const base = format.tags.length ? `html: ${format.tags.join(' ')}` : 'text'
  return format.blanks ? `${base}; blank: *word*` : base
}

const REFERENCES = { '&': '&amp;', '"': '&quot;', "'": '&#039;', '<': '&lt;', '>': '&gt;' }

/**
 * Text as an H5P field holds it: PHP's `htmlspecialchars(…, ENT_QUOTES)`, the escaping H5P's
 * validator applies, `'` as `&#039;`. With `keepReferences`, a reference already in the text is
 * kept, as the validator keeps one (its `double_encode` is off): for the content type's defaults,
 * where `&nbsp;` means a space. The model's words are text through and through.
 */
export function escapeHtml(value, { keepReferences = false } = {}) {
  const special = keepReferences ? /[&](?!#[0-9]+;|#[xX][0-9a-fA-F]+;|[a-zA-Z0-9]+;)|["'<>]/g : /[&"'<>]/g
  return value.replace(special, (char) => REFERENCES[char])
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** A tag as written: `<em>`, `</em>`, `<p class="x">`. A `<` followed by a space or a digit is text. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>/g

/**
 * A field's value as the model reads it, in the field's format: the inline tags the field allows
 * kept, paragraphs and line breaks as new lines, every other tag gone, references decoded.
 * @param {unknown} value
 * @param {Format} format
 */
export function toModel(value, format) {
  let text = String(value ?? '')
  if (format.html) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|pre)>/gi, '\n\n')
      .replace(/<li(\s[^>]*)?>/gi, '- ')
      .replace(TAG, (_, close, name) => {
        const tag = SYNONYMS[name.toLowerCase()] ?? name.toLowerCase()
        return format.tags.includes(tag) ? `<${close}${tag}>` : ''
      })
  }
  return decode(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The model's text checked against the field's format: `{ text }` when it keeps to it, or
 * `{ problem }` saying which rule it broke, in words the model is given back.
 * @param {unknown} value
 * @param {Format} format
 * @returns {{ text: string } | { problem: string }}
 */
export function checkModelText(value, format) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').trim()
  if (!text) return { problem: 'The text is empty.' }
  const open = []
  for (const [, close, written, attributes] of text.matchAll(TAG)) {
    const name = written.toLowerCase()
    const tag = SYNONYMS[name] ?? name
    if (!format.tags.length) return { problem: `This field is plain text: write it without HTML tags such as <${name}>.` }
    if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)) return { problem: `Do not wrap the text in <${name}>: paragraphs are added for you. Start a new paragraph with an empty line.` }
    if (!format.tags.includes(tag)) return { problem: `This field allows only the tags ${format.tags.map((each) => `<${each}>`).join(', ')}; <${name}> is not one of them.` }
    if (attributes?.trim() && !close) return { problem: `Write <${name}> without attributes.` }
    if (!close) open.push(tag)
    else if (open.pop() !== tag) return { problem: `</${name}> closes a tag that is not open.` }
  }
  if (open.length) return { problem: `<${open[open.length - 1]}> is opened and never closed.` }
  if (/^#{1,6}\s/m.test(text)) return { problem: 'Write no headings: only the text of the field.' }
  if (format.blanks && !/\*[^*\n]+\*/.test(text)) return { problem: 'The answer must stay between asterisks, like *this*.' }
  return { text }
}

/**
 * Checked text as the field holds it. A plain text field gets one escaped line. A field with
 * tags gets everything escaped and then its allowed tags back, and paragraphs wrapped as the
 * field's previous value wrapped them — `<p>` with its attributes kept, or `<div>` — since H5P's
 * validator allows those wrappers in every html field whatever its tags.
 * @param {string} text from `checkModelText`
 * @param {Format} format
 * @param {string} [previous] the field's value before
 */
export function toHtml(text, format, previous = '') {
  if (!format.html) return escapeHtml(text.replace(/\s*\n\s*/g, ' '))
  const marked = escapeHtml(text).replace(/&lt;(\/?)([a-zA-Z][a-zA-Z0-9]*)&gt;/g, (match, close, name) => {
    const tag = SYNONYMS[name.toLowerCase()] ?? name.toLowerCase()
    return format.tags.includes(tag) ? `<${close}${tag}>` : match
  })
  const paragraphs = marked.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\n/g, '<br>'))
  const wrap = /^\s*<(p|div)(\s[^>]*)?>/i.exec(previous)
  if (!wrap) return paragraphs.join('<br><br>')
  const [, tag, attributes = ''] = wrap
  return paragraphs.map((paragraph) => `<${tag}${attributes}>${paragraph}</${tag}>`).join('')
}

/**
 * Create's guard: text the model wrote with markup it was told not to write, as plain text.
 * Create has no second turn in which to ask again, so here, and only here, markup is dropped.
 */
export function stripMarkup(value) {
  return toModel(value, { html: true, tags: [], blanks: false }).replace(/^#{1,6}[ \t]+/gm, '')
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
