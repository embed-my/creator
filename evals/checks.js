/**
 * The eval tasks' automatic checks: what can be told from the content before and after a run
 * without judging the words — which fields changed, whether right answers stayed right, whether
 * every answer has feedback, whether the text got simpler. Each check answers `true`, or the
 * problem in words. They catch what is plainly wrong; the person judging still reads the words.
 *
 * A check is `{ name, test({ before, after }) }`, where `before` and `after` are the content
 * model's nodes (`semantics/content-model.js`), empty slots included.
 */

/** @typedef {import('../src/semantics/content-model.js').Node} Node */
/** @typedef {{ name: string, test: (run: { before: Node[], after: Node[] }) => true | string }} Check */

const key = (node) => node.path.join('.')
const last = (node) => node.path.at(-1)
const value = (node) => (node ? (node.kind === 'text' ? (node.text ?? '') : node.value) : '')

/** A node's words: its text without tags and blank marks. */
export const words = (node) => (node?.kind === 'text' ? (node.text ?? '').replace(/<[^>]+>/g, '').replace(/\*/g, '') : String(node?.value ?? ''))

/** Where a node sits, in the teacher's words: question 2, answer 3, the field's label. */
export function where(node) {
  const parts = []
  for (let index = 0; index < node.path.length - 1; index++) {
    const [name, position] = [node.path[index], node.path[index + 1]]
    if (typeof position !== 'number') continue
    if (name === 'questions') parts.push(`question ${position + 1}`)
    else if (name === 'answers') parts.push(`answer ${position + 1}`)
    else if (name === 'dialogs') parts.push(`card ${position + 1}`)
  }
  return [...parts, node.label].join(', ')
}

/** The fields whose value differs before and after, each as `{ before, after }`. */
export function changed(before, after) {
  const pairs = new Map()
  for (const node of before) if (node.kind !== 'item') pairs.set(key(node), { before: node, after: undefined })
  for (const node of after) if (node.kind !== 'item') pairs.set(key(node), { before: pairs.get(key(node))?.before, after: node })
  return [...pairs.values()].filter((pair) => value(pair.before) !== value(pair.after))
}

