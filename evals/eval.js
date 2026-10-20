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
import { LANGUAGES, contentFrom, packageFrom } from '../src/authoring.js'
import { DETECTION_MIN_LENGTH, contentTexts, decideLanguage, relabel } from '../src/edit/language.js'
import { applyChanges } from '../src/edit/operations.js'
import { translateContent, translationIntent } from '../src/edit/translate.js'
import { LOOSE_EDIT_SCHEMA, editPrompt, editSchema, editSystem, fixPrompt } from '../src/edit/prompt.js'
import { languageDetector } from '../src/model/detect.js'
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
const COLUMNS = ['sample', 'task', 'time', 'quota', 'changed', 'refused', 'format', 'schema', 'language']

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
  // H5P's own words — Fullscreen, Rights of use — in the content's language; read at each load.
  player.setAttribute('lang', next.language)
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
  let detector = null
  try {
    say('Reading the request…')
    // First: does the teacher ask for the activity in another language? The detector is made
    // now too, from the click, since its first use may download its model.
    const [to, made] = await Promise.all([
      translationIntent(nano, { message, language: current.language, onDownload: (loaded) => say(`Downloading Chrome's model: ${Math.round(loaded * 100)}%`) }),
      languageDetector.session()
    ])
    detector = made
    if (to) await translateRun(to, started, detector)
    else await editRun(message, started, detector)
    renderRuns()
  } catch (error) {
    say(`${error?.name ?? 'Error'}: ${error?.message ?? error}`, 'error')
  } finally {
    detector?.destroy()
    $('#run').disabled = false
  }
}

/**
 * A translation, run by code: every text field translated in batches, each field required, then
 * the content type's own words relabelled and h5p.json given the new language. The detector's
 * reading of the result is reported as a check, not used to decide.
 */
async function translateRun(to, started, detector) {
  const from = current.language
  say(`Translating into ${LANGUAGES[to]}…`)
  const textIds = new Map([...byId].filter(([, node]) => node.kind === 'text'))
  const result = await translateContent(nano, {
    params: current.params,
    byId: textIds,
    from,
    to,
    onBatch: (done, total) => say(`Translating into ${LANGUAGES[to]}: batch ${Math.min(done + 1, total)} of ${total}…`)
  })
  const ms = Math.round(performance.now() - started)
  $('#answer').textContent = result.answers.join('\n\n— next answer —\n')
  showChanges(result)
  const relabelled = relabel(result.params, current.mainLibrary, authoringPack, from, to)
  const manifest = { ...current.manifest, language: to, defaultLanguage: to }
  const texts = contentTexts(relabelled.params, current.mainLibrary, authoringPack, to)
  const detected = detector && texts.length >= DETECTION_MIN_LENGTH ? await detector.detect(texts) : null
  const note = `Language ${from} → ${to} (asked), ${relabelled.relabelled} interface text(s) relabelled.`
  $('#applied').append(item(note))
  const file = await withContent(current.file, { params: relabelled.params, manifest })
  setCurrent({ ...current, file, params: relabelled.params, manifest, language: to })
  say(`${result.applied.length} of ${textIds.size} field(s) translated in ${result.batches} batch(es), ${result.violations.length} refused, ${result.formatBreaks} format break(s) on the first try, ${ms} ms. ${note}`)
  runs.push(
    row({
      ms,
      quota: result.quota,
      changed: result.applied.length,
      refused: result.violations.length,
      formatBreaks: result.formatBreaks,
      schema: result.schema,
      tries: result.tries,
      language: `${from} → ${to} (asked; ${result.batches} batch(es)${detected ? `; detector ${detected[0]?.language} ${detected[0]?.confidence.toFixed(2)}` : '; no detector'})`
    })
  )
}

/**
 * Any other request: one answer, checked, one second try for what was refused. A language change
 * nobody asked for is still noticed, by the detector alone.
 */
async function editRun(message, started, detector) {
  say('Starting the model…')
  const session = await nano.session({ system: editSystem(current.language), language: current.language, onDownload: (loaded) => say(`Downloading Chrome's model: ${Math.round(loaded * 100)}%`) })
  try {
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
    if (!parsed || !result) {
      say(`The answer was not the JSON asked for (${ms} ms).`, 'error')
      runs.push(row({ ms, quota, changed: 0, refused: 'not JSON', formatBreaks: 0, schema: first.schema, tries: 1 }))
      return
    }
    showChanges(result)

    let { params, manifest, language } = { params: result.params, manifest: current.manifest, language: current.language }
    const texts = contentTexts(params, current.mainLibrary, authoringPack, current.language)
    const detected = detector && texts.length >= DETECTION_MIN_LENGTH ? await detector.detect(texts) : null
    const decision = decideLanguage({ current: current.language, detected })
    let note = ''
    if (decision.language !== current.language) {
      const relabelled = relabel(params, current.mainLibrary, authoringPack, current.language, decision.language)
      params = relabelled.params
      manifest = { ...manifest, language: decision.language, defaultLanguage: decision.language }
      language = decision.language
      note = ` Language ${current.language} → ${decision.language} (detected), ${relabelled.relabelled} interface text(s) relabelled.`
      $('#applied').append(item(note.trim()))
    }
    const languageColumn = `${language === current.language ? current.language : `${current.language} → ${language}`} (edit; ${decision.by}${detected ? `; detector ${detected[0]?.language} ${detected[0]?.confidence.toFixed(2)}` : '; no detector'})`
    if (result.applied.length || language !== current.language) {
      const file = await withContent(current.file, { params, manifest })
      setCurrent({ ...current, file, params, manifest, language })
    }
    say(`${result.applied.length} field(s) changed, ${result.violations.length} refused, ${formatBreaks} format break(s) on the first try, ${ms} ms.${note} "${parsed.reply ?? ''}"`)
    runs.push(row({ ms, quota, changed: result.applied.length, refused: result.violations.length, formatBreaks, schema: first.schema, tries: second ? 2 : 1, language: languageColumn }))
  } finally {
    session.destroy()
  }
}

/** What was applied and what was refused, one line each. */
function showChanges(result) {
  for (const change of result.applied) $('#applied').append(item(`${change.id} ${change.label}: ${String(change.from)} → ${String(change.to)}`))
  for (const refusal of result.violations) $('#applied').append(item(`${refusal.id} ${refusal.label}: ${refusal.problem}`, 'violation'))
}

function parse(answer) {
  try {
    const value = JSON.parse(answer)
    return value && typeof value === 'object' && value.changes && typeof value.changes === 'object' ? value : null
  } catch {
    return null
  }
}

function row({ ms, quota, changed, refused, formatBreaks, schema, tries, language = '' }) {
  return {
    sample: current.name,
    task: $('#message').value.trim(),
    time: `${(ms / 1000).toFixed(1)} s${tries > 1 ? ' (2 tries)' : ''}`,
    quota: quota ? `${quota.used}/${quota.total}` : '?',
    changed: String(changed),
    refused: String(refused),
    format: String(formatBreaks),
    schema,
    language,
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
