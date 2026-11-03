# AGENTS.md

Working notes for this repository, and the authority on its design. The README is for people
visiting the repository.

## What this is

An H5P editor driven by chat, as a desktop app (Tauri) over a web app: a teacher creates an
activity from their own text or opens an existing `.h5p`, says what should change, and the change
plays at once. A model on the teacher's own computer — served by LM Studio, Ollama, Unsloth Studio
or llama.cpp — writes the words; code writes the structure; there are no forms. The text and what
the model writes never leave the computer.

[USE-CASES.md](USE-CASES.md) is what teachers want from AI, ranked, and the first test set drawn
from it. [ARCHITECTURE.md](ARCHITECTURE.md) is the design: the modules, the flows, the rules every module
follows, and what comes later and where it plugs in. The first version is deliberately small —
local models through the OpenAI-compatible API, text-only content types — and is the base the
rest grows from. The bet it rests on: that a model small enough for a teacher's computer can edit
the text of text-typed content well. Chrome's built-in model was the first choice, and was dropped
on 2026-10-21 for local models (see the decision log).

It started on 2026-10-18 as a draft in missing-elements/h5p-offline-player (issue #47) and moved
here the same night. Creating from pasted text (four kinds) is built; editing is built as the agent
toolset's commands (`toolset/h5p-edit.mjs`, 2026-11-03), not yet in the app.

**The name is Embed My Creator** (repository `embed-my/creator`, app id `org.embed-my.creator`),
renamed from h5p-create on 2026-10-21. H5P Group's trademark policy (<https://h5p.org/trademark>)
refuses H5P as the main part of a product's name and allows it in descriptions and in code, so
"H5P" goes in what the app is said to do, never in what it is called; `h5p` in code, file names and
formats is fine.

It is built on the published packages, installed from npm like any other site that uses them:

- `@missing-elements/h5p-offline-player`: the `<h5p-player>` element, and `mountH5P` from `/sw`
  for the one Service Worker that also serves the app shell, as the player repo's `/app/` does.
- `@missing-elements/h5p-runtime`: the `runtime` export.
- `@missing-elements/h5p-libraries`: the `pack` export, which the player plays from and the page
  builds and reads content from; `parts/` for the tests, which play against it.
- `@missing-elements/h5p-author`: from `/core`, the generator Create builds content with
  (`ContentGenerator`), the libraries loaded as its build loads them (`loadLibraries`,
  `packageLibraries`) and the check of saved content (`checkContent`); from `/browser`, the
  page's `openPack`; from `.`, `openPack` and `buildPackage` in Node, for the toolset and the
  tests. It pins the player and the pack to exact versions, so the three move together, or pnpm
  installs a second copy.

## Local model servers, as checked on 2026-10-21

- **The API:** each serves the OpenAI-compatible Chat Completions API under `/v1`: `GET
  /v1/models`, and `POST /v1/chat/completions` with `response_format: { type: 'json_schema',
  json_schema: { name, strict, schema } }`, which holds the answer to the schema.
  `model/openai.js` is the only module that speaks it.
- **The usual ports**, where `discover()` looks (1.5 s each): LM Studio 1234, Ollama 11434,
  Unsloth Studio 8888, llama.cpp's `llama-server` 8080. Another address can be typed in the
  Model dialog.
- **Unsloth Studio** (2026.9.4, checked): `unsloth studio run --model <gguf or HF repo> --api-only
  --no-cloudflare --disable-tools`. It binds `127.0.0.1:8888`, prints a generated
  `sk-unsloth-…` key, which every request needs, and lists `context_length` and `loaded` for
  each model in `/v1/models`. Its CORS check refuses other origins (a 400 to the preflight).
  `--cloudflare` would put it on a public URL: never.
- **LM Studio:** `lms server start`, or the server switch in the app; its CORS is a setting.
  On 2026-10-21 the command line could not wake its service on this Mac, so it is not checked
  here.
- **Ollama:** the API at `/v1` on 11434; the origins it allows are `OLLAMA_ORIGINS`. Not checked
  here (only coding models were installed).
- **What differs:** whether a server names a model's window (Unsloth Studio does; where none
  does, the eval page shows tokens over `?`), whether it needs a key, and whether the model thinks
  before it answers, which costs tokens and time (Gemma 4 E4B: 1,334 tokens for an answer of
  about 500).
