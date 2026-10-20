/**
 * The content as a list of what the model may read and change: the parameters walked with the
 * libraries' own `semantics.json`, from the pack, into nodes. A text field is content when it
 * is not one of H5P's interface strings (`common` in the semantics) and holds something the
 * author wrote — not empty, and not the default the library brought, in the content's language.
 * A yes/no, number or choice is content when it sits inside a list item, as an answer's
 * "Correct" does; elsewhere it is a setting, shown only on request. Media and files are left
 * out: they are carried through as they are.
 *
 * Pure: the pack is the part `readAuthoringPack()` reads (`virtual:h5p-authoring-pack` in the
 * app), and the walk mirrors `ContentGenerator`, so a group of one field is read where the
 * generator saved it.
 */

import { ContentGenerator } from '../../scripts/sweep-content.mjs'
import { packFor } from '../authoring.js'
import { dialectFor, formatOf, toModel } from './dialects.js'

/**
 * @typedef {object} Node
 * @property {'text' | 'number' | 'boolean' | 'select' | 'item'} kind `item` is the heading of a list item
 * @property {(string | number)[]} path where the value sits in the parameters
 * @property {string} label the field's label from the semantics, or the item's heading
 * @property {number} depth how far in, for the outline's indentation
 * @property {string} library the machine name of the library whose semantics define the field
 * @property {any} [field] the semantics of a value node
 * @property {any} [value] the value as saved
 * @property {string} [text] a text node's value as the model reads it
 * @property {boolean} [html] whether the field holds markup (it has `tags`)
 * @property {string} [dialect] how the text is read and written
 * @property {import('./dialects.js').Format} [format] a text node's format: where the model may write HTML
 * @property {boolean} [content] whether the node is the author's content rather than a setting
 * @property {(string | number)[]} [titleOf] for a sub-content's question: the sub-content whose title follows it
 */

/**
 * @param {any} params `content/content.json`
 * @param {string} mainLibrary `H5P.QuestionSet 1.21`, from `h5p.json`
 * @param {{ libraries: any[] }} pack
 * @param {string} [language] the content's, for the defaults it was given
 * @returns {Node[]}
 */
export function contentModel(params, mainLibrary, pack, language = 'en') {
  const generator = new ContentGenerator(packFor(pack, language))
  const entry = libraryEntry(generator, mainLibrary)
  if (!entry) throw new Error(`The pack has no ${mainLibrary}`)
  const walk = new Walk(generator)
  walk.fields(entry.semantics, params, [], { library: entry.library.machineName, fieldPath: '', depth: 0, inItem: false, sub: null, heading: null })
  return walk.nodes
}

/** Whether every library the content names is in the pack: the condition for editing it here. */
export function editable(params, mainLibrary, pack) {
  const generator = new ContentGenerator(packFor(pack, 'en'))
  if (!libraryEntry(generator, mainLibrary)) return false
  const named = []
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') {
      if (typeof value.library === 'string' && /^\S+ \d+\.\d+$/.test(value.library)) named.push(value.library)
      Object.values(value).forEach(collect)
    }
  }
  collect(params)
  return named.every((library) => libraryEntry(generator, library))
}

function libraryEntry(generator, library) {
  const match = /^(\S+) (\d+)\.(\d+)$/.exec(library ?? '')
  return match ? generator.find(match[1], Number(match[2])) : null
}

class Walk {
  constructor(generator) {
    this.generator = generator
    /** @type {Node[]} */
    this.nodes = []
  }

  fields(fields, params, path, ctx) {
    for (const field of fields) {
      if (field.common) continue
      this.field(field, params?.[field.name], [...path, field.name], { ...ctx, fieldPath: ctx.fieldPath ? `${ctx.fieldPath}.${field.name}` : field.name })
    }
  }

  field(field, value, path, ctx) {
    switch (field.type) {
      case 'group': {
        const children = field.fields ?? []
        // Saved as its one field's value, as the generator and the editor save it.
        if (children.length === 1 && !field.isSubContent) return this.field(children[0], value, path, { ...ctx, fieldPath: `${ctx.fieldPath}.${children[0].name}` })
        return this.fields(children, value, path, ctx)
      }
      case 'list': {
        if (!Array.isArray(value)) return
        const entity = field.entity ?? field.label ?? field.name
        value.forEach((item, index) => {
          const heading = { kind: 'item', path: [...path, index], label: `${capitalize(entity)} ${index + 1}`, depth: ctx.depth, library: ctx.library }
          const from = this.nodes.push(heading) - 1
          this.field(field.field, item, [...path, index], { ...ctx, fieldPath: `${ctx.fieldPath}[].${field.field.name}`, depth: ctx.depth + 1, inItem: true, heading })
          // An item with no words of its own — a default score range, an empty tip — is nothing to edit.
          if (!this.nodes.slice(from + 1).some((node) => node.kind === 'text')) this.nodes.length = from
        })
        return
      }
      case 'library': {
        if (!value || typeof value.library !== 'string') return
        const entry = libraryEntry(this.generator, value.library)
        if (!entry) {
          if (ctx.heading) ctx.heading.label += ` (${value.library}: not in the pack, not editable)`
          return
        }
        if (ctx.heading) ctx.heading.label += ` (${entry.library.title})`
        // A sub-content's own settings are settings, though the sub-content sits in a list.
        return this.fields(entry.semantics, value.params, [...path, 'params'], { ...ctx, library: entry.library.machineName, fieldPath: '', sub: path, inItem: false })
      }
      case 'text':
      case 'number':
      case 'boolean':
      case 'select':
        return this.value(field, value, path, ctx)
      default:
        return
    }
  }

  value(field, value, path, ctx) {
    const html = field.type === 'text' && Array.isArray(field.tags)
    const dialect = dialectFor(ctx.library, ctx.fieldPath)
    /** @type {Node} */
    const node = { kind: field.type, path, label: field.label ?? field.name, depth: ctx.depth, library: ctx.library, field, value, html, dialect, content: false }
    if (field.type === 'text') {
      if (typeof value !== 'string' || !value.trim()) return
      const format = formatOf(field, dialect)
      const text = toModel(value, format)
      const brought = field.default === undefined ? null : toModel(field.default, format)
      // The library's own words, untouched, are not the author's: a button label, a heading.
      if (!text || text === brought) return
      node.content = true
      node.text = text
      node.format = format
      // A question is its sub-content's title in a set, as the editor writes it.
      if (ctx.sub && field.name === 'question' && path.length === ctx.sub.length + 2) node.titleOf = ctx.sub
    } else {
      if (value === undefined) return
      // An answer's "Correct" sits in a list item; True/False's "Correct answer" is marked important.
      node.content = ctx.inItem || field.importance === 'high'
    }
    this.nodes.push(node)
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
