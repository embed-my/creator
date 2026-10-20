/**
 * The eval page: the editing spine driven by hand against the real model, with every step shown
 * — the system prompt, the outline the model reads, its raw answer, what was applied or refused,
 * the time and the quota — and a table of runs to judge and copy into the repository. The same
 * modules the app will use; nothing here is a stand-in but the person judging.
 *
 * A text that breaks its field's format (HTML where the field is plain text, a tag the field
 * does not allow) is refused and counted in its own column, before the second try: whether the
 * model keeps to the formats it is told is one of the things measured, so nothing is cleaned
 * up behind it.
 */

import '@missing-elements/h5p-offline-player'
import { pack } from '@missing-elements/h5p-libraries'
import { runtime } from '@missing-elements/h5p-runtime'
import authoringPack from 'virtual:h5p-authoring-pack'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { applyChanges } from '../src/edit/operations.js'
import { LOOSE_EDIT_SCHEMA, editPrompt, editSchema, editSystem, fixPrompt } from '../src/edit/prompt.js'
import { nano } from '../src/model/nano.js'
import { readPackage } from '../src/package/read.js'
import { withContent } from '../src/package/working-copy.js'
import { contentModel, editable } from '../src/semantics/content-model.js'
import { outline } from '../src/semantics/outline.js'
import { SAMPLES, TASKS } from './tasks.js'

const $ = (selector) => document.querySelector(selector)
const player = $('h5p-player')
player.runtime = runtime
player.pack = pack

$('#environment').textContent = `${navigator.userAgentData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(', ') ?? navigator.userAgent} · ${new Date().toISOString().slice(0, 10)}`
if ((await nano.availability('en')) === 'unavailable') $('#no-model').hidden = false

/** The content being edited: its file as the player plays it, and its two JSON files. */
let current = null
let byId = new Map()
/** The runs so far, for the table. */
const runs = []
const COLUMNS = ['sample', 'task', 'time', 'quota', 'changed', 'refused', 'format', 'schema']

for (const [key, sample] of Object.entries(SAMPLES)) $('#sample').append(new Option(sample.label, key))
for (const [index, task] of TASKS.entries()) $('#task').append(new Option(task.label, String(index)))

const say = (text, tone = '') => {
  $('#status').textContent = text
  $('#status').dataset.tone = tone
}

async function loadSample(key) {
  const sample = SAMPLES[key]
  const content = contentFrom(sample.kind, sample.answer, { pack: authoringPack, language: sample.language })
  const file = await packageFrom(content)
  const main = content.manifest.preloadedDependencies[0]
  setCurrent({ file, manifest: content.manifest, params: content.params, mainLibrary: `${main.machineName} ${main.majorVersion}.${main.minorVersion}`, language: sample.language, name: key })
}

async function openFile(file) {
  const { manifest, params, mainLibrary } = await readPackage(file)
  if (!mainLibrary || !editable(params, mainLibrary, authoringPack)) {
    say('This package uses a content type the eval page has no semantics for (only the five of Create). It plays, but cannot be edited.', 'error')
    player.file = file
    current = null
    render()
    return
  }
  setCurrent({ file, manifest, params, mainLibrary, language: manifest.language ?? 'en', name: file.name })
}

function setCurrent(next) {
  current = next
  player.file = next.file
  say('')
  render()
}

function render() {
  $('#system').textContent = editSystem(current?.language ?? 'en')
  if (!current) {
    $('#outline').textContent = ''
    byId = new Map()
    return
  }
  const nodes = contentModel(current.params, current.mainLibrary, authoringPack, current.language)
  const result = outline(nodes, { settings: $('#settings').checked })
  byId = result.byId
  $('#outline').textContent = result.text
}

function showTask() {
  const task = TASKS[Number($('#task').value)]
  $('#message').value = task.message
  $('#settings').checked = task.settings
  $('#right').textContent = `Right when: ${task.right}`
  render()
}

/** Asks with this turn's schema; where the browser's model refuses it, with the loose one, and says which. */
async function ask(session, text) {
  try {
    return { answer: await session.prompt(text, { schema: editSchema(byId), omitSchema: true }), schema: 'strict' }
  } catch (error) {
    if (error?.name !== 'NotSupportedError' && error?.name !== 'TypeError' && error?.name !== 'SyntaxError') throw error
    return { answer: await session.prompt(text, { schema: LOOSE_EDIT_SCHEMA, omitSchema: true }), schema: `loose (${error.name}: ${error.message})` }
  }
}

