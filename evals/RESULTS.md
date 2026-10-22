# Eval results

The eval page's tasks (`evals/tasks.js`) run against real models on a computer like a teacher's:
each task on each sample it is written for, 23 runs in all. The runs are made with
`scripts/run-evals.mjs`, which drives the eval page itself, so they go through the same code as a
run by hand. Each run's outline, answer, changes and checks are kept in `evals/runs/`. The
automatic checks count in **Checks**. The **Verdict** is a person reading the words against the
task's "Right when" (USE-CASES.md):

- **pass:** usable as it is.
- **partial:** right in part; another turn or a fix by hand is needed.
- **fail:** wrong, or not done.

**Time** is the page's, from asking to applying, both tries included. **Tokens** is what the
conversation used, out of the model's window.

## In short

| Model | Thinking | Runs | Pass | Partial | Fail | Checks | Median time | Longest |
|---|---|---|---|---|---|---|---|---|
| Gemma 4 E4B (Q6_K) | on, Unsloth's default | 23 | **15** | 6 | 2 | 60/67 | **20.4 s** | 81.4 s |
| Gemma 4 E4B (Q6_K) | off | 23 | 6 | 8 | 9 | 50/67 | 4.7 s | 15.2 s |
| Qwen3.5 4B (Q8_0) | off, Unsloth's default | 23 | 12 | 4 | 7 | 58/67 | 5.2 s | 17.9 s |
| Qwen3.5 4B (Q8_0) | on | 17, then stopped | 9 | 6 | 2 | 49/55 | 326 s | 1173 s |

Gemma 4 E4B with thinking on is the only setup here that is both mostly right and quick enough
to wait for. Without thinking, both models answer in seconds but get a third of the tasks wrong.
With thinking, Qwen3.5 4B is about as good as Gemma, but it thought for 1,500 to 10,000 tokens
per run, even to change a title. A run took 5 minutes in the middle and up to 20, so it was
stopped after 17 of 23 runs. No teacher waits that long for an edit.

## 2026-10-22 · Gemma 4 E4B (Q6_K) · Unsloth Studio

Apple M1 Pro, 16 GB, macOS 26 (Darwin 25.6.0). Unsloth Studio (unsloth 2026.10.7) on 127.0.0.1, serving
`gemma-4-E4B-it-Q6_K.gguf` (lmstudio-community) through llama-server with its defaults: an 8192
window, the model's own sampling, and reasoning on. The page ran in headless Chromium 156. Every
answer kept to the schema (strict `json_schema`), and no id was made up.

