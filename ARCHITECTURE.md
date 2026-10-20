# Architecture

h5p-create is an H5P editor driven by chat. A teacher opens or creates an activity, says what
should change, and the change plays at once. There are no forms and no fields: the model writes
the words, code writes the structure, and the H5P package is the only thing that is ever saved.

This document is the base the editor grows from. The first version is deliberately small: one
model (Chrome's on-device model, through the Prompt API), text-only content types, a hosted PWA.
What comes later — other models, media, documents as source material, a desktop app — is listed
at the end with the seam each one plugs into, and nothing in the base may close those seams.

Decided with the owner on 2026-10-19; the decision log is at the end.

## The rules every module follows

- **The model writes words, never structure and never markup.** It sees a short outline of the
  content and answers with edits to named fields. Code turns text into the field's allowed tags,
  fills every default from the library's own `semantics.json`, and refuses what the semantics
  refuse. An H5P site must be able to import the result and change nothing.
- **The `.h5p` file is the truth.** Undo history and the chat live beside it in the browser,
  keyed by the file; the file itself is written only on Save or Export. A moved or renamed file
  opens again without its history, as in any editor.
- **Pack libraries only.** Content is read, edited and played with the libraries of
  `@missing-elements/h5p-libraries`, and played `untrusted`, so the runtime's content check guards
  every edit. A package that needs a library the pack lacks opens and plays as it is, and the
  chat says it cannot be edited here.
- **Small model, small context.** Nothing assumes the model sees the whole package. Every prompt
  is a window onto the content, chosen by code, and the answer is a list of operations, not a
  rewrite.
- **The core is plain modules.** Everything under `src/` but `src/app/` runs in Node and in a
  Worker: no `document`, no `window`, and zip.js is its only dependency. The tests run it in Node;
  a desktop shell later runs it unchanged.

## Modules

```text
src/
  package/    read a .h5p (index, h5p.json, content.json); the working copy (a new content.json
              appended to the original bytes, for play); the export (a clean zip, with the pack's
              libraries and their dependencies)
  semantics/  the pack's semantics.json for every library, loaded per library; which libraries
              are text types; the content model: params walked with semantics into nodes; the
              outline the model reads; markup dialects (allowed tags, *blank* syntaxes)
  edit/       operations and their application with checks; the focus (which part of the content
              a turn is about); the prompt and the answer schema; the bounded fix loop
  create/     recipes: the shape the model writes for a new activity of a kind, and its assembly
              (today: KINDS in authoring.js, four kinds)
  model/      the model behind one small interface; one implementation, nano
  history/    IndexedDB: files, versions, chat; undo and redo
  app/        the page: the player, the chat, Open, Save, Export, Undo, versions; the service
              worker for offline
```

### package

`readPackage(file)` reads the zip's central directory and the two JSON files; nothing else is
read until asked. `withContent(file, params, manifest)` makes the working copy for the player:
the original `File` kept as the first part of a new `File`, followed by a new
`content/content.json` entry, a new central directory and end record. Measured on 2026-10-19 in
Chromium: built in 1–4 ms whatever the size, and the player reaches `ready` in 83 ms for a
Create-sized file, 305 ms at 86 MB, 370 ms at 228 MB. The old entry stays in the file as dead
bytes zip readers never visit.

`exportPackage(package, { libraries })` writes a clean zip with zip.js: `h5p.json`,
`content/`, the media carried through untouched, and the folders of every library the content
names and every library those depend on, taken from the pack's parts (`index.json` gives the
dependency closure without a request). The export imports on any H5P site whose core is new
enough and where the uploader may install libraries. `h5p.json`'s `preloadedDependencies` names
the pack's versions.

### semantics

The pack's `semantics.json` for every library, carried by the app as one lazily loaded chunk per
library (the Vite plugin `authoringPackPlugin` extended from five libraries to all). From a
library's semantics, `classify(library)` says whether it is a **text type**: every field is text,
number, boolean, select, list or group, or a library field whose options are text types. Media,
coordinates and file fields make a type not-text, and so not editable here yet.

