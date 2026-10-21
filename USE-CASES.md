# Use cases

What teachers want from AI, as surveys and the tools they use show it, ranked by how often they
want it, how well it suits this app, and what it would take. The first eight are the first test
set: each is an eval task on the eval page (`evals/tasks.js`, its `use` field) with automatic
checks (`evals/checks.js`) and a description of what a person judges. Researched on 2026-10-21;
sources at the end.

## The table

**Popularity** is how often teachers use or ask for it. **Fit** is how directly it is a job for an
H5P activity editor. **Complexity** is what it takes here.

| # | Feature | Popularity | Fit | Complexity | Evidence · status |
|---|---|---|---|---|---|
| 1 | Quiz from your text, with plausible wrong answers | High | High | Low | 25% of US teachers make assessments with AI at least monthly (Gallup); 2nd in MagicSchool's most-used list; in H5P Smart Import. Built: Create |
| 2 | Other activities from text: true/false, gap fill, flashcards | High | High | Low | 33% make worksheets or activities monthly (Gallup); UK teachers rated generated lesson materials 4.5/5 for time saved and 4.5/5 for likely use. Built: Create, four kinds |
| 3 | Change the reading level | High | High | Low | 28% modify materials monthly, and 64% of them see better quality (Gallup); UK top 5 for saving time and for improving practice; 1st in MagicSchool's list. Works as an edit |
| 4 | Translate an activity | Medium | High | Low | No survey figure; Wayground (20+ languages, vendor claim), Smart Import's output language, interest in multilingual learners. Works: Gemma 4 E4B translated all 20 fields |
| 5 | Feedback and explanations for every answer | Medium | High | Low | A UK hackathon task; Moodle's "explain"; "reframing concepts for students who had not understood" is a UK top-5 wish. Works since 2026-10-21 (empty slots) |
| 6 | Small fixes by chat: a typo, the title, which answer is right | Medium\* | High | Low | Basic to any editor. Built |
| 7 | Harder or easier questions, across difficulty levels | Medium–High | High | Low–Med | UK "questions across a range of difficulty": 4.7/5 time saved, 4/5 on standards. Works for changes; adding needs #9 |
| 8 | Better wrong answers, built on misconceptions | Medium | High | Medium | The main quality gap: 37% of GPT-4's wrong answers usable as they were and 20% rejected (maths pilot, 4 teachers, 60 wrong answers); 53% rated high quality in a Ghent study. Judged by a person |
| 9 | Add, remove or reorder questions | Medium\* | High | Medium | Basic to any editor. Planned: insert/remove/move with recipes |
| 10 | Settings in words: retries, solutions, pass mark | Low\* | High | Low | Replaces H5P's settings forms. Works |
| 11 | Focus and audience before creating ("only condensation", "for Year 4") | Medium | High | Low | Smart Import's concept review and custom prompt. Create needs a notes field |
| 12 | An easier or harder copy for one group | High | High | Medium | Differentiation: UK top 5, Gallup's 28%. The edit works; needs "save as a copy" |
| 13 | Revision questions for a known confusion ("they mix up X and Y") | Medium | Med–High | Medium | A UK hackathon task; the UK prototype made revision activities. Needs #9 |
| 14 | From a PDF or Word file | High | Medium | Medium | Input in Smart Import, Wayground, Brisk. Text extracted on the computer; long files exceed the window |
| 15 | From video or audio | Medium–High | Low–Med | High | Smart Import, Brisk. Needs local transcription; Interactive Video is not a text-only type |
| 16 | A lesson bundle in one book: summary, cards, quiz | Medium | Medium | High | Smart Import makes an Interactive Book. Needs layout-driven types |
| 17 | Alt text and accessibility for images | Low–Med | Low (now) | Med–High | Media is read-only here; needs a model that reads images |
| 18 | Marking students' work, essay feedback | Very high | Low | High | UK #1 time saver, but trust is low (2.5/5 on standards); 16% use AI to grade (Gallup). Needs student data. Out of scope |
| 19 | Lesson plans | High | Low | — | 37% use AI to prepare to teach (Gallup); UK teachers rated generated plans 2.3/5 for likely use. Not an H5P activity. Out |
| 20 | Admin, reports, letters to parents, data analysis | High | None | — | 28% use AI for admin, 12% to analyse data (Gallup); data work is UK #2. Out |

\* Not asked about in the surveys; included because an editor needs it.

The Gallup and UK figures are independent research. MagicSchool's list, Brisk's and Wayground's
features come from the companies themselves, and MagicSchool's numbered list is not stated to be a
usage rank.

## The first test set

Each eval task runs on the samples it names (`for`), and its checks run when the message is the
task's own. A check catches what is plainly wrong without reading the words; the words are for
the person judging, against **Right when**. The count of passed checks goes in the runs table.

### 1–2. An activity from your text (Create)