Unsloth Studio starts llama-server with `--reasoning on`, so the model thinks before it answers.
The app sends nothing about it. The second run asks for no thinking (`reasoning_effort: "none"`,
the runner's `--thinking off`), to see what the thinking buys.

| | Thinking on (Unsloth's default) | Thinking off |
|---|---|---|
| Verdicts | **15 pass**, 6 partial, 2 fail | 6 pass, 8 partial, **9 fail** |
| Checks passed | 60 of 67 | 50 of 67 |
| Time per run | median 20.4 s, longest 81.4 s | median 4.7 s, longest 15.2 s |
| All 23 runs | 9 min | 2 min |
| Tokens out per run | median 580 (mostly thinking) | median 79 |
| Format breaks (refused, then fixed) | 0 | 4 |
| Most of the window used | 3334 of 8192 | 1979 of 8192 |

Generation ran at about 28 tokens a second, and the prompt was read at about 230 a second.

### Thinking on

| Task | Sample | Time | Tokens | Changed | Format breaks | Checks | Verdict | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix the spelling | quiz-en | 22.7 s | 1728/8192 | 1 | 0 | 2/2 | pass |  |
| Change the title | quiz-en | 7.2 s | 1258/8192 | 1 | 0 | 2/2 | pass |  |
| Change the title | true-false-de | 9.9 s | 1028/8192 | 1 | 0 | 2/2 | pass | an English title on a German activity, as asked |
| Change the title | cards-ja | 7.1 s | 817/8192 | 1 | 0 | 2/2 | pass |  |
| Simpler reading level | quiz-dense-en | 81.4 s | 3334/8192 | 19 | 0 | 4/4 | pass | plain words throughout; keeps "dew point" |
| Simpler reading level | true-false-de | 55.3 s | 2354/8192 | 10 | 0 | 3/4 | partial | "zieht es nach unten" for Regen (should stay "ihn"); sentences longer, words shorter |
| Simpler reading level | blanks-en | 23.5 s | 1280/8192 | 3 | 0 | 3/4 | partial | barely changed: "evaporation" stays outside the blanks; the sample is already plain |
| Translate to German | quiz-en | 41.2 s | 2118/8192 | 19 | 0 | 4/4 | pass | the typo gone in German |
| Translate to German | blanks-en | 22.3 s | 1070/8192 | 3 | 0 | 4/4 | pass |  |
| Translate to German | cards-ja | 31.5 s | 1508/8192 | 7 | 0 | 4/4 | pass | answers became phrases ("Der Vorgang, bei dem …") |
| Translate to English | true-false-de | 20.4 s | 1413/8192 | 10 | 0 | 3/3 | pass |  |
| Translate to English | cards-ja | 18.4 s | 1186/8192 | 7 | 0 | 3/3 | pass |  |
| Feedback for every answer | quiz-bare-en | 33.3 s | 2351/8192 | 9 | 0 | 2/3 | fail | one slot per answer, mostly the wrong one: "Correct!" in tips, which show before checking; "Incorrect." under "if not selected" of wrong answers |
| Better wrong answers | quiz-en | 32.4 s | 2131/8192 | 5 | 0 | 4/5 | partial | "Over tropical rainforests" good; "Gravity", "Atmospheric pressure" weak; all 5 feedbacks still about the old answers |
| Better wrong answers | quiz-dense-en | 41.5 s | 2602/8192 | 6 | 0 | 4/5 | partial | plausible, one muddled ("increases above the saturation point"); all 6 feedbacks still about the old answers |
| Shorten the feedback | quiz-en | 20.4 s | 1733/8192 | 2 | 0 | 1/2 | fail | the one feedback over six words rewritten at seven; the other five were already short |
| Shorten the feedback | true-false-de | 36.5 s | 1960/8192 | 6 | 0 | 2/2 | pass | all were six words or fewer already; shortened sensibly |
| Make question 2 harder | quiz-en | 14.3 s | 1536/8192 | 1 | 0 | 2/2 | partial | one wrong answer swapped (Evaporation → Transpiration); hardly harder |
| Swap the correct answer | quiz-en | 7.0 s | 1361/8192 | 2 | 0 | 2/2 | pass |  |
| Pass percentage (settings) | quiz-en | 11.5 s | 2130/8192 | 4 | 0 | 1/2 | partial | also each question's own pass percentage (100 → 60), which H5P says rarely has an effect |
| Pass percentage (settings) | true-false-de | 6.8 s | 1545/8192 | 1 | 0 | 2/2 | pass |  |
| Bold the key word | quiz-en | 13.3 s | 1562/8192 | 3 | 0 | 2/2 | pass | question 1 bolds "drives", not the topic word; a matter of taste |
| Blanks: new sentence | blanks-en | 7.8 s | 874/8192 | 1 | 0 | 2/2 | pass |  |

### Thinking off

| Task | Sample | Time | Tokens | Changed | Format breaks | Checks | Verdict | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix the spelling | quiz-en | 11.0 s | 1365/8192 | 3 | 0 | 1/2 | partial | the typo fixed, and "vapour" changed to "vapor" twice |
| Change the title | quiz-en | 3.7 s (2 tries) | 1268/8192 | 1 | 1 | 1/2 | fail | "The <strong>Water on Earth</strong>" |
| Change the title | true-false-de | 4.1 s | 885/8192 | 0 | 0 | 0/2 | fail | sent the old title back; replied that it had changed it |
| Change the title | cards-ja | 2.8 s | 697/8192 | 1 | 0 | 2/2 | pass |  |
| Simpler reading level | quiz-dense-en | 8.3 s (2 tries) | 1538/8192 | 1 | 1 | 3/4 | fail | only the title, as "Hydrologic Cycle: Water's Journey" in bold italics; replied that all was rewritten |
| Simpler reading level | true-false-de | 8.1 s | 1063/8192 | 9 | 0 | 3/4 | partial | "Wolken sind klein und voller Wassertropfen" changes the fact |
| Simpler reading level | blanks-en | 2.3 s | 704/8192 | 1 | 0 | 3/4 | partial | one line of three changed |
| Translate to German | quiz-en | 12.2 s | 1453/8192 | 19 | 0 | 4/4 | pass | "um es abzugeben" awkward |
| Translate to German | blanks-en | 3.9 s | 723/8192 | 3 | 0 | 4/4 | partial | "vom *Sonne*": a wrong article in a sentence students read |
| Translate to German | cards-ja | 5.8 s | 765/8192 | 0 | 0 | 3/4 | fail | sent the Japanese back unchanged; replied that it had translated it |
| Translate to English | true-false-de | 2.3 s | 861/8192 | 1 | 0 | 2/3 | fail | only the title translated |
| Translate to English | cards-ja | 4.2 s | 761/8192 | 7 | 0 | 3/3 | pass |  |
| Feedback for every answer | quiz-bare-en | 15.2 s | 1747/8192 | 13 | 0 | 2/3 | fail | both "if selected" and "if not selected" filled; "Correct!" on Wind, a wrong answer; one answer without |
| Better wrong answers | quiz-en | 4.7 s | 1228/8192 | 4 | 0 | 3/5 | fail | "The temperature" is nearly right for what drives evaporation; question 3 unchanged; feedback stale |
| Better wrong answers | quiz-dense-en | 4.7 s | 1419/8192 | 4 | 0 | 3/5 | fail | question 3 unchanged; one distractor barely changed; feedback stale |
| Shorten the feedback | quiz-en | 6.0 s | 1258/8192 | 6 | 0 | 2/2 | partial | all six words or fewer; "Water leaving the surface is this." |
| Shorten the feedback | true-false-de | 4.9 s | 945/8192 | 4 | 0 | 1/2 | fail | one feedback grew to seven words |
| Make question 2 harder | quiz-en | 3.7 s | 1183/8192 | 1 | 0 | 2/2 | partial | the question reworded more precisely; not harder |
| Swap the correct answer | quiz-en | 2.1 s | 1193/8192 | 2 | 0 | 2/2 | pass |  |
| Pass percentage (settings) | quiz-en | 6.6 s | 1979/8192 | 3 | 0 | 1/2 | partial | the quiz's and two of three questions' own pass percentage |
| Pass percentage (settings) | true-false-de | 4.5 s | 1479/8192 | 1 | 0 | 2/2 | pass |  |
| Bold the key word | quiz-en | 5.8 s (2 tries) | 1353/8192 | 2 | 2 | 1/2 | partial | format refused twice, then question 2 left without bold |
| Blanks: new sentence | blanks-en | 2.6 s | 689/8192 | 1 | 0 | 2/2 | pass |  |

## 2026-10-22 · Qwen3.5 4B (Q8_0) · Unsloth Studio

The same machine and server, serving `Qwen3.5-4B-Q8_0.gguf` (unsloth) with a 16384 window, as
thinking needs room: one run used 11,154 tokens. Unsloth Studio starts Qwen3.5 with reasoning
**off**, unlike Gemma 4. The second run asks for thinking (`reasoning_effort: "medium"`, the
runner's `--thinking on`). Every answer kept to the schema.

Without thinking, generation ran at about 29 tokens a second. With thinking it ran at 8–32, and
was slowest on the longest runs. The thinking run was stopped after 17 runs, at 112 minutes. The
last six runs (Make question 2 harder, Swap the correct answer, both Pass percentage runs, Bold
the key word, Blanks: new sentence) were not made.

### Thinking off (Unsloth's default for Qwen3.5)

| Task | Sample | Time | Tokens | Changed | Format breaks | Checks | Verdict | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix the spelling | quiz-en | 4.1 s | 1155/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | quiz-en | 2.2 s | 1148/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | true-false-de | 3.0 s | 848/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | cards-ja | 1.9 s | 678/16384 | 1 | 0 | 2/2 | pass |  |
| Simpler reading level | quiz-dense-en | 17.9 s | 1804/16384 | 19 | 0 | 4/4 | pass | plain throughout; two feedbacks now say "rain" where the original meant condensation |
| Simpler reading level | true-false-de | 9.1 s | 1065/16384 | 4 | 0 | 4/4 | fail | "Regen fällt nicht nach oben": the false statement became true, and its answer is still "false" |
| Simpler reading level | blanks-en | 8.1 s (2 tries) | 937/16384 | 2 | 3 | 3/4 | partial | the line with *Sun* refused twice (its blank lost) and left as it was |
| Translate to German | quiz-en | 11.0 s | 1390/16384 | 19 | 0 | 4/4 | partial | German errors: "Seine Wärme" for the sun, "die meisten Verdunstung", "Das ist, wie Wolken entstehen" |
| Translate to German | blanks-en | 3.3 s | 708/16384 | 3 | 0 | 4/4 | partial | "*wolken*" in lower case: the blank's answer itself is misspelt |
| Translate to German | cards-ja | 5.5 s | 763/16384 | 7 | 0 | 4/4 | pass | wordy answers ("Das Ereignis, dass …") |
| Translate to English | true-false-de | 8.2 s | 969/16384 | 10 | 0 | 3/3 | pass |  |
| Translate to English | cards-ja | 3.7 s | 737/16384 | 7 | 0 | 3/3 | pass |  |
| Feedback for every answer | quiz-bare-en | 5.2 s | 1434/16384 | 0 | 0 | 2/3 | fail | sent only the Correct values, unchanged, and no feedback; replied that it had added feedback |
| Better wrong answers | quiz-en | 5.2 s | 1179/16384 | 2 | 0 | 3/5 | fail | "Tides pull on the moon", "Wind creates rain"; questions 2 and 3 unchanged; feedback stale |
| Better wrong answers | quiz-dense-en | 10.0 s | 1427/16384 | 4 | 0 | 3/5 | fail | barely reworded; question 2's wrong answers now define themselves; question 3 unchanged |
| Shorten the feedback | quiz-en | 7.5 s | 1246/16384 | 1 | 0 | 2/2 | pass | the one feedback over six words shortened |
| Shorten the feedback | true-false-de | 6.3 s | 919/16384 | 4 | 0 | 2/2 | fail | statement 1's feedback on a wrong answer became the gravity sentence of statement 2 |
| Make question 2 harder | quiz-en | 3.5 s | 1168/16384 | 1 | 0 | 2/2 | fail | question 2 now asks for condensation, so the answer marked right (Precipitation) is wrong; the checks pass it |
| Swap the correct answer | quiz-en | 3.1 s | 1186/16384 | 2 | 0 | 2/2 | pass |  |
| Pass percentage (settings) | quiz-en | 5.4 s | 1921/16384 | 4 | 0 | 1/2 | partial | also each question's own pass percentage |
| Pass percentage (settings) | true-false-de | 3.2 s | 1398/16384 | 1 | 0 | 2/2 | pass |  |
| Bold the key word | quiz-en | 5.3 s | 1238/16384 | 6 | 0 | 0/2 | fail | bolded "The" in the title and two answers; "<strong>Ocean</strong>s" for "Over the oceans" |
| Blanks: new sentence | blanks-en | 2.1 s | 689/16384 | 1 | 0 | 2/2 | pass |  |

### Thinking on, stopped after 17 runs

| Task | Sample | Time | Tokens | Changed | Format breaks | Checks | Verdict | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix the spelling | quiz-en | 62.1 s | 3023/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | quiz-en | 99.1 s | 4183/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | true-false-de | 93.9 s | 3687/16384 | 1 | 0 | 2/2 | pass |  |
| Change the title | cards-ja | 49.7 s | 2162/16384 | 1 | 0 | 2/2 | pass |  |
| Simpler reading level | quiz-dense-en | 313.8 s | 10871/16384 | 22 | 0 | 4/4 | partial | the right answer "Precipitation" became "Rain, snow and ice", dropping the term the question teaches; "from liquid into air" |
| Simpler reading level | true-false-de | 632.7 s | 7981/16384 | 10 | 0 | 4/4 | partial | "zieht es" for Regen; "Wolken sind kleine Wassertropfen" shifts the fact; articles dropped ("Sonne macht …") |
| Simpler reading level | blanks-en | 800.1 s | 7266/16384 | 3 | 0 | 3/4 | partial | sentences longer, hardly simpler |
| Translate to German | quiz-en | 1172.8 s | 11154/16384 | 3 | 0 | 3/4 | fail | after 20 minutes, 3 of 20 fields translated |
| Translate to German | blanks-en | 386.1 s | 4105/16384 | 3 | 0 | 4/4 | pass |  |
| Translate to German | cards-ja | 506.7 s | 5402/16384 | 7 | 0 | 4/4 | pass |  |
| Translate to English | true-false-de | 950.5 s | 9177/16384 | 10 | 0 | 3/3 | partial | "Ihre Wärme" translated as "Your heat" |
| Translate to English | cards-ja | 402.6 s | 6040/16384 | 7 | 0 | 3/3 | pass |  |
| Feedback for every answer | quiz-bare-en | 31.0 s | 1979/16384 | 6 | 0 | 1/3 | fail | wrote the feedback over the answers themselves, in asterisks |
| Better wrong answers | quiz-en | 268.9 s | 7879/16384 | 5 | 0 | 4/5 | partial | "Over land", "Fog", "Transpiration" plausible; all 5 feedbacks still about the old answers |
| Better wrong answers | quiz-dense-en | 275.3 s | 8217/16384 | 6 | 0 | 4/5 | partial | real misconceptions ("plants supplying more moisture than oceans") but long, so the right answer stands out; feedback stale |
| Shorten the feedback | quiz-en | 331.9 s | 9431/16384 | 1 | 0 | 2/2 | pass | the one feedback over six words shortened |
| Shorten the feedback | true-false-de | 326.2 s | 8632/16384 | 0 | 0 | 2/2 | pass | changed nothing and said why: all six words or fewer already |

## What the runs show

1. **Thinking makes a small model usable, if the model thinks briefly.** With thinking on, Gemma
   4 E4B did every small fix, every translation and the reading level right. Without thinking,
   both models fail 7–9 of 23. Translations stop after the title, a title comes back in bold, and
   facts change. Qwen3.5 4B gains as much from thinking but thinks ten times longer. Each server
   decides by default, and Unsloth decides differently per model (Gemma on, Qwen off). So the app
   should recommend Gemma 4 E4B, send `reasoning_effort` itself, and say that an edit takes
   10–80 seconds.
2. **A model can say it changed what it did not.** Six replies claimed more than the answer did.
   Two sent the fields back as they were ("Der Wasserkreislauf", the Japanese text), and one sent
   only the unchanged Correct values. Three changed only the title, or 3 of 20 fields, and replied
   "I translated all …". The app shows the reply in the chat, so it has to say what actually
   changed: nothing, or how many fields of how many.
3. **Empty slots need H5P's descriptions.** "Feedback for every answer" failed in all four runs.
   Each answer offers three empty slots: "Tip text", "Message displayed if answer is selected"
   and "… is not selected". From the labels alone, Gemma chose among them almost at random. It
   wrote "Correct!" into tips, which H5P shows before the student answers, and "Incorrect." where
   the student would see it after rightly leaving a wrong answer alone. Qwen wrote the feedback
   over the answers themselves. H5P's semantics describe each field ("This will appear before
   user checks his answer"), and the outline does not show the descriptions yet.
4. **The same label for different settings.** "Pass percentage" is the quiz's ("required for
   passing the quiz") and each question's ("This setting often won't have any effect"). Asked to
   set the pass percentage, every model set them all. The descriptions would tell them apart.
5. **A changed answer keeps its old feedback.** In all eight "Better wrong answers" runs the wrong
   answers changed and their feedback did not. A student choosing "Gravity" would read "The moon
   moves tides, not vapour." The check `feedbackFollowsAnswer` finds this every time, so the app
   could ask once more about it, as it already does for a broken format.
6. **Some wrong answers pass every check.** Qwen3.5 4B turned the false statement "Regen fällt
   nach oben" into a true one and kept its answer "false". Asked to make question 2 harder, it
   rewrote the question to ask for condensation while "Precipitation" stayed the right answer.
   Only a person reading the words catches these.
7. **German.** With thinking on, Gemma's German is clean. Qwen's has mistakes with and without
   thinking: "Seine Wärme" for the sun, "die meisten Verdunstung", "Ihre Wärme" as "Your heat",
   and "*wolken*" in lower case inside a blank, so the answer students must type is misspelt.
8. **The test set itself.** "Shorten the feedback" runs on samples whose feedback is already six
   words or fewer but one, so it measures little. `quiz-dense-en`, with its long feedback, would
   measure more. The reading-level check is noisy on three short lines (blanks-en), where the
   blanks are the hard words and must stay.