- **The key** is kept with the server in the window's storage, on this computer only; it should
  move to the system's keychain (Left to do).

## The desktop app (Tauri), as checked on 2026-10-21

`src-tauri/` puts the built site in a window of its own (Tauri 2.12, macOS 26 on Apple silicon;
Windows and Linux not yet tried). `desktop-check/` is the page that checked it, against
`scripts/local-model-stand-in.mjs` and against Unsloth Studio serving Gemma 4 E4B (Q6_K):

- **The pages have to come from `http://localhost`.** From Tauri's own `tauri://localhost` the
  player's Service Worker does not register (`no-worker`) and nothing plays. The localhost plugin
  (port 47615) serves them from a secure context; the worker registers and the player plays.
- **Model servers are reached through Tauri's HTTP client** (`@tauri-apps/plugin-http`, from
  Rust), allowed to `localhost` and `127.0.0.1` in `capabilities/default.json`. Their CORS
  settings do not matter: the page's own `fetch` to the same server was refused by both, the
  HTTP client was not, and Chrome's local-network prompt does not exist in the window.
- **Unsloth Studio** (`unsloth studio run --model <gguf> --api-only --no-cloudflare
  --disable-tools`) serves the OpenAI-compatible API on `127.0.0.1:8888` with a generated
  `sk-unsloth-…` key, and holds the answer to `response_format` with the turn's JSON Schema.
  Gemma 4 E4B changed a title in 8 s, and translated all 20 fields of the quiz sample into German
  in one answer in 45 s, with no refusal; the edits played.

Build and run it: `. "$HOME/.cargo/env"` (rustup, no profile changes), `pnpm tauri build --debug
--no-bundle`, then `src-tauri/target/debug/embed-my-creator`. `CREATOR_PAGE=desktop-check/index.html`
opens the check (`?llm=<base URL>&model=<id>&key=<key>&message=<words>`, the stand-in on 47616
by default, which also prints the check's steps); `CREATOR_SERVE=tauri` serves from Tauri's
scheme instead. `pnpm tauri dev` is not tried yet.

## The design

**The model writes the words; code writes the structure.** The model answers a small JSON shape
per kind of activity, held to it by the server's `response_format`. Code turns that into `content.json`
with h5p-author's `ContentGenerator`, from the pack's own `semantics.json` loaded as h5p-author's
build loads it, and checks it as that build checks what it writes (`checkContent`). Every field is
there with its default, the versions are the pack's, and the model never sees H5P's form
definitions. Create ran on a copy of the player's sweep generator until 2026-11-03.

| Kind | Content type | Model's shape |
| --- | --- | --- |
| Quiz | Question Set of Multiple Choice | `{ title, questions: [{ question, answers: [{ text, correct, feedback }] }] }` |
| True or false | Question Set of True/False | `{ title, statements: [{ statement, isTrue, explanation }] }` |
| Fill in the blanks | Fill in the Blanks | `{ title, sentences: [{ sentence, answer }] }` |
| Flashcards | Dialog Cards | `{ title, cards: [{ front, back }] }` |

## The agent toolset (2026-11-03)

The main goal since 2026-11-02: what a teacher's or designer's own coding agent runs, beside
h5p-author, which creates a package, and H5P Preview, which plays one. Editing is ours: none of
the three changes an existing package. There is no model inside; the agent is the model.

```text
pnpm h5p-edit outline <file.h5p> [--settings] [--empty] [--json]
pnpm h5p-edit apply <file.h5p> <changes.json | -> <out.h5p> [--json]
```

- **`outline`** prints the app's outline: a line per field, with an id, its label in H5P's words,
  its format and its value, under a line naming the content type, the title, the language and a
  revision. Ids are stable (`outline(…, { stableIds })`): every field takes its id whether it is
  shown or not, so an id names the same field with or without `--settings` and `--empty`. The
  ids show gaps where fields are not shown.
- **`apply`** takes `{ "revision", "changes": { id: complete new value } }` — the model's answer
  in the app, without its reply. Each value is read as its field takes it (`applyChanges`); then
  the content is checked as h5p-author's build checks what it writes (`checkContent`: the
  layouts' checks, such as a Branching Scenario's paths, and the hidden fields). Anything refused
  is said by id, and then nothing is written. A package often holds what its own editor let an
  author save and the build would not, so only problems the changes brought count against them;
  the others are counted. A revision that is not the package's (it changed since its outline) is
  refused. It writes a new file, never over one: the original's entries copied as stored, byte
  for byte, with `content/content.json` replaced (`package/rewrite.js`), so sub-content ids,
  library versions and media stay as they were. It names feedback a changed answer may have
  outgrown (`staleFeedback`), and says what changed in code's words (`changeNote`).
