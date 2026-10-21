/**
 * The desktop check: whether the app runs in Tauri's window as it does in a browser, and reaches a
 * model server on the same machine. Each step is listed on the page and sent to the stand-in's
 * `/report` (`scripts/local-model-stand-in.mjs`), which prints it, so the check reads in a terminal:
 *
 * 1. Where the page is: its address, a secure context, Service Workers, Tauri's bridge.
 * 2. The player plays a quiz as Create makes it: content only, the libraries from the pack.
 * 3. The model is asked for an edit through the app's own `model/openai.js`, which uses Tauri's
 *    HTTP client, from Rust; then the same request from the page's own `fetch`, which a server
 *    that sends no CORS headers refuses.
 * 4. The edit is applied and the edited file plays.
 *
 * `?llm=<base URL>&model=<id>&key=<key>&message=<words>` picks the server and the request; the
 * stand-in, changing the title, by default.
 */

import '@missing-elements/h5p-offline-player'
import { pack } from '@missing-elements/h5p-libraries'
import { runtime } from '@missing-elements/h5p-runtime'
import authoringPack from 'virtual:h5p-authoring-pack'
import { SAMPLES } from '../evals/tasks.js'
import { contentFrom, packageFrom } from '../src/authoring.js'
import { applyChanges } from '../src/edit/operations.js'
import { editPrompt, editSchema, editSystem } from '../src/edit/prompt.js'
import { session } from '../src/model/openai.js'
import { withContent } from '../src/package/working-copy.js'
import { contentModel } from '../src/semantics/content-model.js'
import { outline } from '../src/semantics/outline.js'

const REPORT = 'http://127.0.0.1:47616/report'
const query = new URLSearchParams(location.search)
const llm = query.get('llm') ?? 'http://127.0.0.1:47616'
const model = query.get('model') ?? 'stand-in'
const key = query.get('key') ?? ''
const message = query.get('message') ?? 'Change the title to "Water on Earth".'

const player = document.querySelector('h5p-player')
player.runtime = runtime
player.pack = pack

/** A step: on the page, and to the stand-in as a simple request, which needs no CORS. */
function report(step, ok, detail = '') {
  const li = document.createElement('li')
  li.dataset.ok = String(ok)
  li.textContent = `${ok ? '✓' : '✗'} ${step}`
  if (detail) {
    const pre = document.createElement('pre')
    pre.textContent = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
    li.append(pre)
  }
  document.querySelector('#steps').append(li)
  fetch(REPORT, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ step, ok, detail }) }).catch(() => {})
}

/** The player's next `ready` or `error`, after `file` is given to it. */
function play(file, timeout = 60_000) {
  return new Promise((resolve) => {
    const done = (result) => {
      clearTimeout(timer)
      player.removeEventListener('ready', onReady)
      player.removeEventListener('error', onError)
      resolve(result)
    }
    const onReady = (event) => done({ state: 'ready', title: event.detail?.metadata?.title })
    const onError = (event) => done({ state: 'error', code: event.detail?.code, message: event.detail?.message })
    const timer = setTimeout(() => done({ state: player.state, message: `no ready or error in ${timeout / 1000} s` }), timeout)
    player.addEventListener('ready', onReady)
    player.addEventListener('error', onError)
    player.file = file
  })
}

async function ask(send, body) {
  const started = performance.now()
  const response = await send(`${llm}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body)
  })
  const answer = await response.json()
  return { status: response.status, ms: Math.round(performance.now() - started), answer }
}

async function check() {
  report('Where the page is', true, {
    href: location.href,
    secureContext: isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    tauri: '__TAURI_INTERNALS__' in window,
    userAgent: navigator.userAgent
  })

  const sample = SAMPLES['quiz-en']
  const content = contentFrom(sample.kind, sample.answer, { pack: authoringPack, language: sample.language })
  const file = await packageFrom(content)
  const main = content.manifest.preloadedDependencies[0]
  const mainLibrary = `${main.machineName} ${main.majorVersion}.${main.minorVersion}`
  const first = await play(file)
  const workers = 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.active?.scriptURL ?? 'installing') : []
  report('The player plays a quiz as Create makes it', first.state === 'ready', { ...first, workers })

  const { text, byId } = outline(contentModel(content.params, mainLibrary, authoringPack, 'en'))
  const body = {
    model,
    messages: [
      { role: 'system', content: editSystem('en') },
      { role: 'user', content: editPrompt(text, message) }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'edit', strict: true, schema: editSchema(byId) } },
    temperature: 0.2,
    stream: false
  }

  let answer = null
  const step = `The model answers through model/openai.js and Tauri's HTTP client (${llm}, ${model})`
  try {
    const started = performance.now()
    const conversation = await session({ server: { name: 'The model server', url: `${llm}/v1`, model, key }, system: editSystem('en') })
    answer = await conversation.prompt(editPrompt(text, message), { schema: editSchema(byId) })
    report(step, true, { ms: Math.round(performance.now() - started), answer, quota: conversation.quota() })
  } catch (error) {
    report(step, false, `${error?.name}: ${error?.message}`)
  }

  try {
    const result = await ask(fetch, body)
    report("The page's own fetch reaches it too (the server allows this origin)", true, { status: result.status, ms: result.ms })
  } catch (error) {
    report("The page's own fetch is refused (no CORS headers), as expected", true, String(error))
  }

  if (!answer) return report('The edit plays', false, 'no answer to apply')
  let changes = null
  try {
    changes = JSON.parse(answer).changes
  } catch {}
  const applied = applyChanges(content.params, changes, byId)
  if (!applied.applied.length) return report('The edit plays', false, { answer, violations: applied.violations })
  const copy = await withContent(file, { params: applied.params })
  const second = await play(copy)
  report('The edit plays', second.state === 'ready', { ...second, applied: applied.applied.map(({ id, from, to }) => `${id}: ${from} → ${to}`), violations: applied.violations })
}

check()
  .catch((error) => report('The check stopped', false, `${error?.name}: ${error?.message}\n${error?.stack ?? ''}`))
  .finally(() => report('Done', true))
