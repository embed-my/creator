/**
 * The eval page's tasks run unattended against a model server: each task on each sample it is
 * written for, through the page itself in a headless Chromium, so a run is what a person gets by
 * hand. The page's requests to the server go through Node, as the desktop app's go through
 * Tauri, so a server that refuses other origins (Unsloth Studio) answers. Every run — the outline
 * the model read, its answer, what was applied or refused, the checks — goes to a JSON file, and
 * the runs table is printed for `evals/RESULTS.md`; the verdicts are still the person's.
 *
 *   pnpm build
 *   CREATOR_KEY=… node scripts/run-evals.mjs --url http://127.0.0.1:8888/v1
 *     [--model id] [--thinking on|off] [--task "Fix the spelling"]… [--sample quiz-en]… [--out …]
 *
 * `--thinking` asks for reasoning or none (`reasoning_effort`, "medium" or "none") where the
 * server's default differs: Unsloth Studio starts llama-server with reasoning on for Gemma 4 and
 * off for Qwen3.5. Without it the request is the app's, which sends nothing about reasoning.
 * The key, where the server wants one, is read from CREATOR_KEY and never written down.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { TASKS } from '../evals/tasks.js'
import { models, serverName } from '../src/model/openai.js'

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:8888/v1' },
    model: { type: 'string' },
    thinking: { type: 'string', default: 'server' },
    task: { type: 'string', multiple: true },
    sample: { type: 'string', multiple: true },
    out: { type: 'string' },
    port: { type: 'string', default: '4174' }
  }
})

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization'
}

const key = process.env.CREATOR_KEY || undefined
const base = { name: '', url: options.url.replace(/\/+$/, ''), key }
base.name = serverName(base)
const found = await models(base)
const chosen = options.model ? found.find((model) => model.id === options.model) : found[0]
if (!chosen) throw new Error(`${base.name} at ${base.url} has ${options.model ? `no model ${options.model}` : 'no model'}: ${found.map((model) => model.id).join(', ') || 'none'}`)
const server = { ...base, model: chosen.id, window: chosen.window }
const label = chosen.id.split('/').at(-1)

const plan = TASKS.flatMap((task, index) =>
  (options.task?.length ? options.task.includes(task.label) : true) ? task.for.filter((sample) => (options.sample?.length ? options.sample.includes(sample) : true)).map((sample) => ({ task, index, sample })) : []
)
if (!plan.length) throw new Error('No task and sample match.')

const date = new Date().toISOString().slice(0, 10)
const out = options.out ?? `evals/runs/${date}-${label.replace(/[^\w.-]+/g, '-')}${{ on: '-thinking', off: '-no-thinking' }[options.thinking] ?? ''}.json`

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', options.port, '--strictPort'], { stdio: 'ignore' })
// A run stopped part way keeps the runs written so far; the preview server goes with it.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    preview.kill()
    process.exit(130)
  })
const site = `http://127.0.0.1:${options.port}`
const browser = await chromium.launch()
const runs = []
try {
  await until(async () => (await fetch(site).catch(() => null))?.ok)
  const context = await browser.newContext()
  await context.addInitScript((saved) => localStorage.setItem('creator.model', JSON.stringify(saved)), server)

  /** Each chat completion of the run going on: why it stopped and the tokens. */
  let exchanges = []
  const origin = new URL(server.url).origin
  await context.route(
    (url) => url.origin === origin,
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const headers = { ...request.headers() }
      delete headers.origin
      delete headers.referer
      const chat = new URL(request.url()).pathname.endsWith('/chat/completions')
      const effort = { on: 'medium', off: 'none' }[options.thinking]
      const postData = chat && effort ? JSON.stringify({ ...request.postDataJSON(), reasoning_effort: effort }) : undefined
      const started = Date.now()
      const response = await route.fetch({ headers, postData, timeout: 0 })
      const body = await response.body()
      if (chat) {
        let data = null
        try {
          data = JSON.parse(body.toString())
        } catch {}
        exchanges.push({ status: response.status(), ms: Date.now() - started, finish: data?.choices?.[0]?.finish_reason ?? null, reasoning: (data?.choices?.[0]?.message?.reasoning_content ?? '').length, usage: data?.usage ?? null, timings: data?.timings ?? null })
      }
      return route.fulfill({ response, body, headers: { ...response.headers(), ...CORS } })
    }
  )

  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (error) => problems.push(error.message))
  await page.goto(`${site}/evals/`)
  await page.waitForFunction(() => document.querySelector('#outline')?.textContent?.trim())
  const environment = await page.locator('#environment').textContent()
  console.log(`${base.name}, ${server.model} (window ${server.window ?? '?'}, thinking: ${options.thinking}): ${plan.length} runs`)

  for (const [number, { task, index, sample }] of plan.entries()) {
    // The task sets the message and the outline's options; the sample is then loaded afresh.
    await page.selectOption('#task', String(index))
    await page.waitForTimeout(400)
    await page.selectOption('#sample', sample)
    await page.waitForTimeout(400)
    await page.evaluate(() => (document.querySelector('#outline').textContent = ''))
    await page.click('#reset')
    await page.waitForFunction(() => document.querySelector('#outline').textContent.trim())

    const before = await page.evaluate(() => ({ outline: document.querySelector('#outline').textContent, message: document.querySelector('#message').value, rows: document.querySelectorAll('#runs tbody tr').length }))
    exchanges = []
    const started = Date.now()
    await page.click('#run')
    await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 0, polling: 500 })
    const after = await page.evaluate((rows) => {
      const text = (selector) => document.querySelector(selector).textContent
      const items = (selector) => [...document.querySelectorAll(selector)].map((li) => li.textContent)
      const added = document.querySelectorAll('#runs tbody tr')[rows]
      const keys = [...document.querySelectorAll('#runs thead th')].map((th) => th.textContent)
      return {
        status: text('#status'),
        error: document.querySelector('#status').dataset.tone === 'error',
        answer: text('#answer'),
        applied: items('#applied li'),
        checks: items('#checks li'),
        outline: text('#outline'),
        row: added ? Object.fromEntries([...added.querySelectorAll('td')].slice(0, 10).map((td, at) => [keys[at], td.textContent])) : null
      }
    }, before.rows)
    runs.push({ task: task.label, use: task.use, sample, message: before.message, right: task.right, outlineBefore: before.outline, ...after, wall: Date.now() - started, exchanges, problems: problems.splice(0) })
    console.log(`[${number + 1}/${plan.length}] ${task.label} · ${sample}: ${after.status}`)
    await save(environment)
  }
  console.log(`\nWritten to ${out}\n\n${table()}`)
} finally {
  await browser.close()
  preview.kill()
}

