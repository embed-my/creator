# AGENTS.md

Working notes for this repository, and the authority on its design. The README is for people
visiting the repository.

## What this is

An H5P editor driven by chat, in an installable web app (PWA): a teacher creates an activity from
their own text or opens an existing `.h5p`, says what should change, and the change plays at
once. Chrome's on-device model writes the words; code writes the structure; there are no forms.
The text and what the model writes stay on the device, and the app works offline once installed.

[ARCHITECTURE.md](ARCHITECTURE.md) is the design: the modules, the flows, the rules every module
follows, and what comes later and where it plugs in. The first version is deliberately small —
Chrome's model only, text-only content types — and is the base the rest grows from. The bet it
rests on: that Chrome's small model can edit the text of text-typed content well. If it can, the
base holds for other models and types.

It started on 2026-10-18 as a draft in missing-elements/h5p-offline-player (issue #47) and moved
here the same night. Creating from pasted text (four kinds) is built; editing is not yet.

**The name is Embed My Creator** (repository `embed-my/creator`, app id `org.embed-my.creator`),
renamed from h5p-create on 2026-10-21. H5P Group's trademark policy (<https://h5p.org/trademark>)
refuses H5P as the main part of a product's name and allows it in descriptions and in code, so
"H5P" goes in what the app is said to do, never in what it is called; `h5p` in code, file names and
formats is fine.

It is built on the published packages, installed from npm like any other site that uses them:

- `@missing-elements/h5p-offline-player`: the `<h5p-player>` element, and `mountH5P` from `/sw`
  for the one Service Worker that also serves the app shell, as the player repo's `/app/` does.
- `@missing-elements/h5p-runtime`: the `runtime` export.
- `@missing-elements/h5p-libraries`: the `pack` export, and `parts/` for the semantics.

## Chrome's Prompt API, as checked on 2026-10-18

- **Availability:** `LanguageModel` reached the web in Chrome 148 (May 2026); before that it was
  for extensions only. Sampling parameters (temperature, topK) are still an origin trial.
- **Requirements:**
  - OS: Windows 10/11, macOS 13+, Linux, or ChromeOS on a Chromebook Plus. No Android or iOS.
  - Disk: 22 GB free on the profile's volume. The model is removed below 10 GB free.
  - Hardware: a GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4 CPU cores.
- **Languages:** input and output in en, ja, es, de and fr.
- **Calls:**
  - `availability(options)` returns `unavailable`, `downloadable`, `downloading` or `available`.
    Pass the same options as `create()`.
  - `create({ expectedInputs, expectedOutputs, initialPrompts, signal, monitor })` downloads the
    model the first time and needs a user click. It fires `downloadprogress` events whose
    `loaded` runs from 0 to 1.
  - `session.prompt(text, { responseConstraint: jsonSchema, signal })`. The schema is sent to
    the model as part of the prompt unless `omitResponseConstraintInput: true` (checked
    2026-10-20); the docs then advise describing the answer in the prompt. Which JSON Schema
    keywords are honoured is not documented: the docs' examples use `type`, `properties`,
    `required`, `items`, `maxItems`, `pattern` and `additionalProperties: false`.
  - `session.contextUsage` / `session.contextWindow` and `measureContextUsage()`: renamed from
    `inputUsage` / `inputQuota` / `measureInputUsage()`; `model/nano.js` reads both.
- **Limits:**
  - Not available in Web Workers.
  - A cross-origin iframe needs `allow="language-model"`.
  - No context-window size is documented; an overflow fires `contextoverflow` and drops the
    oldest turns, but never the system prompt.
- **Sources:** <https://developer.chrome.com/docs/ai/prompt-api> and
  <https://developer.chrome.com/release-notes/148>

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
per kind of activity, held to it by `responseConstraint`. Code turns that into `content.json`
with `ContentGenerator`, from the pack's own `semantics.json`. Every field is there with its
default, the versions are the pack's, and the model never sees H5P's form definitions.

| Kind | Content type | Model's shape |
| --- | --- | --- |
| Quiz | Question Set of Multiple Choice | `{ title, questions: [{ question, answers: [{ text, correct, feedback }] }] }` |
| True or false | Question Set of True/False | `{ title, statements: [{ statement, isTrue, explanation }] }` |
| Fill in the blanks | Fill in the Blanks | `{ title, sentences: [{ sentence, answer }] }` |
| Flashcards | Dialog Cards | `{ title, cards: [{ front, back }] }` |

## Layout

```text
index.html            the page: the bar (Create, Open a file, Save), the home text, the
                      <h5p-player libraries="pack" resume="device">, and the Create dialog
vite.config.ts        authoringPackPlugin(), for virtual:h5p-authoring-pack
src/
  main.js             the page's script: the element with the runtime and the pack, a picked
                      file played, Create offered where createOffer says so, and Save (an
                      <a download> on an object URL) for a file Create made
  app.css             the page's styles, light and dark
  authoring.js        pure but for zip.js: KINDS, schemaFor, promptFor (the text capped at 6000
                      characters), contentFrom (h5p.json and the params), packageFrom (a
                      content-only .h5p File), and the helpers translated, escapeHtml,
                      blankSentence, fileName
  create.js           the dialog: createOffer({ onCreated }) returns a function that opens it, or
                      null where the model is unavailable; loads authoring.js and the pack's
                      semantics lazily, so they are chunks of their own; shows the model
                      download's progress, an elapsed-time line while the model writes, and
                      plain-language errors
  model/nano.js       Chrome's model behind the one interface the app talks to: availability,
                      a session with a system prompt, prompt(text, { schema }), quota. Nothing
                      else touches LanguageModel
  semantics/          content-model.js: params walked with the pack's semantics into nodes, and
                      editable(); outline.js: the numbered lines the model reads, ids per turn;
                      dialects.js: each field's format from its semantics' tags — [text] or
                      [html: the inline tags it allows] — and the check that refuses text
                      breaking it, with the rule; the Blanks dialect
  edit/               operations.js: { changes } applied with each field's checks, refusals by
                      id and kind (id, format, value); prompt.js: the system prompt defining
                      the formats, the turn, the fix round, and the per-turn schema
  package/            read.js: h5p.json and content.json from a file; working-copy.js: the
                      edited file for the player, the original bytes referenced, not copied
evals/                the editing spine against the real model, by hand: samples (tasks.js), the
                      outline, the raw answer, what was applied, the time and the quota, and a
                      table of runs to judge and copy into the repository (/evals/ in dev)
desktop-check/        the desktop check: where the page is, the player playing, a model asked
                      through Tauri's HTTP client and through the page's fetch, the edit played
src-tauri/            the desktop app: the localhost plugin serving the built site, Tauri's HTTP
                      client allowed to localhost; the window made in lib.rs
scripts/
  local-model-stand-in.mjs  an OpenAI-compatible server with no CORS headers, for the check
  authoring-pack.mjs  readAuthoringPack(): the newest of the five libraries in the pack, each with
                      library.json, semantics.json and language/{de,es,fr,ja}.json (137 kB raw),
                      from node_modules/@missing-elements/h5p-libraries/parts (PARTS_DIR);
                      authoringPackPlugin() serves it to Vite as virtual:h5p-authoring-pack
  sweep-content.mjs   ContentGenerator, copied unchanged from the player repo
                      (apps/demo/scripts/lib/, MIT, LICENSE-h5p-offline-player); pure, runs in a
                      browser
tests/
  authoring.test.ts   Vitest
  h5p-verify.d.ts     types for the part of h5p-verify the tests use
e2e/
  create.spec.ts      Playwright, against the built site
```

The element registers its own Service Worker, emitted beside its script by Vite. The app's own
worker, with `mountH5P` and the precached shell, is still to come (see Left to do).

## Tests

`pnpm test` runs `tests/authoring.test.ts`. The tests build packages from answers written the way
the model answers, against the real pack. Each kind, in English, German and Japanese, is zipped and
played untrusted by `@missing-elements/h5p-verify` in Chrome, with the pack from `PARTS_DIR`, so no
network is needed. Untrusted means as a site plays a package it did not make: through the
runtime's content check, the port of H5P's validator. The tests assert that the content check
changed nothing and that there were no warnings, so the content is exactly what an H5P site would
have saved.

The verifier needs Chrome or Edge, or `npx playwright install chromium`. GitHub's Ubuntu runners
have Chrome.

`pnpm build && pnpm e2e` runs `e2e/create.spec.ts` against `vite preview`, in Chromium, Firefox and
WebKit (`pnpm exec playwright install chromium firefox webkit` the first time). An init script puts
a stand-in `LanguageModel` in the page, which answers by the list its schema asks for and records
what it was asked. For each kind, Create should play the file it made and Save should download it
under its title. A model answer with nothing usable should leave the dialog open with the error.
Without `LanguageModel`, the app should offer no Create and still play a picked `.h5p`.

The player repo's copy of these tests imported the runtime's `content-check.ts` from its source.
That file is GPL and the published runtime has only `dist/`, so it is not used here.

## Lessons learned in the draft

- **Escape what the model wrote, as H5P saves text.** H5P's validator escapes plain text fields
  (those without `tags`) like PHP's `htmlspecialchars(..., ENT_QUOTES)`, with `'` as `&#039;`.
  The content type's own plain-text defaults need the same treatment, keeping references already
  in them. Only then is the result exactly what an H5P site would save, so the content check
  changes nothing. `Author.field()` in `authoring.js` does this.
- **Translate the defaults.** With each library's `language/<code>.json` laid over its semantics,
  as H5P's editor does (index by index, key by key), a German quiz gets German buttons.
- **Fill in the Blanks:** take `*`, `/` and `:` out of the answer, and drop a sentence that does
  not contain its own answer.
- **Use a fresh `crypto.randomUUID()` for every sub-content's `subContentId`.**
  `ContentGenerator`'s deterministic ids exist for the sweep.

## Left to do

1. **Prove the bet with the real model.** The `evals/` page exists (2026-10-19) and is tested
   with a stand-in; nobody has run it against Chrome's model yet. Run its ten tasks on its four
   samples in Chrome 148+ by hand, judge each, and put the copied table in `evals/RESULTS.md`
   with the date and the Chrome version. Speed, the quota, whether the answer holds to the
   schema and the ids, and quality in German and Japanese are what to measure. Also run Create
   once, to settle whether `responseConstraint` honours `minItems`/`maxItems`.
2. **The rest of the first slice** (ARCHITECTURE.md, decision log): `semantics/classify` and
   the semantics of all 55 libraries, `insert`/`remove`/`move` for lists with recipes,
   `history`, the export with the pack's libraries, and the chat in `app/` in place of the
   eval page's controls.
3. **Installable and offline.** The app's own Service Worker, which calls `mountH5P(self)` and
   precaches the shell and the pack's parts, as the player repo's `/app/sw.js` does; the element
   then uses it through `sw`. A web app manifest and icons.
4. **Close issue #47** in missing-elements/h5p-offline-player, linking this repository.

Done: the page, Create and Save (2026-10-19), and the browser tests with a stand-in model.
