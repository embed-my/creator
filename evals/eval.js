/**
 * The eval page: the editing spine driven by hand against the real model, with every step shown
 * — the outline the model reads, its raw answer, what was applied or refused, the time and the
 * quota — and a table of runs to judge and copy into the repository. The same modules the app
 * will use; nothing here is a stand-in but the person judging.
 */

import '@missing-elements/h5p-offline-player'
import { pack } from '@missing-elements/h5p-libraries'
import { runtime } from '@missing-elements/h5p-runtime'
import authoringPack from 'virtual:h5p-authoring-pack'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { applyOps } from '../src/edit/operations.js'
import { EDIT_SCHEMA, editPrompt, editSystem, fixPrompt } from '../src/edit/prompt.js'
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
  setCurrent({ file, manifest: content.manifest, params: content.params, mainLibrary: content.manifest.preloadedDependencies[0] && `${content.manifest.mainLibrary} ${content.manifest.preloadedDependencies[0].majorVersion}.${content.manifest.preloadedDependencies[0].minorVersion}`, language: sample.language, name: key })
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

async function run() {
  if (!current) return say('Load a sample or open an editable file first.', 'error')
  const message = $('#message').value.trim()
  if (!message) return say('Write what should change.', 'error')
  if ((await nano.availability(current.language)) === 'unavailable') return say("Chrome's model is not available here.", 'error')

  $('#run').disabled = true
  $('#answer').textContent = ''
  $('#applied').replaceChildren()
  const system = editSystem(current.language)
  const started = performance.now()
  let session
  try {
    say('Starting the model…')
    session = await nano.session({ system, language: current.language, onDownload: (loaded) => say(`Downloading Chrome's model: ${Math.round(loaded * 100)}%`) })
    const before = await session.quota()
    const prompt = editPrompt($('#outline').textContent, message)
    say('Writing…')
    const firstAnswer = await session.prompt(prompt, { schema: EDIT_SCHEMA })
    const firstMs = Math.round(performance.now() - started)
    let parsed = parse(firstAnswer)
    let result = parsed ? applyOps(current.params, parsed.ops, byId) : null
    let fixed = false
    let secondAnswer = null
    if (result && result.violations.length) {
      say('Asking once more about the refused fields…')
      secondAnswer = await session.prompt(fixPrompt(result.violations), { schema: EDIT_SCHEMA })
      const again = parse(secondAnswer)
      if (again) {
        const second = applyOps(result.params, again.ops, byId)
        result = { params: second.params, applied: [...result.applied, ...second.applied], violations: second.violations }
        fixed = true
      }
    }
    const ms = Math.round(performance.now() - started)
    const after = await session.quota()

    $('#answer').textContent = secondAnswer ? `${firstAnswer}\n\n— after the refusals —\n${secondAnswer}` : firstAnswer
    if (!parsed) {
      say(`The answer was not JSON (${firstMs} ms).`, 'error')
      runs.push(row({ ms, quota: after, changed: 0, refused: 'not JSON', fixed }))
    } else {
      for (const change of result.applied) $('#applied').append(item(`${change.id} ${change.label}: ${String(change.from)} → ${String(change.to)}`))
      for (const refusal of result.violations) $('#applied').append(item(`${refusal.id}: ${refusal.problem}`, 'violation'))
      if (result.applied.length) {
        const file = await withContent(current.file, { params: result.params })
        current = { ...current, file, params: result.params }
        player.file = file
        render()
      }
      say(`${result.applied.length} field(s) changed, ${result.violations.length} refused, ${ms} ms${fixed ? ', with a second try' : ''}. "${parsed.reply ?? ''}"`)
      runs.push(row({ ms, quota: after ?? before, changed: result.applied.length, refused: result.violations.length, fixed }))
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
    return value && typeof value === 'object' && Array.isArray(value.ops) ? value : null
  } catch {
    return null
  }
}

function row({ ms, quota, changed, refused, fixed }) {
  return {
    sample: current.name,
    task: $('#message').value.trim(),
    time: `${(ms / 1000).toFixed(1)} s${fixed ? ' (2 tries)' : ''}`,
    quota: quota ? `${quota.used}/${quota.total}` : '?',
    changed: String(changed),
    refused: String(refused),
    verdict: '',
    notes: ''
  }
}

function renderRuns() {
  const body = $('#runs tbody')
  body.replaceChildren(
    ...runs.map((entry) => {
      const tr = document.createElement('tr')
      for (const key of ['sample', 'task', 'time', 'quota', 'changed', 'refused']) {
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
  const header = `| Sample | Task | Time | Quota | Changed | Refused | Verdict | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- |`
  const lines = runs.map((entry) => `| ${['sample', 'task', 'time', 'quota', 'changed', 'refused', 'verdict', 'notes'].map((key) => String(entry[key]).replace(/\|/g, '\\|')).join(' | ')} |`)
  await navigator.clipboard.writeText(`${$('#environment').textContent}\n\n${header}\n${lines.join('\n')}\n`)
  say('Copied.')
})

showTask()
await loadSample($('#sample').value)
