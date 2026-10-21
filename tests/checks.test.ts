import { beforeAll, describe, expect, it } from 'vitest'
import { SAMPLES, TASKS } from '../evals/tasks.js'
import { readAuthoringPack } from '../scripts/authoring-pack.mjs'
import { contentFrom } from '../src/authoring.js'
import { applyChanges } from '../src/edit/operations.js'
import { contentModel } from '../src/semantics/content-model.js'
import { outline } from '../src/semantics/outline.js'

/*
 * The eval tasks' automatic checks, on runs written the way a model answers: a good answer passes
 * every check, and a bad one fails the checks it should, saying where.
 */

let pack: Awaited<ReturnType<typeof readAuthoringPack>>

beforeAll(async () => {
  pack = await readAuthoringPack()
})

/**
 * A sample as the eval page loads it, and a run on it: `edit` gives new values by field path,
 * applied as the page applies the model's changes. Returns the content model before and after.
 */
function run(sample: keyof typeof SAMPLES, edit: Record<string, unknown>) {
  const { kind, answer, language } = SAMPLES[sample]
  const content = contentFrom(kind, answer, { pack, language })
  const main = content.manifest.preloadedDependencies[0]
  const library = `${main.machineName} ${main.majorVersion}.${main.minorVersion}`
  const before = contentModel(content.params, library, pack, language)
  const { byId } = outline(before, { settings: true, empty: true })
  const ids = new Map([...byId].map(([id, node]) => [node.path.join('.'), id]))
  const changes = Object.fromEntries(Object.entries(edit).map(([path, value]) => [ids.get(path) ?? `no field at ${path}`, value]))
  const { params, violations } = applyChanges(content.params, changes, byId)
  expect(violations).toEqual([])
  return { before, after: contentModel(params, library, pack, language) }
}

/** Each check of a task on a run: `true`, or what it said. */
function checked(label: string, runResult: ReturnType<typeof run>) {
  const task = TASKS.find((each) => each.label === label)!
  return Object.fromEntries(task.checks.map((each) => [each.name, each.test(runResult)]))
}

const answer = (question: number, index: number, field = 'text') => `questions.${question}.params.answers.${index}.${field === 'text' ? 'text' : `tipsAndFeedback.${field}`}`

