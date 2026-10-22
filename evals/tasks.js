/**
 * What a real model is measured on: samples of the kinds Create makes, in three languages, and
 * the tasks a teacher would ask, each from a use case in USE-CASES.md (`use`). Each task says
 * what counts as right, for the person judging, and carries automatic checks (`checks.js`) for
 * what can be told without reading the words; `for` names the samples it is written for. The
 * English quiz carries a spelling mistake on purpose.
 */

import {
  answersDistinct,
  blanksKept,
  changedCount,
  custom,
  everyAnswerHasFeedback,
  feedbackFollowsAnswer,
  isFeedback,
  mostChanged,
  nothingEmptied,
  onlyChanged,
  rightAnswersKeepWords,
  rightAnswersStay,
  simpler,
  where,
  wordLimit,
  words,
  wrongAnswersChanged
} from './checks.js'

/** Each sample: the kind, the language, and the answer `contentFrom` makes it from. */
export const SAMPLES = {
  'quiz-en': {
    label: 'Quiz, English (3 questions, one typo)',
    kind: 'quiz',
    language: 'en',
    answer: {
      title: 'The water cycle',
      questions: [
        {
          question: 'What drives evaporaton?',
          answers: [
            { text: 'The sun', correct: true, feedback: 'Its heat turns water into vapour.' },
            { text: 'The moon', correct: false, feedback: 'The moon moves tides, not vapour.' },
            { text: 'Wind', correct: false, feedback: 'Wind helps, but heat drives it.' }
          ]
        },
        {
          question: 'What is rain called in science?',
          answers: [
            { text: 'Precipitation', correct: true, feedback: 'Rain, snow and hail are all precipitation.' },
            { text: 'Condensation', correct: false, feedback: 'That is how clouds form.' },
            { text: 'Evaporation', correct: false, feedback: 'That is water leaving the surface.' }
          ]
        },
        {
          question: 'Where does most evaporation happen?',
          answers: [
            { text: 'Over the oceans', correct: true, feedback: 'They cover most of the planet.' },
            { text: 'Over deserts', correct: false, feedback: 'Deserts have little water to give.' }
          ]
        }
      ]
    }
  },
  'quiz-bare-en': {
    label: 'Quiz, English, no feedback (3 questions)',
    kind: 'quiz',
    language: 'en',
    answer: {
      title: 'The water cycle',
      questions: [
        {
          question: 'What drives evaporation?',
          answers: [
            { text: 'The sun', correct: true },
            { text: 'The moon', correct: false },
            { text: 'Wind', correct: false }
          ]
        },
        {
          question: 'What is rain called in science?',
          answers: [
            { text: 'Precipitation', correct: true },
            { text: 'Condensation', correct: false },
            { text: 'Evaporation', correct: false }
          ]
        },
        {
          question: 'Where does most evaporation happen?',
          answers: [
            { text: 'Over the oceans', correct: true },
            { text: 'Over deserts', correct: false }
          ]
        }
      ]
    }
  },
  'quiz-dense-en': {
    label: 'Quiz, English, academic wording (3 questions)',
    kind: 'quiz',
    language: 'en',
    answer: {
      title: 'Processes of the hydrological cycle',
      questions: [
        {
          question: 'Which process is principally responsible for the transfer of water from oceanic surfaces into the atmosphere?',
          answers: [
            { text: 'Evaporation, driven predominantly by solar radiation', correct: true, feedback: 'Solar energy supplies the latent heat that converts liquid water into atmospheric water vapour.' },
            { text: 'Transpiration, occurring exclusively in vegetation', correct: false, feedback: 'Transpiration contributes atmospheric moisture, but its magnitude is considerably smaller than oceanic evaporation.' },
            { text: 'Sublimation of polar ice sheets', correct: false, feedback: 'Sublimation occurs, yet it accounts for only a negligible proportion of atmospheric water vapour.' }
          ]
        },
        {
          question: 'What is the collective term for liquid or solid water that descends from the atmosphere to the surface of the Earth?',
          answers: [
            { text: 'Precipitation', correct: true, feedback: 'Rain, snow, sleet and hail are all categorised as forms of precipitation.' },
            { text: 'Condensation', correct: false, feedback: 'Condensation denotes the transformation of vapour into droplets, which precedes precipitation.' },
            { text: 'Infiltration', correct: false, feedback: 'Infiltration describes the subsequent movement of surface water into the soil.' }
          ]
        },
        {
          question: 'Under which atmospheric conditions does condensation most readily occur?',
          answers: [
            { text: 'When air is cooled to its dew point', correct: true, feedback: 'At the dew point, the air becomes saturated and vapour condenses into droplets.' },
            { text: 'When the air temperature rises substantially', correct: false, feedback: 'Warmer air can hold more vapour, which inhibits rather than promotes condensation.' },
            { text: 'When wind speeds are exceptionally high', correct: false, feedback: 'Wind redistributes moisture, but it is cooling that brings air to saturation.' }
          ]
        }
      ]
    }
  },
  'true-false-de': {
    label: 'True or false, German (3 statements)',
    kind: 'true-false',
    language: 'de',
    answer: {
      title: 'Der Wasserkreislauf',
      statements: [
        { statement: 'Wolken bestehen aus winzigen Wassertröpfchen.', isTrue: true, explanation: 'Wasserdampf kondensiert zu Tröpfchen.' },
        { statement: 'Regen fällt nach oben.', isTrue: false, explanation: 'Die Schwerkraft zieht ihn nach unten.' },
        { statement: 'Die Sonne treibt die Verdunstung an.', isTrue: true, explanation: 'Ihre Wärme macht aus Wasser Dampf.' }
      ]
    }
  },
  'blanks-en': {
    label: 'Fill in the blanks, English (3 sentences)',
    kind: 'blanks',
    language: 'en',
    answer: {
      title: 'Words of the water cycle',
      sentences: [
        { sentence: 'Water vapour cools and forms clouds.', answer: 'clouds' },
        { sentence: 'Evaporation is driven by the Sun.', answer: 'Sun' },
        { sentence: 'Rain, snow and hail are forms of precipitation.', answer: 'precipitation' }
      ]
    }
  },
  'cards-ja': {
    label: 'Flashcards, Japanese (3 cards)',
    kind: 'cards',
    language: 'ja',
    answer: {
      title: '水の循環',
      cards: [
        { front: '蒸発', back: '水が水蒸気になること' },
        { front: '凝結', back: '水蒸気が水滴になること' },
        { front: '降水', back: '雲から雨や雪が降ること' }
      ]
    }
  }
}