- **Libraries:** the package's own where it carries a major of a library, the pack h5p-author
  pins where it does not (`packageLibraries`, `loadLibraries`), so a content-only package, as
  Create makes them, edits as well as a full one. Exit status 0 written or nothing to change,
  1 refused, 2 not run.
- **Tried on 99 real packages** of 27 types (2026-11-03, notes, question 31): every one outlines
  in under 0.6 s; a quiz, Dialog Cards, a Course Presentation and an Interactive Video were edited
  and play, with only `content/content.json` changed. 29 already held problems their editors let
  through (407 in all), which stay counted, not refused.
- **What it does not do yet:** add, remove or move list items; media; the package's title; a
  translation's interface texts and h5p.json's `language`, so a translated package keeps its old
  buttons. The content model shows every field of a list item as content, which suits the four
  text kinds and floods the rest: on the real packages, 72% of the default outline's lines are
  such settings (positions and sizes H5P's editor never shows, opacities, Course Presentation's
  button settings, Interactive Video's timing). Showing only the answer key there would cut the
  outlines by two thirds. Still to settle: a skill, MCP tools or both, and where the commands live.

## Layout

```text
index.html            the page: the bar (Model, Create, Open a file, Save), the home text, the
                      <h5p-player libraries="pack" resume="device">, and the Create dialog
vite.config.ts        the three pages: the app, evals/ and desktop-check/
src/
  main.js             the page's script: the element with the runtime and the pack, a picked
                      file played, the Model button naming the model chosen, Create (asking for
                      a model first where none is chosen), and Save (an <a download> on an
                      object URL) for a file Create made
  app.css             the page's styles, light and dark
  authoring.js        pure but for zip.js and h5p-author's core: KINDS, schemaFor, promptFor (the
                      text capped at 6000 characters), contentFrom (h5p.json and the params, from
                      a pack, async), packageFrom (a content-only .h5p File), and the helpers
                      escapeHtml, blankSentence, fileName
  library-pack.js     libraryPack(): h5p-author's openPack in the page over the libraries' pack
                      export, opened when first needed; a part fetched whole and checked by its
                      SHA-256 when content first needs it
  create.js           the dialog: createOffer({ onCreated }) returns the function that opens it;
                      loads authoring.js and the pack's semantics lazily, so they are chunks of
                      their own; asks the model chosen, with an elapsed-time line while it
                      writes, and says what went wrong in plain words
  model-dialog.js     the Model dialog, built in script so the app and the eval page share it: the
                      usual ports looked at, the server's models offered, a key where it wants one
  model/openai.js     the model behind the one interface the app talks to: SERVERS, discover(),
                      models(server), session({ server, system }) with prompt(text, { schema }) and
                      quota(); Tauri's HTTP client in the desktop app, fetch in a browser.
                      Nothing else talks to a model
  model/settings.js   the server and model chosen, kept in the window's storage; findServer()
                      takes the first usual server with a model when none is chosen
  semantics/          content-model.js: params walked with the pack's semantics into nodes, empty
                      slots (an answer's feedback or tip not written yet) among them, and
                      editable(); outline.js: the numbered lines the model reads, ids per turn
                      (stableIds for the toolset); dialects.js: each field's format from its
                      semantics' tags — [text] or [html: the inline tags it allows] — and the
                      check that refuses text breaking it, with the rule; the asterisk
                      dialects (Fill in the Blanks, Drag the Words, Mark the Words);
                      libraries.js: editorLibraries, h5p-author's loadLibraries with each
                      library's translation laid over the labels and descriptions
  edit/               operations.js: { changes } applied with each field's checks, refusals by
                      id and kind (id, format, value), changeNote, staleFeedback; prompt.js: the
                      system prompt defining the formats, the turn, the fix round, and the
                      per-turn schema; package-edit.js: a package edited by its fields' ids, as
                      the toolset does it: openForEdit (its libraries by h5p-author's loader, the
                      content model, a revision), outlineOf (stable ids), editContent (the
                      changes applied, then h5p-author's checkContent, only new problems held
                      against them)
  package/            read.js: openPackage (the names, a file's text on demand), readPackage
                      (h5p.json and content.json), mainLibraryOf; working-copy.js: the edited
                      file for the player, the original bytes referenced, not copied;
                      rewrite.js: the edited file written afresh, every other entry copied as
                      stored
evals/                the editing spine against a real model, by hand: samples and tasks, each
                      from a use case (tasks.js), the outline, the raw answer, what was applied,
                      the automatic checks (checks.js), the time and the tokens, and a table of
                      runs to judge and copy into the repository (/evals/ in dev);
                      RESULTS.md, the runs with real models, judged; RUBRIC.md, how a run
                      is judged, by its checks or by reading; runs/, every run's outline,
                      answer, changes, checks and verdict
toolset/              h5p-edit.mjs: the agent toolset's commands, outline and apply, in Node,
                      with the pack h5p-author pins (pnpm h5p-edit)
desktop-check/        the desktop check: where the page is, the player playing, a model asked
                      through Tauri's HTTP client and through the page's fetch, the edit played
src-tauri/            the desktop app: the localhost plugin serving the built site, Tauri's HTTP
                      client allowed to localhost; the window made in lib.rs
scripts/
  local-model-stand-in.mjs  an OpenAI-compatible server with no CORS headers, for the check
  run-evals.mjs       the eval page's tasks run unattended against a model server, through the
                      page in a headless Chromium: every run to evals/runs/*.json, with the
                      sampling and the code it ran; --thinking on|off, --repeat,
                      --temperature/--top-p/--top-k
  blind-evals.mjs     blind judging: the runs judged by reading shuffled across run files into a
                      pack for two judges, and their verdicts merged back, with their agreement
  summarize-evals.mjs the tables for evals/RESULTS.md: verdicts per round, and per task across
                      run files; the verdicts of runs judged by checks applied by rule
  pack-parts.mjs      PARTS_DIR: the installed pack's parts, which the tests play against
tests/                Vitest: authoring.test.ts (Create, played by h5p-verify), edit.test.ts (the
                      editing spine, empty slots played), checks.test.ts (the eval tasks'
                      checks on good and bad runs), model.test.ts (model/openai.js against a
                      fake fetch), toolset.test.ts (the toolset on packages h5p-author builds and
                      on one Create made, played by h5p-verify, and the command line)
e2e/                  Playwright, against the built site: create.spec.ts, evals.spec.ts, and
                      model-server.ts, the stand-in server on LM Studio's port
```

The element registers its own Service Worker, emitted beside its script by Vite; in the desktop
app it runs because the pages come from `http://localhost`.

## Tests

`pnpm test` runs `tests/`. `model.test.ts` checks what `model/openai.js` asks a server, in the
shape the servers take, and what it makes of their answers and errors, against a fake `fetch`.
`authoring.test.ts` builds packages from answers written the way
the model answers, against the real pack, opened by h5p-author's `openPack`. Each kind, in English, German and Japanese, is zipped and
played untrusted by `@missing-elements/h5p-verify` in Chrome, with the pack from `PARTS_DIR`, so no
network is needed. Untrusted means as a site plays a package it did not make: through the
runtime's content check, the port of H5P's validator. The tests assert that the content check
changed nothing and that there were no warnings, so the content is exactly what an H5P site would
have saved.

The verifier needs Chrome or Edge, or `npx playwright install chromium`. GitHub's Ubuntu runners
have Chrome.

`pnpm build && pnpm e2e` runs `e2e/` against `vite preview`, in Chromium, Firefox and WebKit
(`pnpm exec playwright install chromium firefox webkit` the first time). `model-server.ts` routes
LM Studio's port to a stand-in server, with the CORS headers a page needs, which answers by the
list the schema asks for and keeps every request; the other usual ports refuse, and the console
errors the browser logs for them are told apart from real ones. The app should find the server
and name its model. For each kind, Create should play the file it made and Save should download
it under its title. A model answer with nothing usable should leave the dialog open with the
error. With no server, the home page should say how to get one, Create should open the Model
dialog, and a picked `.h5p` should still play.

The player repo's copy of these tests imported the runtime's `content-check.ts` from its source.
That file is GPL and the published runtime has only `dist/`, so it is not used here.

## Lessons learned in the draft

- **Escape what the model wrote, as H5P saves text.** H5P's validator escapes plain text fields
  (those without `tags`) like PHP's `htmlspecialchars(..., ENT_QUOTES)`, with `'` as `&#039;`.
  The content type's own plain-text defaults need the same treatment, keeping references already
  in them. Only then is the result exactly what an H5P site would save, so the content check
  changes nothing. h5p-author's loader escapes the defaults (`Author.field()` did, before
  2026-11-03).
