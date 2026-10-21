/**
 * The eval page: the editing spine driven by hand against a real model on this computer — the one
 * chosen with the Model button, recorded with every run, so that models can be compared — with
 * every step shown: the system prompt, the outline the model reads, its raw answer, what was
 * applied or refused, the time and the tokens. A table of runs to judge and copy into the
 * repository. The same modules the app uses; nothing here is a stand-in but the person judging.
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
import { editPrompt, editSchema, editSystem, fixPrompt } from '../src/edit/prompt.js'
import { openModelDialog } from '../src/model-dialog.js'
import { ModelError, session as modelSession } from '../src/model/openai.js'
import { currentServer, findServer, modelLabel, onServerChange } from '../src/model/settings.js'
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
/** The model the runs ask, named on its button; every run records it. */
function showServer(server) {
  $('#model').textContent = server ? `Model: ${modelLabel(server)}` : 'Choose a model'
  $('#model').title = server ? `${server.model} at ${server.url}` : ''
  $('#no-model').hidden = Boolean(server)
}
onServerChange(showServer)
$('#model').addEventListener('click', openModelDialog)
showServer(await findServer())

/** The content being edited: its file as the player plays it, and its two JSON files. */
let current = null
let byId = new Map()
/** The runs so far, for the table. */
const runs = []
const COLUMNS = ['sample', 'task', 'model', 'time', 'quota', 'changed', 'refused', 'format', 'schema']

for (const [key, sample] of Object.entries(SAMPLES)) $('#sample').append(new Option(sample.label, key))
for (const [index, task] of TASKS.entries()) $('#task').append(new Option(task.label, String(index)))

const say = (text, tone = '') => {
  $('#status').textContent = text
  $('#status').dataset.tone = tone
}

async function loadSample(key) {
  say('')
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
  say('')
  setCurrent({ file, manifest, params, mainLibrary, language: manifest.language ?? 'en', name: file.name })
}

function setCurrent(next) {
  current = next
  player.file = next.file
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

/**
 * Asks with this turn's schema; where the server refuses the schema (a 400 or 422), for any JSON
 * object instead, and says which.
 */
async function ask(conversation, text) {
  try {
    return { answer: await conversation.prompt(text, { schema: editSchema(byId) }), schema: 'strict' }
  } catch (error) {
    if (!(error instanceof ModelError) || (error.status !== 400 && error.status !== 422)) throw error
    return { answer: await conversation.prompt(text, { json: true }), schema: `loose (${error.status}: ${error.message})` }
  }
}

async function run() {
  if (!current) return say('Load a sample or open an editable file first.', 'error')
  const message = $('#message').value.trim()
  if (!message) return say('Write what should change.', 'error')
  const server = currentServer()
  if (!server) return say('Choose a model first.', 'error')

  $('#run').disabled = true
  $('#answer').textContent = ''
  $('#applied').replaceChildren()
  const started = performance.now()
  let conversation = null
  try {
    conversation = await modelSession({ server, system: editSystem(current.language) })
    say(`Writing (${modelLabel(server)})…`)
    const first = await ask(conversation, editPrompt($('#outline').textContent, message))
    const parsed = parse(first.answer)
    let result = parsed ? applyChanges(current.params, parsed.changes, byId) : null
    const formatBreaks = result ? result.violations.filter((violation) => violation.kind === 'format').length : 0
    let second = null
    if (result && result.violations.length) {
      say('Asking once more about the refused fields…')
      second = await ask(conversation, fixPrompt(result.violations))
      const again = parse(second.answer)
      if (again) {
        const retried = applyChanges(result.params, again.changes, byId)
        result = { params: retried.params, applied: [...result.applied, ...retried.applied], violations: retried.violations }
      }
    }
    const ms = Math.round(performance.now() - started)
    const quota = conversation.quota()

    $('#answer').textContent = second ? `${first.answer}\n\n— after the refusals —\n${second.answer}` : first.answer
    if (!parsed || !result) {
      say(`The answer was not the JSON asked for (${ms} ms).`, 'error')
      runs.push(row({ model: server.model, ms, quota, changed: 0, refused: 'not JSON', formatBreaks: 0, schema: first.schema, tries: 1 }))
    } else {
      for (const change of result.applied) $('#applied').append(item(`${change.id} ${change.label}: ${String(change.from)} → ${String(change.to)}`))
      for (const refusal of result.violations) $('#applied').append(item(`${refusal.id} ${refusal.label}: ${refusal.problem}`, 'violation'))
      if (result.applied.length) {
        const file = await withContent(current.file, { params: result.params })
        setCurrent({ ...current, file, params: result.params })
      }
      say(`${result.applied.length} field(s) changed, ${result.violations.length} refused, ${formatBreaks} format break(s) on the first try, ${ms} ms. "${parsed.reply ?? ''}"`)
      runs.push(row({ model: server.model, ms, quota, changed: result.applied.length, refused: result.violations.length, formatBreaks, schema: first.schema, tries: second ? 2 : 1 }))
    }
    renderRuns()
  } catch (error) {
    say(`${error?.name ?? 'Error'}: ${error?.message ?? error}`, 'error')
  } finally {
    conversation?.destroy()
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

function row({ model, ms, quota, changed, refused, formatBreaks, schema, tries }) {
  return {
    sample: current.name,
    task: $('#message').value.trim(),
    model,
    time: `${(ms / 1000).toFixed(1)} s${tries > 1 ? ' (2 tries)' : ''}`,
    quota: quota ? `${quota.used}/${quota.total ?? '?'}` : '?',
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