const inQuestion = (index) => (node) => node.path[0] === 'questions' && node.path[1] === index
const isQuestion = (node) => node.path.at(-1) === 'question'
const isTitle = (node) => node.path.at(-1) === 'title'

/**
 * Each task: the use case it tests, the message, whether settings and empty slots are shown,
 * the samples it is for, what counts as right, the checks, and how a run is judged
 * (`judged`): by its checks alone, where they say all that "right" asks, or by a person
 * reading the words. A run judged by its checks passes when every check passes, is partial when
 * one fails and something changed, and fails when nothing changed.
 */
export const TASKS = [
  {
    label: 'Fix the spelling',
    judged: 'checks',
    use: '#6',
    message: 'Fix the spelling mistakes.',
    for: ['quiz-en'],
    right: 'Only the misspelt field changes (evaporaton → evaporation). Nothing else.',
    checks: [changedCount(1), custom('"evaporaton" is now "evaporation"', ({ after }) => after.some((node) => words(node) === 'What drives evaporation?') || 'question 1 does not read "What drives evaporation?"')]
  },
  {
    label: 'Change the title',
    judged: 'checks',
    use: '#6',
    message: 'Change the title to "Water on Earth".',
    for: ['quiz-en', 'true-false-de', 'cards-ja'],
    right: 'Only the title changes, to exactly that text.',
    checks: [changedCount(1), custom('The title reads "Water on Earth"', ({ after }) => after.some((node) => isTitle(node) && words(node) === 'Water on Earth') || 'no title reads "Water on Earth"')]
  },
  {
    label: 'Simpler reading level',
    judged: 'reading',
    use: '#3',
    message: 'Rewrite all the text for 8-year-olds: short sentences and everyday words. Keep every fact, and keep which answers are right.',
    for: ['quiz-dense-en', 'true-false-de', 'blanks-en'],
    right: 'Every field says the same in shorter sentences and simpler words; nothing is left out; right answers stay right; gap texts keep their blanks.',
    checks: [simpler(), rightAnswersStay(), nothingEmptied(), blanksKept()]
  },
  {
    label: 'Translate to German',
    judged: 'reading',
    use: '#4',
    message: 'Translate everything into German.',
    for: ['quiz-en', 'blanks-en', 'cards-ja'],
    right: 'Every text field changes, all German, blanks keep their asterisks, nothing dropped.',
    checks: [mostChanged(0.8), blanksKept(), rightAnswersStay(), nothingEmptied()]
  },
  {
    label: 'Translate to English',
    judged: 'reading',
    use: '#4',
    message: 'Translate everything into English.',
    for: ['true-false-de', 'cards-ja'],
    right: 'Every text field changes, all English.',
    checks: [mostChanged(0.8), rightAnswersStay(), nothingEmptied()]
  },
  {
    label: 'Feedback for every answer',
    judged: 'reading',
    use: '#5',
    message: 'Give every answer feedback that tells the student why it is right or wrong.',
    empty: true,
    for: ['quiz-bare-en'],
    right: 'Each answer gets feedback for when it is chosen, saying why it is right or wrong, in one short sentence; questions, answers and which is right stay as they are.',
    checks: [everyAnswerHasFeedback(), onlyChanged('Only feedback and tips change', isFeedback), rightAnswersStay()]
  },
  {
    label: 'Better wrong answers',
    judged: 'reading',
    use: '#8',
    message: 'The wrong answers are too easy to spot. Replace each wrong answer with one that students often believe, and keep the right answers as they are.',
    for: ['quiz-en', 'quiz-dense-en'],
    right: 'Each wrong answer becomes a common misconception: still wrong, on the same theme, in the same form as the right answer, not an opposite or an obvious joke. Right answers and which is right stay; feedback still fits each answer.',
    checks: [rightAnswersStay(), rightAnswersKeepWords(), wrongAnswersChanged(), answersDistinct(), feedbackFollowsAnswer()]
  },
  {
    label: 'Shorten the feedback',
    judged: 'reading',
    use: '#5',
    message: 'Make every feedback at most six words.',
    for: ['quiz-en', 'true-false-de'],
    right: 'Only feedback fields change, each six words or fewer, meaning kept.',
    checks: [onlyChanged('Only feedback changes', isFeedback), wordLimit('Every feedback has six words or fewer', isFeedback, 6)]
  },
  {
    label: 'Make question 2 harder',
    judged: 'reading',
    use: '#7',
    message: 'Make question 2 harder.',
    for: ['quiz-en'],
    right: 'Only fields of question 2 change; it is harder to answer; still one right answer, still about the water cycle.',
    checks: [
      onlyChanged('Only question 2 changes', inQuestion(1)),
      custom('Question 2 still has exactly one right answer', ({ after }) => {
        const right = after.filter((node) => inQuestion(1)(node) && node.path.at(-1) === 'correct' && node.value === true).length
        return right === 1 || `${right} right answers`
      })
    ]
  },
  {
    label: 'Swap the correct answer',
    judged: 'checks',
    use: '#6',
    message: 'In question 1, make "The moon" the correct answer and "The sun" wrong.',
    for: ['quiz-en'],
    right: 'The two Correct fields of question 1 swap; nothing else.',
    checks: [
      changedCount(2),
      custom('In question 1, "The moon" is right and "The sun" is wrong', ({ after }) => {
        const correct = (text) => {
          const answer = after.find((node) => inQuestion(0)(node) && node.path.at(-1) === 'text' && words(node) === text)
          return answer && after.find((node) => node.path.join('.') === [...answer.path.slice(0, -1), 'correct'].join('.'))?.value
        }
        return (correct('The moon') === true && correct('The sun') === false) || `The moon: ${correct('The moon')}, the sun: ${correct('The sun')}`
      })
    ]
  },
  {
    label: 'Pass percentage (settings)',
    judged: 'checks',
    use: '#10',
    message: 'Set the pass percentage to 60.',
    settings: true,
    for: ['quiz-en', 'true-false-de'],
    right: 'Only the pass percentage setting changes, to 60.',
    checks: [changedCount(1), custom('The pass percentage is 60', ({ after }) => after.some((node) => node.path.join('.') === 'passPercentage' && node.value === 60) || 'it is not 60')]
  },
  {
    label: 'Bold the key word',
    judged: 'checks',
    use: '#6',
    message: 'Put the most important word of each question in bold.',
    for: ['quiz-en'],
    right: 'Questions keep their words, one in **bold** each; the result plays with <strong>.',
    checks: [
      onlyChanged('Only the questions change', isQuestion),
      custom('Each question has one bold word or phrase, and the same words', ({ before, after }) => {
        const was = new Map(before.map((node) => [node.path.join('.'), node]))
        const problems = after
          .filter(isQuestion)
          .flatMap((node) => {
            const bold = (node.text ?? '').match(/<strong>/g)?.length ?? 0
            const same = words(node) === words(was.get(node.path.join('.')))
            return [...(bold === 1 ? [] : [`${where(node)} has ${bold} bold parts`]), ...(same ? [] : [`${where(node)} has other words`])]
          })
        return problems.length === 0 || problems.join('; ')
      })
    ]
  },
  {
    label: 'Blanks: new sentence',
    judged: 'reading',
    use: '#6',
    message: 'Replace the last sentence with one about rivers flowing to the sea, with "sea" as the blank.',
    for: ['blanks-en'],
    right: 'Only the last text block changes; it is about rivers and contains *sea*.',
    checks: [changedCount(1), custom('The last sentence has *sea* as its blank', ({ after }) => /\*sea\*/i.test(after.filter((node) => node.dialect === 'blanks').at(-1)?.text ?? '') || 'no *sea* in the last sentence')]
  }
]
