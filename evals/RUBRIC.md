# How a run is judged

Each task in `evals/tasks.js` says how its runs are judged (`judged`). This page is the rule for
both ways. Change it before reading runs, never while.

## By the checks

Fix the spelling, Change the title, Swap the correct answer, Pass percentage and Bold the key
word are judged by their checks alone, because the checks say all that "right" asks. The
most important word is a matter of taste, so any one bold word per question passes.

- **pass:** every check passed.
- **partial:** a check failed, and something changed.
- **fail:** nothing changed.

`scripts/summarize-evals.mjs` applies this rule, so no person decides these.

## By reading

The other tasks are read against the content before and after. Every failure is said in a note.
Where a run fits two verdicts, the worse one counts.

### Simpler reading level

- **pass:** every field in plainer words or shorter sentences; every fact kept; the terms the
  questions teach kept (the right answers' terms, the blanks).
- **partial:** a taught term replaced ("Precipitation" became "Falling Water"); a wrong word or a
  grammar error a student reads; or barely changed.
- **fail:** a fact changed, or a right answer made wrong.

### Translate to German, Translate to English

- **pass:** every field in the language asked for, with the same meaning and the subject's own
  terms ("Verdunstung" for evaporation).
- **partial:** one wrong term or grammar error in what students read; or a field left
  untranslated that is not the same word in both languages.
- **fail:** several fields untranslated, or a meaning changed.

### Feedback for every answer

- **pass:** every answer has "if selected" feedback that says rightly why that answer is right
  or wrong; nothing else changed.
- **partial:** some answers without feedback; or feedback that is right but says nothing of why.
- **fail:** feedback in the wrong slot (a tip, an "if not selected" message); or feedback that
  calls a wrong answer right, or a right one wrong.

### Better wrong answers

- **pass:** every wrong answer replaced by one students could believe, on the theme, in the same
  form and about the length of the right answer; each with feedback that fits it and says why
  it is wrong; the right answers unchanged.
- **partial:** some new wrong answers weak (another term rather than a misconception); some
  longer, so the right answer stands out; some unchanged; or some feedback stale.
- **fail:** feedback that calls a wrong answer right; or a right answer changed or made wrong.

### Shorten the feedback

- **pass:** every feedback six words or fewer, with its meaning; nothing else changed.
- **partial:** one feedback over the limit; or one that lost its meaning or its grammar.
- **fail:** several over the limit; or a feedback moved to the wrong answer.

### Make question 2 harder

- **pass:** question 2 harder to answer, not only reworded; still about the water cycle; the
  answer marked right still right.
- **partial:** reworded but no harder; or one wrong answer swapped and nothing else.
- **fail:** the answer marked right is no longer right.

### Blanks: new sentence

- **pass:** the last line is about rivers flowing to the sea, with *sea* as its blank; nothing
  else changed.
- **partial:** the line is off the subject, or reads badly.
- **fail:** no blank, or other lines changed.

## Who judges

Runs judged by reading are shuffled across the setups being compared and shown without saying
which setup made them. Two judges read each one on their own. Where they agree, that is the
verdict; where they differ, a third reading decides, and the disagreement is counted
(`scripts/blind-evals.mjs`). Claude instances as judges are the same family as the one that
built the harness, so not independent of it; a teacher's reading, above all in German and
Japanese, is the check they cannot give.
