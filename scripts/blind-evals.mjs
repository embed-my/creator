/**
 * Blind judging for the runs judged by reading (`evals/RUBRIC.md`). `pack` shuffles those runs from
 * the run files given, under random ids, into a pack for the judges that does not say which run
 * file (which setup) each came from, and a key kept apart. `merge` takes two judges' verdicts and
 * the decisions on where they differ, writes the verdict into each run, and says how often the
 * two judges agreed.
 *
 *   node scripts/blind-evals.mjs pack <dir> evals/runs/a.json evals/runs/b.json …
 *   node scripts/blind-evals.mjs merge <dir>
 *
 * In <dir>: pack.md for the judges; key.json, the id of each run and where it is; judge-a.json and
 * judge-b.json, each { id: { verdict, note } }, written by the judges; decided.json, the same
 * shape, for the ids where they differ.
 *
 * Each run is shown as the outline the model read, the changed lines with their new values.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASKS } from '../evals/tasks.js'

const [command, dir, ...files] = process.argv.slice(2)
const reading = new Set(TASKS.filter((task) => task.judged === 'reading').map((task) => task.label))
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** A stored value as the outline shows text: the wrapper and entities gone, inline tags kept. */
const plain = (value) =>
  String(value)
    .replace(/<\/?(?:div|p)(?:\s[^>]*)?>/g, '')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

/** The outline before, each changed line followed by its new value. */
function view(run) {
  const changed = new Map()
  for (const line of run.applied) {
    const match = /^([ts]\d+) [^:]*?: ([\s\S]*?) → ([\s\S]*)$/.exec(line)
    if (match) changed.set(match[1], plain(match[3]))
  }
  const refused = run.applied.filter((line) => !/ → /.test(line))
  const lines = run.outlineBefore.split('\n').map((line) => {
    const id = /^([ts]\d+) /.exec(line)?.[1]
    return id && changed.has(id) ? `${line}\n      ⟶ ${JSON.stringify(changed.get(id))}` : line
  })
  return { text: lines.join('\n'), refused }
}

if (command === 'pack') {
  mkdirSync(dir, { recursive: true })
  const entries = []
  for (const file of files) read(file).runs.forEach((run, index) => reading.has(run.task) && entries.push({ file, index, run }))
  // Shuffled, so neither the order nor the ids say which file a run came from.
  for (let at = entries.length - 1; at > 0; at--) {
    const other = randomBytes(4).readUInt32LE() % (at + 1)
    ;[entries[at], entries[other]] = [entries[other], entries[at]]
  }
  const key = {}
  const sections = entries.map(({ file, index, run }) => {
    let id
    do id = `r${randomBytes(3).toString('hex')}`
    while (key[id])
    key[id] = { file, index }
    const { text, refused } = view(run)
    return [
      `## ${id} · ${run.task} · ${run.sample}`,
      '',
      `The teacher asked: ${run.message}`,
      `The model replied: ${JSON.stringify(JSON.parse(run.answer.split('\n\n— after the refusals —')[0] || '{}').reply ?? '')}`,
      ...(refused.length ? [`Still refused at the end: ${refused.join('; ')}`] : []),
      '',
      'The activity before, each changed line followed by ⟶ and its new value:',
      '',
      '```text',
      text,
      '```'
    ].join('\n')
  })
  writeFileSync(
    join(dir, 'pack.md'),
    `# Runs to judge\n\n${entries.length} runs, in no order. Judge each by \`evals/RUBRIC.md\`, by reading, and write { "<id>": { "verdict": "pass" | "partial" | "fail", "note": "…" } } for every id. Say every failure in the note.\n\n${sections.join('\n\n')}\n`
  )
  writeFileSync(join(dir, 'key.json'), `${JSON.stringify(key, null, 2)}\n`)
  console.log(`${entries.length} runs packed into ${join(dir, 'pack.md')}`)
} else if (command === 'merge') {
  const key = read(join(dir, 'key.json'))
  const [a, b] = ['judge-a.json', 'judge-b.json'].map((name) => read(join(dir, name)))
  const decided = existsSync(join(dir, 'decided.json')) ? read(join(dir, 'decided.json')) : {}
  const byFile = new Map()
  const disagreements = []
  let agreed = 0
  for (const [id, { file, index }] of Object.entries(key)) {
    if (!a[id] || !b[id]) throw new Error(`${id} has no verdict from judge ${a[id] ? 'B' : 'A'}`)
    const data = byFile.get(file) ?? read(file)
    byFile.set(file, data)
    const run = data.runs[index]
    const same = a[id].verdict === b[id].verdict
    if (same) agreed++
    else disagreements.push({ id, task: run.task, a: a[id].verdict, b: b[id].verdict, decided: decided[id]?.verdict ?? null })
    const final = same ? a[id] : decided[id]
    run.judges = { id, a: a[id], b: b[id], ...(same ? {} : { decided: decided[id] ?? null }) }
    if (final) {
      run.verdict = final.verdict
      run.note = same ? [a[id].note, b[id].note].filter(Boolean).join(' / ') : final.note
    } else {
      delete run.verdict
      delete run.note
    }
  }
  for (const [file, data] of byFile) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  const total = Object.keys(key).length
  console.log(`The judges agreed on ${agreed} of ${total} runs (${Math.round((agreed / total) * 100)}%).`)
  const open = disagreements.filter((each) => !each.decided)
  for (const each of disagreements) console.log(`  ${each.id} ${each.task}: A ${each.a}, B ${each.b}${each.decided ? `, decided ${each.decided}` : ', not decided yet'}`)
  if (open.length) console.log(`${open.length} still to decide, in decided.json.`)
} else {
  console.error('Use: pack <dir> <run files…>, or merge <dir>')
  process.exit(1)
}