describe('every task', () => {
  it('names its use case, its samples, what counts as right and at least one check', () => {
    for (const task of TASKS) {
      expect(task.use, task.label).toMatch(/^#\d+$/)
      expect(task.for.length, task.label).toBeGreaterThan(0)
      for (const sample of task.for) expect(SAMPLES, `${task.label}: ${sample}`).toHaveProperty(sample)
      expect(task.right, task.label).toBeTruthy()
      expect(task.checks.length, task.label).toBeGreaterThan(0)
    }
  })
})

describe('better wrong answers (#8)', () => {
  it('passes misconceptions in place of the wrong answers, with feedback to match', () => {
    const result = checked(
      'Better wrong answers',
      run('quiz-en', {
        [answer(0, 1)]: 'Wind blowing over the sea',
        [answer(0, 1, 'chosenFeedback')]: 'Wind speeds it up, but the sun supplies the heat.',
        [answer(0, 2)]: 'Heat from inside the Earth',
        [answer(0, 2, 'chosenFeedback')]: 'Most of that heat stays deep underground.',
        [answer(1, 1)]: 'Condensation',
        [answer(1, 2)]: 'Humidity',
        [answer(1, 2, 'chosenFeedback')]: 'Humidity is the water vapour in the air.',
        [answer(2, 1)]: 'Over rainforests',
        [answer(2, 1, 'chosenFeedback')]: 'Rainforests are wet, but oceans are far larger.'
      })
    )
    // One wrong answer was kept: the check names it, and the rest pass.
    expect(result['Every wrong answer has new words']).toBe('question 2, answer 2, Text ("Condensation") is unchanged')
    expect(Object.entries(result).filter(([, outcome]) => outcome !== true).map(([name]) => name)).toEqual(['Every wrong answer has new words'])
  })

  it('fails a changed right answer, a repeated answer and feedback that no longer fits', () => {
    const result = checked('Better wrong answers', run('quiz-en', { [answer(0, 0)]: 'Sunlight', [answer(0, 1)]: 'Sunlight' }))
    expect(result['Which answers are right stays as it was']).toBe(true)
    expect(result["The right answers' words stay"]).toBe('question 1, answer 1, Text: "The sun" → "Sunlight"')
    expect(result['No question offers the same answer twice']).toBe('question 1, answer 2, Text repeats "Sunlight"')
    expect(result["A changed answer's feedback changes with it"]).toMatch(/^question 1, answer 1, Message displayed if answer is selected still says "Its heat turns water into vapour."/)
  })
})

describe('feedback for every answer (#5)', () => {
  const feedbackFor = (count: number) => {
    const edit: Record<string, string> = {}
    const answers = [3, 3, 2]
    let given = 0
    answers.forEach((total, question) => {
      for (let index = 0; index < total && given < count; index++, given++) edit[answer(question, index, 'chosenFeedback')] = `Feedback ${given + 1}.`
    })
    return edit
  }

  it('passes feedback written into every empty slot', () => {
    const result = checked('Feedback for every answer', run('quiz-bare-en', feedbackFor(8)))
    expect(Object.values(result)).toEqual([true, true, true])
  })

  it('names the answers left without, and anything else that changed', () => {
    const result = checked('Feedback for every answer', run('quiz-bare-en', { ...feedbackFor(7), 'questions.0.params.question': 'What powers evaporation?' }))
    expect(result['Every answer has feedback for when it is chosen']).toBe('question 3, answer 2, Text ("Over deserts") has none')
    expect(result['Only feedback and tips change']).toBe('question 1, Question changed too')
  })
})

describe('simpler reading level (#3)', () => {
  it('passes shorter sentences in everyday words, and fails the text as it was', () => {
    const simple = run('quiz-dense-en', {
      'introPage.title': 'How water moves',
      'questions.0.params.question': 'What moves water from the sea into the air?',
      [answer(0, 0)]: 'The sun heats it',
      [answer(0, 0, 'chosenFeedback')]: 'The sun warms the water. It turns into vapour.',
      [answer(0, 1)]: 'Plants breathing it out',
      [answer(0, 1, 'chosenFeedback')]: 'Plants give off some water. The sea gives much more.',
      [answer(0, 2)]: 'Ice turning into gas',
      [answer(0, 2, 'chosenFeedback')]: 'This happens. But only a little.',
      'questions.1.params.question': 'What do we call rain and snow?',
      [answer(1, 0, 'chosenFeedback')]: 'Rain, snow and hail are all precipitation.',
      [answer(1, 1, 'chosenFeedback')]: 'This is how clouds form. It comes before rain.',
      [answer(1, 2)]: 'Soaking in',
      [answer(1, 2, 'chosenFeedback')]: 'This is water going into the soil.',
      'questions.2.params.question': 'When do clouds form?',
      [answer(2, 0)]: 'When air gets cold',
      [answer(2, 0, 'chosenFeedback')]: 'Cold air cannot hold much water. Drops form.',
      [answer(2, 1)]: 'When air gets hot',
      [answer(2, 1, 'chosenFeedback')]: 'Hot air holds more water. So no drops form.',
      [answer(2, 2)]: 'When it is very windy',
      [answer(2, 2, 'chosenFeedback')]: 'Wind moves water. Cold air makes the drops.'
    })
    expect(checked('Simpler reading level', simple)).toEqual({
      'Shorter sentences or shorter words, and neither got longer': true,
      'Which answers are right stays as it was': true,
      'No field is left empty': true,
      'Every gap text keeps its blanks': true
    })
    expect(checked('Simpler reading level', run('quiz-dense-en', {}))['Shorter sentences or shorter words, and neither got longer']).toMatch(/^words per sentence [\d.]+ → [\d.]+, letters per word/)
  })
})

describe('the others', () => {
  it('pass a right answer and say what is wrong with a wrong one', () => {
    expect(Object.values(checked('Fix the spelling', run('quiz-en', { 'questions.0.params.question': 'What drives evaporation?' })))).toEqual([true, true])
    expect(checked('Fix the spelling', run('quiz-en', { 'introPage.title': 'Water' }))['"evaporaton" is now "evaporation"']).toBe('question 1 does not read "What drives evaporation?"')

    const swapped = checked('Swap the correct answer', run('quiz-en', { 'questions.0.params.answers.0.correct': false, 'questions.0.params.answers.1.correct': true }))
    expect(Object.values(swapped)).toEqual([true, true])

    const translated = checked('Translate to German', run('blanks-en', { 'questions.0': 'Wasserdampf kühlt ab und bildet *Wolken*.', 'questions.1': 'Die Verdunstung wird von der *Sonne* angetrieben.', 'questions.2': 'Regen, Schnee und Hagel sind Formen von *Niederschlag*.' }))
    expect(Object.values(translated)).toEqual([true, true, true, true])
    expect(checked('Translate to German', run('blanks-en', { 'questions.0': 'Wasserdampf kühlt ab und bildet *Wolken*.' }))['At least 80% of the text changed']).toBe('1 of 3 changed')

    const shortened = checked('Shorten the feedback', run('true-false-de', { 'questions.0.params.behaviour.feedbackOnWrong': 'Dampf wird zu Tröpfchen, wenn die Luft abkühlt.' }))
    // German content reads with H5P's German labels.
    expect(shortened['Every feedback has six words or fewer']).toBe('question 1, Rückmeldung bei falscher Antwort has 8 words')
  })
})
