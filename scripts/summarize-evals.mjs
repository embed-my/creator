/**
 * The eval runs summed up for `evals/RESULTS.md`: for each run file, the verdicts of each round,
 * so the spread between rounds shows; and for each task and sample, every round's verdict side by
 * side across the files.
 *
 * A task judged by its checks (`judged: 'checks'` in `evals/tasks.js`) gets its verdict from them
 * by the rule written there: every check passed is a pass, a failed check with something changed
 * a partial, nothing changed a fail. A task judged by reading needs the person's verdict written
 * into the run (`verdict`: pass, partial or fail, and `note`); until then it shows as "?".
 *
 *   node scripts/summarize-evals.mjs evals/runs/a.json evals/runs/b.json …
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { TASKS } from '../evals/tasks.js'

const byLabel = new Map(TASKS.map((task) => [task.label, task]))
const MARK = { pass: '✓', partial: '~', fail: '✗' }

/** A run's verdict: from its checks, or as the person wrote it; null where not judged yet. */
export function verdictOf(run) {
  if (byLabel.get(run.task)?.judged !== 'checks') return run.verdict ?? null
  if (!run.row) return 'fail'
  const [passed, total] = String(run.row.Checks).split('/').map(Number)
  if (passed === total) return 'pass'
  return Number(run.row.Changed) > 0 ? 'partial' : 'fail'
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN
}

function summary(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const name = basename(file, '.json')
  const rounds = [...new Set(data.runs.map((run) => run.round ?? 1))].sort((a, b) => a - b)
  const count = (round, verdict) => data.runs.filter((run) => (run.round ?? 1) === round && verdictOf(run) === verdict).length
  const [passed, total] = data.runs.reduce((sum, run) => (run.row ? String(run.row.Checks).split('/').map((n, at) => sum[at] + Number(n)) : sum), [0, 0])
  return {
    data,
    name,
    rounds,
    per: (verdict) => rounds.map((round) => count(round, verdict)),
    checks: `${passed}/${total}`,
    time: median(data.runs.map((run) => parseFloat(run.row?.Time ?? String(run.wall / 1000)))),
    tokens: median(data.runs.map((run) => run.exchanges.reduce((sum, each) => sum + (each.usage?.completion_tokens ?? 0), 0))),
    unjudged: data.runs.filter((run) => verdictOf(run) === null).length
  }
}

const range = (values) => (Math.min(...values) === Math.max(...values) ? String(values[0]) : `${Math.min(...values)}–${Math.max(...values)}`)

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Name the run files.')
  process.exit(1)
}
const all = files.map(summary)

console.log('| Run | Pass per round | Partial per round | Fail per round | Checks | Median time | Median tokens out |')
console.log('|---|---|---|---|---|---|---|')
for (const each of all) {
  const cells = ['pass', 'partial', 'fail'].map((verdict) => `${range(each.per(verdict))} (${each.per(verdict).join(', ')})`)
  console.log(`| ${each.name}${each.unjudged ? ` (${each.unjudged} not judged)` : ''} | ${cells.join(' | ')} | ${each.checks} | ${each.time.toFixed(1)} s | ${each.tokens} |`)
}

console.log(`\n| Task | Sample | ${all.map((each) => each.name).join(' | ')} |`)
console.log(`|---|---|${all.map(() => '---').join('|')}|`)
const seen = []
for (const run of all[0].data.runs) if (!seen.some((each) => each.task === run.task && each.sample === run.sample)) seen.push(run)
for (const { task, sample } of seen) {
  const marks = all.map((each) =>
    each.data.runs
      .filter((run) => run.task === task && run.sample === sample)
      .map((run) => MARK[verdictOf(run)] ?? '?')
      .join(' ')
  )
  console.log(`| ${task} | ${sample} | ${marks.join(' | ')} |`)
}