`contentModel(params, semantics)` walks the parameters with their semantics into a tree of
nodes: `{ path, kind, label, value, constraints, children }`. Labels and descriptions come from
the semantics, so the model learns what a field means from H5P's own words. `outline(model,
focus)` renders the part a turn is about as short numbered lines:

```text
t1 Title [html: strong em sub sup code]: "The water cycle"
Question 1 (True/False Question)
t2   Question [html: strong em sub sup code]: "Rain falls upwards."
s1   Correct answer [true/false]: false
t3   Feedback on correct answer [text]: "Gravity pulls it down."
```

The ids are aliases for this turn only; code keeps the map to paths. A text value is in quotation
marks, as the answer's JSON writes it, and the system prompt shows one line and an answer for
it, so the model knows which part of a line is the value. Without them, Chrome's model wrote
`[html: strong em sub sup code]: The Water Cycle` as a title on 2026-10-20; an answer that
repeats an id, a field's name, its format or the quotation marks is refused with that rule.

**Where HTML goes is told, not filtered.** Each text field's format comes from its own
semantics: a field without `tags` is `[text]`, plain text; a field with `tags` is `[html: …]`,
listing the inline tags among them the model may write (strong, em, u, del, sub, sup, code),
without attributes. Paragraphs, line breaks, headings and links are never the model's: code
wraps paragraphs as the field's previous value did. The format is stated three times, each in
its own way: the system prompt defines the formats once; every outline line names its field's
format; text that breaks it is refused with the rule restated (`checkModelText`) and goes to the
fix round. Nothing that breaks a format is cleaned up and applied, so the evals measure whether
the explanation works. (Create, which has no second turn, is the one place markup is stripped,
as a guard.) Added on 2026-10-20 after the first run of the real model wrote `<h1>` round a
title: the first version told the model "plain text" once, globally, never per field.

A field whose text carries meaning — `*blank*` in Fill in the Blanks, Drag Text and Mark the
Words — has a **dialect** on top of its format, registered per library and field. Asterisks are
not used by any format, so a blank never collides with bold.

### edit

An edit turn: the chat message, the focus, the outline, the prompt, the answer, the operations,
the checks, the new version.

**Focus.** Code chooses what the model sees. In order: the sub-content the teacher last
interacted with in the player (H5P's xAPI statements name it, and the element relays them); a
part the message names by alias or by its words; the whole content when it fits the model's
quota; otherwise the chat asks which part. The estimate is characters over four until the Prompt
API's quota call says better.

**Operations.** `set(id, value)` for text, number, boolean and select, checked against the
field's constraints (length, range, options, allowed tags). `insert(listId, index, item)`,
`remove(id)` and `move(id, index)` for lists whose item kind has a recipe, so a new question is
written in the recipe's shape and assembled by code with every default. The answer is
`{ changes: { <id>: <value> }, reply }`, held by `responseConstraint` to a schema made per turn:
the outline's ids are the only keys of `changes` and each value has its field's kind (a
boolean, a number in range, one of a select's options, a string), so a wrong id or a "maybe"
cannot be written. The schema is not sent to the model as text (`omitResponseConstraintInput`):
the system prompt describes the answer in words, and the window is small. `reply` is the one
sentence the chat shows.

**Another language is an edit like any other.** The model translates the author's words, and
nothing else changes. The content type's buttons and messages and H5P's own words (Fullscreen,
Rights of use) are shown in the content's language by the player, not rewritten by the editor
(decided 2026-10-20).

**Checks and the loop.** `check(params, semantics)` is the app's own: types, required fields,
ranges, options, list lengths, allowed tags, libraries the pack has. A violation goes back to the
model once, with the field named, and a second failure is reported in the chat with nothing
applied. Two steps, not three: the model is small and a third try rarely helps. The runtime's
content check, the port of H5P's validator, runs again when the result plays untrusted, as the
last guard; its notes are not yet surfaced to the app (see Growth).

### create

A recipe is what the model writes for a new activity of a kind and how code assembles it:
`KINDS` in `authoring.js` today, four kinds, each a shape, a cleaner and a `written()` that lays
the words into the content type's parameters for `ContentGenerator` to complete. New kinds are
added by hand, one recipe each, and only for text types. A recipe's item shapes are what
`insert` uses, so creating and editing share one definition. The Create dialog stays in the
first version; creating from the chat comes when the chat exists.

### model

```ts
interface ModelProvider {
  availability(language): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
  session({ system, language, signal, onDownload }): Promise<ModelSession>
}
interface ModelSession {
  prompt(text, { schema, omitSchema, signal }): Promise<string>
  quota(): { used: number; total: number } | null
  destroy(): void
}
```

One implementation, `nano`, over `LanguageModel`: `availability` and `create` with the language
options Create uses today, `responseConstraint` for the schema (and
`omitResponseConstraintInput` when the prompt already describes it), `contextUsage` and
`contextWindow` for the quota (`inputUsage` and `inputQuota` before Chrome renamed them). The interface is as small as the base needs, and it is the seam for other models.
Nothing else in the app touches `LanguageModel`.

### history

IndexedDB, three stores. `files`: the opened package by the SHA-256 of its bytes and its name,
with the latest version. `versions`: `content.json`, the title and the operations that made it,
one per applied turn, in order; undo and redo move a pointer. `chat`: the messages, with the
version each one produced. The working copy the player plays is rebuilt from the original file
and the current version at any time, so reopening the same file offline restores where the
teacher was.

### app

The page is the player on one side and the chat on the other. Open takes a file; a file Create
made or the chat edited is played at once through the working copy; Save writes the clean
export over a download link (and, where the File System Access API is there, over the opened
file on request); Export with libraries is the same writer with the pack's folders. Undo, redo
and a list of versions sit above the chat. The service worker calls `mountH5P(self)` and
precaches the shell, as the player repo's installable app does, so the editor works offline once
the model is downloaded.

## Flows

**Open.** `readPackage` → the main library and the sub-content libraries the content names →
all in the pack and all text types? → `contentModel` → the file and its version 0 in history →
the player plays the file untrusted. Otherwise the file plays as it is and the chat says why it
cannot be edited.

**Edit.** Message → focus → outline → prompt (system: the rules and the formats; user: the
outline, each line with its format, and the message) → `{ changes, reply }` → `check` → on a
violation, one fix round with the rule restated → operations
applied to a copy of the params → `withContent` → `player.file = copy` → the version and the
reply saved → the chat shows the reply.

**Create.** The dialog as today: the text, the kind, the count, the language → the recipe's
shape → `contentFrom` → `packageFrom` → opened like any file, with history starting at it.

**Export.** The current version → `exportPackage` with the pack's folders → a download named
after the title.

## What the model is told

The system prompt states the rules in a few lines: what each format allows (where HTML may go,
which tags, where it may not, and the blank's asterisks), edit only the fields listed and only
as asked, keep the language of the content unless asked to change it, the quotation marks a
teacher puts round a phrase are not part of it, and the shape of the answer with one sentence
saying what was done. Each turn's user message is the outline, every line naming its field's
format, and the teacher's words. The chat history is not sent: the content's current state is the history, and
the window is small. Create keeps its own prompt, as written today.

## Testing

- **Unit, in Node.** `package`: read, working copy, export, each against the real pack.
  `semantics`: `classify` over all 55 libraries, as a snapshot that a pack upgrade changes
  deliberately; the content model and outline for one sample per text type; every dialect
  round-trips. `edit`: each operation applied and checked, violations named. `create`: as today.
- **Played.** Every exported sample is played untrusted by `h5p-verify` against the pack, the
  content check changing nothing, as `tests/authoring.test.ts` does for Create.
- **Browser, three engines.** A stand-in `LanguageModel` answers from fixtures. The acceptance
  flow is the test: open a sample, ask for a change, it plays with the change; undo; export; a
  model answer that breaks a constraint is refused with a message.
- **The real model, by hand.** `evals/` holds a set of tasks, each with a package, a message
  and what counts as right. They are run against Chrome's model on a real machine, and the
  results go into a table in the repository with the date and the Chrome version. Speed,
  quota, whether counts are honoured, and quality in German and Japanese are what to measure.
  No decision about the model's limits is made without this table.

The acceptance test the whole thing is held to: a teacher with no technical background turns a
worksheet into an importable activity in ten minutes, and fixes what is wrong by chatting,
without seeing a field or a line of JSON.

## Growth: what comes later, and where it plugs in

| Later | Seam in the base |
| --- | --- |
| Other models: a local server (Ollama and the like), a cloud model with the teacher's key | `ModelProvider`; a capability record (quota, constrained JSON) chooses what the chat offers |
| More content types, including layout-driven ones | `classify` widens; a recipe per type; a `layout/` module that places what the model names |
| Media: files kept, uploaded, placed | the content model already carries media nodes read-only; an asset store and asset slots in recipes |
| Documents, audio and video as source material | a `source/` step before `create`, producing text |
| A desktop app (Tauri) with real file access | the core is DOM-free; `src/app/` is the only platform code; the store gets a second backend |
| The runtime's content-check notes shown in the chat | a player feature: the element reports the check's notes as an event when playing untrusted |
| Export compatibility for older H5P sites | the pack's `index.json` gaining each library's `coreApi`, and a report in the Export dialog |

## Risks

- The model's quota and quality are unmeasured. The eval table decides; the focus mechanism is
  the mitigation, and a message the window cannot hold ends in the chat asking for a part.
- Whether `responseConstraint` honours `minItems`/`maxItems` is unknown; counts are enforced in
  code, as in Create.
- H5P sites with an older core refuse newer libraries. The export carries the pack's versions
  and nothing else; the compatibility report is deferred.
- Selection in the player is one-way: the app can learn which part the teacher touched, but
  cannot yet highlight a part in the frame.

## Decision log, 2026-10-19

| Decision | Chosen |
| --- | --- |
| Model | Chrome's on-device model only, behind `ModelProvider`. Others later. |
| Content types | Text types, as `classify` defines them; all 55 later. |
| Runtime | Hosted PWA. A desktop app later, over the same core. |
| Editing | Chat beside the player, applied at once, undo and redo. No fields, no review lists. |
| Selection | By the part the teacher last touched in the player, or by naming it. |
| Where work lives | The `.h5p` is the truth; history and chat beside it, in the browser. |
| Foreign libraries | Pack libraries only; other packages play but are not editable. |
| Export | A clean zip with the pack's libraries included; content-only is Create's today. |
| Autonomy | Propose, check, fix once. No tools, no inspection. |
| Media and documents | None in the base. |
| Backend | None. |
| Done means | A worksheet becomes an importable activity in ten minutes, with no forms. |
| First slice | Open any text-typed `.h5p`, edit its text by chat with Chrome's model, undo, export with libraries. |
| Interface language | The player's job: it shows its own words in the content's language. The editor does not relabel them (2026-10-20). |