- **Translate the defaults.** With each library's `language/<code>.json` laid over its semantics,
  as H5P's editor does (index by index, key by key), a German quiz gets German buttons.
  h5p-author's loader does it for the defaults; the editor lays the labels and descriptions over
  too (`semantics/libraries.js`), so German content reads with H5P's German labels.
- **A markup field's line is wrapped** as H5P's editor wraps what an author types: the Question
  Set's title is stored `<div>The water cycle</div>`, which h5p-author's generator writes from
  plain text (Create stored it bare until 2026-11-03).
- **Fill in the Blanks:** take `*`, `/` and `:` out of the answer, and drop a sentence that does
  not contain its own answer.
- **Use a fresh `crypto.randomUUID()` for every sub-content's `subContentId`.** h5p-author's
  generator does, unless it is handed an `id` for the same bytes every run.
- **Keep a text area's lines.** A plain text field typed in several lines (`widget: "textarea"`,
  Drag the Words' text and five more in the pack) keeps its line breaks, as H5P's validator does,
  and Drag the Words shows them. Until 2026-11-03 any change joined them into one line.
- **Refuse what empties an exercise.** Drag the Words or Mark the Words with every asterisk gone
  plays and passes verify, with nothing to drag or mark; its dialect refuses it, as Fill in the
  Blanks' does.