async function run() {
  if (!current) return say('Load a sample or open an editable file first.', 'error')
  const message = $('#message').value.trim()
  if (!message) return say('Write what should change.', 'error')
  if ((await nano.availability(current.language)) === 'unavailable') return say("Chrome's model is not available here.", 'error')

  $('#run').disabled = true
  $('#answer').textContent = ''
  $('#applied').replaceChildren()
  const started = performance.now()
  let session
  try {
    say('Starting the model…')
    session = await nano.session({ system: editSystem(current.language), language: current.language, onDownload: (loaded) => say(`Downloading Chrome's model: ${Math.round(loaded * 100)}%`) })
    say('Writing…')
    const first = await ask(session, editPrompt($('#outline').textContent, message))
    const parsed = parse(first.answer)
    let result = parsed ? applyChanges(current.params, parsed.changes, byId) : null
    const formatBreaks = result ? result.violations.filter((violation) => violation.kind === 'format').length : 0
    let second = null
    if (result && result.violations.length) {
      say('Asking once more about the refused fields…')
      second = await ask(session, fixPrompt(result.violations))
      const again = parse(second.answer)
      if (again) {
        const retried = applyChanges(result.params, again.changes, byId)
        result = { params: retried.params, applied: [...result.applied, ...retried.applied], violations: retried.violations }
      }
    }
    const ms = Math.round(performance.now() - started)
    const quota = session.quota()

    $('#answer').textContent = second ? `${first.answer}\n\n— after the refusals —\n${second.answer}` : first.answer
    if (!parsed) {
      say(`The answer was not the JSON asked for (${ms} ms).`, 'error')
      runs.push(row({ ms, quota, changed: 0, refused: 'not JSON', formatBreaks: 0, schema: first.schema, tries: 1 }))
    } else {
      for (const change of result.applied) $('#applied').append(item(`${change.id} ${change.label}: ${String(change.from)} → ${String(change.to)}`))
      for (const refusal of result.violations) $('#applied').append(item(`${refusal.id} ${refusal.label}: ${refusal.problem}`, 'violation'))
      if (result.applied.length) {
        const file = await withContent(current.file, { params: result.params })
        current = { ...current, file, params: result.params }
        player.file = file
        render()
      }
      say(`${result.applied.length} field(s) changed, ${result.violations.length} refused, ${formatBreaks} format break(s) on the first try, ${ms} ms. "${parsed.reply ?? ''}"`)
      runs.push(row({ ms, quota, changed: result.applied.length, refused: result.violations.length, formatBreaks, schema: first.schema, tries: second ? 2 : 1 }))
    }
    renderRuns()
  } catch (error) {
    say(`${error?.name ?? 'Error'}: ${error?.message ?? error}`, 'error')
  } finally {
    session?.destroy()
    $('#run').disabled = false
  }
}

function parse(answer) {
  try {
    const value = JSON.parse(answer)
    return value && typeof value === 'object' && value.changes && typeof value.changes === 'object' ? value : null
  } catch {
    return null
  }
}

function row({ ms, quota, changed, refused, formatBreaks, schema, tries }) {
  return {
    sample: current.name,
    task: $('#message').value.trim(),
    time: `${(ms / 1000).toFixed(1)} s${tries > 1 ? ' (2 tries)' : ''}`,
    quota: quota ? `${quota.used}/${quota.total}` : '?',
    changed: String(changed),
    refused: String(refused),
    format: String(formatBreaks),
    schema,
    verdict: '',
    notes: ''
  }
}

function renderRuns() {
  const body = $('#runs tbody')
  body.replaceChildren(
    ...runs.map((entry) => {
      const tr = document.createElement('tr')
      for (const key of COLUMNS) {
        const td = document.createElement('td')
        td.textContent = entry[key]
        tr.append(td)
      }
      const verdict = document.createElement('select')
      for (const option of ['', 'pass', 'partial', 'fail']) verdict.append(new Option(option || '—', option))
      verdict.value = entry.verdict
      verdict.addEventListener('change', () => (entry.verdict = verdict.value))
      const notes = document.createElement('input')
      notes.type = 'text'
      notes.value = entry.notes
      notes.addEventListener('input', () => (entry.notes = notes.value))
      for (const control of [verdict, notes]) {
        const td = document.createElement('td')
        td.append(control)
        tr.append(td)
      }
      return tr
    })
  )
}

function item(text, className = '') {
  const li = document.createElement('li')
  li.textContent = text
  if (className) li.className = className
  return li
}

$('#sample').addEventListener('change', () => loadSample($('#sample').value))
$('#file').addEventListener('change', (event) => {
  const [file] = event.target.files
  if (file) openFile(file)
  event.target.value = ''
})
$('#settings').addEventListener('change', render)
$('#task').addEventListener('change', showTask)
$('#run').addEventListener('click', run)
$('#reset').addEventListener('click', () => loadSample($('#sample').value))
$('#clear').addEventListener('click', () => {
  runs.length = 0
  renderRuns()
})
$('#copy').addEventListener('click', async () => {
  const keys = [...COLUMNS, 'verdict', 'notes']
  const header = `| ${keys.map((key) => key[0].toUpperCase() + key.slice(1)).join(' | ')} |\n| ${keys.map(() => '---').join(' | ')} |`
  const lines = runs.map((entry) => `| ${keys.map((key) => String(entry[key]).replace(/\|/g, '\\|')).join(' | ')} |`)
  await navigator.clipboard.writeText(`${$('#environment').textContent}\n\n${header}\n${lines.join('\n')}\n`)
  say('Copied.')
})

showTask()
await loadSample($('#sample').value)
