/**
 * What the real model is measured on: four samples, one per kind Create makes, in three of the
 * model's languages, and the tasks a teacher would ask. Each task says what counts as right, for
 * the person judging. The quiz carries a spelling mistake on purpose.
 */

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

/** Each task: the message, whether settings are shown, and what counts as right. */
export const TASKS = [
  { label: 'Fix the spelling', message: 'Fix the spelling mistakes.', settings: false, right: 'Only the misspelt field changes (evaporaton → evaporation in quiz-en). Nothing else.' },
  { label: 'Change the title', message: 'Change the title to "Water on Earth".', settings: false, right: 'Only t1 changes, to exactly that text.' },
  { label: 'Translate to German', message: 'Translate everything into German.', settings: false, right: 'Every text field changes, all German, blanks keep their asterisks, nothing dropped.' },
  { label: 'Translate to English', message: 'Translate everything into English.', settings: false, right: 'Every text field changes, all English (for cards-ja and true-false-de).' },
  { label: 'Shorten the feedback', message: 'Make every feedback at most six words.', settings: false, right: 'Only feedback fields change, each six words or fewer, meaning kept.' },
  { label: 'Make question 2 harder', message: 'Make question 2 harder.', settings: false, right: 'Only fields of question 2 change; still one correct answer, still about the text.' },
  { label: 'Swap the correct answer', message: 'In question 1, make "The moon" the correct answer and "The sun" wrong.', settings: false, right: 'The two Correct fields of question 1 swap; nothing else.' },
  { label: 'Pass percentage (settings)', message: 'Set the pass percentage to 60.', settings: true, right: 'Only the pass percentage setting changes, to 60.' },
  { label: 'Bold the key word', message: 'Put the most important word of each question in bold.', settings: false, right: 'Questions keep their words, one in **bold**; the result plays with <strong>.' },
  { label: 'Blanks: new sentence', message: 'Replace the last sentence with one about rivers flowing to the sea, with "sea" as the blank.', settings: false, right: 'Only the last text block changes; it contains *sea*.' }
]