/** Words per sentence and letters per word over the content's text: lower is easier to read. */
export function readability(nodes) {
  const text = nodes
    .filter((node) => node.kind === 'text' && !node.empty)
    .map(words)
    .join('\n')
  const sentences = text.split(/[.!?。！？\n]+/).filter((sentence) => sentence.trim())
  const found = text.match(/[\p{L}\p{N}'’-]+/gu) ?? []
  return {
    wordsPerSentence: found.length / Math.max(sentences.length, 1),
    lettersPerWord: found.join('').length / Math.max(found.length, 1)
  }
}

const check = (name, test) => ({ name, test })
/** `true` for no problems, else the first few, said. */
const verdict = (problems) => (problems.length === 0 ? true : problems.slice(0, 3).join('; ') + (problems.length > 3 ? `; and ${problems.length - 3} more` : ''))

export const isFeedback = (node) => ['chosenFeedback', 'notChosenFeedback', 'tip', 'feedbackOnCorrect', 'feedbackOnWrong'].includes(String(last(node)))
const isAnswerText = (node) => node.kind === 'text' && /(^|\.)answers\.\d+\.text$/.test(key(node))
const answerOf = (node) => key(node).replace(/\.text$/, '')
const questionOf = (node) => key(node).replace(/\.answers\.\d+\..*$/, '')
const rightAnswers = (nodes) => new Set(nodes.filter((node) => last(node) === 'correct' && node.value === true).map((node) => key(node).replace(/\.correct$/, '')))

/** Exactly `count` fields changed. */
export const changedCount = (count) =>
  check(`Exactly ${count} field${count === 1 ? '' : 's'} changed`, ({ before, after }) => {
    const pairs = changed(before, after)
    return pairs.length === count || `${pairs.length} changed${pairs.length ? `: ${pairs.map((pair) => where(pair.after ?? pair.before)).join('; ')}` : ''}`
  })

/** Every field that changed is one `allowed` says may. */
export const onlyChanged = (name, allowed) =>
  check(name, ({ before, after }) =>
    verdict(
      changed(before, after)
        .filter((pair) => !allowed(pair.after ?? pair.before))
        .map((pair) => `${where(pair.after ?? pair.before)} changed too`)
    )
  )

/** Which answers are right is as it was: an answer's Correct, a statement's true or false. */
export const rightAnswersStay = () =>
  check('Which answers are right stays as it was', ({ before, after }) =>
    verdict(changed(before, after).filter((pair) => last(pair.before ?? pair.after) === 'correct').map((pair) => `${where(pair.before ?? pair.after)}: ${pair.before?.value} → ${pair.after?.value}`))
  )

/** No field that had words is left without them. */
export const nothingEmptied = () =>
  check('No field is left empty', ({ before, after }) => {
    const now = new Map(after.map((node) => [key(node), node]))
    return verdict(before.filter((node) => node.kind === 'text' && !node.empty && !words(now.get(key(node))).trim()).map((node) => `${where(node)} is empty`))
  })

/** Every gap text keeps as many blanks as it had. */
export const blanksKept = () =>
  check('Every gap text keeps its blanks', ({ before, after }) => {
    const count = (node) => (node?.text ?? '').match(/\*[^*\n]+\*/g)?.length ?? 0
    const now = new Map(after.map((node) => [key(node), node]))
    return verdict(before.filter((node) => node.dialect === 'blanks' && count(node) !== count(now.get(key(node)))).map((node) => `${where(node)}: ${count(node)} blank(s) → ${count(now.get(key(node)))}`))
  })

/** At least `share` of the fields with words changed, as a translation changes them. */
export const mostChanged = (share) =>
  check(`At least ${Math.round(share * 100)}% of the text changed`, ({ before, after }) => {
    const texts = before.filter((node) => node.kind === 'text' && !node.empty)
    const keys = new Set(changed(before, after).map((pair) => key(pair.before ?? pair.after)))
    const done = texts.filter((node) => keys.has(key(node))).length
    return done >= share * texts.length || `${done} of ${texts.length} changed`
  })

/** Shorter sentences or shorter words, and neither longer: easier to read. */
export const simpler = () =>
  check('Shorter sentences or shorter words, and neither got longer', ({ before, after }) => {
    const [was, is] = [readability(before), readability(after)]
    const said = `words per sentence ${was.wordsPerSentence.toFixed(1)} → ${is.wordsPerSentence.toFixed(1)}, letters per word ${was.lettersPerWord.toFixed(2)} → ${is.lettersPerWord.toFixed(2)}`
    const rose = is.wordsPerSentence > was.wordsPerSentence * 1.05 || is.lettersPerWord > was.lettersPerWord * 1.05
    const fell = is.wordsPerSentence <= was.wordsPerSentence * 0.95 || is.lettersPerWord <= was.lettersPerWord * 0.95
    return (!rose && fell) || said
  })

/** Every answer has feedback for when it is chosen. */
export const everyAnswerHasFeedback = () =>
  check('Every answer has feedback for when it is chosen', ({ after }) => {
    const byKey = new Map(after.map((node) => [key(node), node]))
    return verdict(after.filter(isAnswerText).filter((node) => !words(byKey.get(`${answerOf(node)}.tipsAndFeedback.chosenFeedback`)).trim()).map((node) => `${where(node)} ("${words(node)}") has none`))
  })

/** The right answers' words are as they were. */
export const rightAnswersKeepWords = () =>
  check("The right answers' words stay", ({ before, after }) => {
    const right = rightAnswers(before)
    return verdict(changed(before, after).filter((pair) => pair.before && isAnswerText(pair.before) && right.has(answerOf(pair.before))).map((pair) => `${where(pair.before)}: "${words(pair.before)}" → "${words(pair.after)}"`))
  })

/** Every wrong answer has new words. */
export const wrongAnswersChanged = () =>
  check('Every wrong answer has new words', ({ before, after }) => {
    const right = rightAnswers(before)
    const keys = new Set(changed(before, after).map((pair) => key(pair.before ?? pair.after)))
    return verdict(before.filter((node) => isAnswerText(node) && !right.has(answerOf(node)) && !keys.has(key(node))).map((node) => `${where(node)} ("${words(node)}") is unchanged`))
  })

/** No question offers the same answer twice. */
export const answersDistinct = () =>
  check('No question offers the same answer twice', ({ after }) => {
    const seen = new Map()
    const problems = []
    for (const node of after.filter(isAnswerText)) {
      const said = `${questionOf(node)}|${words(node).trim().toLowerCase()}`
      if (seen.has(said)) problems.push(`${where(node)} repeats "${words(node)}"`)
      seen.set(said, node)
    }
    return verdict(problems)
  })

/** Where an answer's words changed, its feedback changed with them, so it still fits. */
export const feedbackFollowsAnswer = () =>
  check("A changed answer's feedback changes with it", ({ before, after }) => {
    const keys = new Set(changed(before, after).map((pair) => key(pair.before ?? pair.after)))
    const was = new Map(before.map((node) => [key(node), node]))
    return verdict(
      [...keys]
        .filter((changedKey) => /(^|\.)answers\.\d+\.text$/.test(changedKey))
        .map((changedKey) => changedKey.replace(/\.text$/, '.tipsAndFeedback.chosenFeedback'))
        .filter((feedback) => words(was.get(feedback)).trim() && !keys.has(feedback))
        .map((feedback) => `${where(was.get(feedback))} still says "${words(was.get(feedback))}"`)
    )
  })

/** Every field `which` names has at most `count` words. */
export const wordLimit = (name, which, count) =>
  check(name, ({ after }) =>
    verdict(
      after
        .filter((node) => node.kind === 'text' && !node.empty && which(node))
        .filter((node) => (words(node).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length > count)
        .map((node) => `${where(node)} has ${(words(node).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length} words`)
    )
  )

/** A check written for one task: `test` gets the nodes after, or both. */
export const custom = (name, test) => check(name, test)