async function save(environment) {
  await mkdir(dirname(out), { recursive: true })
  const machine = `${os.cpus()[0]?.model ?? os.arch()}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`
  const { key: _, ...written } = server
  await writeFile(out, `${JSON.stringify({ date, environment, machine, server: written, thinking: options.thinking, runs }, null, 2)}\n`)
}

function table() {
  const columns = ['Task', 'Sample', 'Time', 'Quota', 'Changed', 'Refused', 'Format breaks', 'Schema', 'Checks']
  const cell = (value) => String(value ?? '—').replace(/\|/g, '\\|')
  const lines = runs.map((run) => {
    const row = run.row ?? { Time: `${(run.wall / 1000).toFixed(1)} s`, Changed: '—', Refused: run.error ? run.status : '—' }
    return `| ${[run.task, run.sample, ...columns.slice(2).map((column) => row[column])].map(cell).join(' | ')} | | |`
  })
  return [`| ${[...columns, 'Verdict', 'Notes'].join(' | ')} |`, `| ${[...columns, '', ''].map(() => '---').join(' | ')} |`, ...lines].join('\n')
}

async function until(test, timeout = 20_000) {
  const end = Date.now() + timeout
  while (!(await test())) {
    if (Date.now() > end) throw new Error('The preview server did not start.')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