Not on the eval page yet: Create is tried in the app, with a passage, a kind, a count and a
language. Right when: the count is honoured; each question has exactly one right answer and every
answer its feedback; every fact is in the text; the wrong answers are plausible (see #8); the
activity is in the language chosen. An eval mode for Create is in AGENTS.md's Left to do.

### 3. Change the reading level

| Task | Samples | Checked automatically |
|---|---|---|
| Simpler reading level: "Rewrite all the text for 8-year-olds: short sentences and everyday words. Keep every fact, and keep which answers are right." | quiz-dense-en, true-false-de, blanks-en | Shorter sentences or shorter words, and neither got longer (words per sentence, letters per word); which answers are right stays; no field left empty; gap texts keep their blanks |

Right when every field says the same in shorter sentences and simpler words, and nothing is left
out. `quiz-dense-en` is written in academic English so the change can be measured.

### 4. Translate an activity

| Task | Samples | Checked automatically |
|---|---|---|
| Translate to German | quiz-en, blanks-en, cards-ja | At least 80% of the text changed; blanks kept; right answers stay; nothing emptied |
| Translate to English | true-false-de, cards-ja | At least 80% of the text changed; right answers stay; nothing emptied |

Right when every field is in the new language and means the same. A word that is the same in both
languages ("Wind") may stay. H5P's own buttons are the player's: they follow `h5p.json`'s language.

### 5. Feedback for every answer

| Task | Samples | Checked automatically |
|---|---|---|
| Feedback for every answer: "Give every answer feedback that tells the student why it is right or wrong." | quiz-bare-en | Every answer has feedback for when it is chosen; only feedback and tips change; right answers stay |
| Shorten the feedback | quiz-en, true-false-de | Only feedback changes; every feedback has six words or fewer |

Right when each feedback says why that answer is right or wrong, in one short sentence, and fits
the answer it belongs to. `quiz-bare-en` is the quiz with no feedback at all; the task shows the
outline's empty slots (`empty: true`).

### 6. Small fixes by chat

Fix the spelling (exactly one field changed, and it is the typo fixed), Change the title (one
field, the new title), Swap the correct answer (the two Correct fields of question 1 swap), Bold
the key word (only questions change, each with one bold part and the same words), Blanks: new
sentence (one field, `*sea*` as its blank). The checks say what changed instead when it is not
what was asked.

### 7. Harder questions

Make question 2 harder: only question 2 changes, and it still has exactly one right answer. Right
when it is harder to answer and still about the water cycle.

### 8. Better wrong answers

| Task | Samples | Checked automatically |
|---|---|---|
| Better wrong answers: "The wrong answers are too easy to spot. Replace each wrong answer with one that students often believe, and keep the right answers as they are." | quiz-en, quiz-dense-en | Right answers stay right and keep their words; every wrong answer has new words; no question offers the same answer twice; a changed answer's feedback changes with it |

Right when each wrong answer is a common misconception, judged as Oak National Academy's
teachers judge distractors:

- **Strong:** reflects a misconception students really hold; on the same theme as the others;
  in the same grammatical form as the right answer.
- **Weak:** the opposite of the right answer; grammar that gives it away; an obvious choice that
  repeats the question's words; a joke.

## Gaps found while writing the test set

- **Empty feedback was invisible to the model** (#5): the content model left out empty text
  fields, so an answer without feedback had no line to fill. Fixed on 2026-10-21: an empty field
  of the author's in a list item (an answer's feedback, its tip) is an empty slot, shown when a
  turn asks for it, and written as H5P's editor writes it. An image's alt text is left out until
  media can be edited.
- **True/False's feedback is not a slot** when empty: it sits in the statement's settings, not
  in a list item. Create always writes it, so no sample lacks it yet.
- **Create takes no audience or focus** (#11), and the chat cannot add a question (#9, #13).

## Later, and out of scope

Rows 9–17 come with the features they need: insert/remove/move (#9, #13), a notes field in
Create (#11), save as a copy (#12), source documents and media (#14–#17). Rows 18–20 are not
jobs for an activity editor.

## Sources

- Gallup / Walton Family Foundation, *Teaching for Tomorrow* (2025): <https://nextgeninsights.waltonfamilyfoundation.org/wp-content/uploads/2025/06/Teachers_AI_Report.pdf>, and Gallup's summary: <https://news.gallup.com/poll/691967/three-teachers-weekly-saving-six-weeks-year.aspx>
- RAND, AI use in schools: <https://www.rand.org/pubs/research_reports/RRA4180-1.html>
- UK Department for Education, *Use cases for generative AI in education: user research report* (2024): <https://assets.publishing.service.gov.uk/media/66cdb078f04c14b05511b322/Use_cases_for_generative_AI_in_education_user_research_report.pdf>
- MagicSchool, most used classroom AI tools 2025: <https://www.magicschool.ai/blog-posts/most-used-classroom-ai-tools-2025>
- Brisk Teaching review: <https://fltmag.com/brisk-teaching/>
- Wayground (formerly Quizizz) AI features: <https://thejournal.com/Articles/2025/06/24/Quizizz-Rebrands-as-Wayground-Announces-New-AI-Features.aspx?p=1>
- H5P Smart Import: <https://help.h5p.com/hc/en-us/articles/11700800414237-Smart-Import-Step-by-Step-Tutorial>
- Oak National Academy, quality of AI-generated resources: <https://thenational.academy/blog/how-do-we-ensure-our-ai-generated-resources-are-high-quality>
- Math MCQ generation via human–LLM collaboration (arXiv 2405.00864): <https://arxiv.org/pdf/2405.00864>
- Ghent University / imec, distractor generation: <https://ar5iv.labs.arxiv.org/html/2307.16338>
- Moodle AI tools: <https://docs.moodle.org/en/AI_tools>