## Left to do

1. **The agent toolset, from the trial on real packages** (notes, question 31): inside list items,
   only the answer key as content (fields named `correct…` or marked `importance: "high"`), the
   rest settings, `widget: "none"` never shown, colours settings, an interaction's time and a
   score range's bounds in the item's heading; the title as a field; a language change in
   `apply` (h5p.json's `language`, the interface texts from the libraries' translations); then
   the local `h5p-edit` skill and `insert`/`remove`/`move` (item 3).
2. **What the first real runs found** (`evals/RESULTS.md`, 2026-10-22). Gemma 4 E4B with thinking
   on got 15 of 23 runs right, at a median of 20 s. Without thinking, models fail a third. Qwen3.5
   4B thinks for minutes per edit. Done on 2026-10-22, not yet measured: H5P's field descriptions
   in the outline for empty slots and settings, `changeNote` (what a turn changed, in code's
   words), and the second try asking about feedback a changed answer left behind. Next, run
   Gemma again and compare; then:
   - the app sending `reasoning_effort` itself;
   - "Shorten the feedback" on `quiz-dense-en`.

   Still to try: a model of about 9B (only with the owner's go-ahead: it is slow on 16 GB), LM
   Studio and Ollama. Then run Create once per model and give Create an eval mode of its own
   (USE-CASES.md, #1–#2).
3. **The rest of the first slice** (ARCHITECTURE.md, decision log): `semantics/classify` (the
   semantics of every library in the pack are loaded by h5p-author since 2026-11-03), `insert`/`remove`/`move` for lists with recipes,
   `history`, the export with the pack's libraries, and the chat in `app/` in place of the
   eval page's controls.
4. **The desktop app beyond this Mac.** Builds for Windows and Linux in CI, and the desktop check
   run there; `pnpm tauri dev`; signed installers; the key in the system's keychain instead of the
   window's storage.
5. **Close issue #47** in missing-elements/h5p-offline-player, linking this repository.

Done: the page, Create and Save (2026-10-19), and the browser tests with a stand-in model; the
desktop app and its check, and local models through the OpenAI-compatible API in place of Chrome's
(2026-10-21).
