# AGENTS.md

Working notes for this repository, and the authority on its design. The README is for people
visiting the repository.

## What this is

An installable web app (PWA) that makes H5P content from text a teacher pastes, using Chrome's
on-device model, and plays it at once. The text and what the model writes stay on the device, and
the app works offline once installed. It started on 2026-10-18 as a draft in
missing-elements/h5p-offline-player (issue #47) and moved here the same night.

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
  - `session.prompt(text, { responseConstraint: jsonSchema, signal })`.
- **Limits:**
  - Not available in Web Workers.
  - A cross-origin iframe needs `allow="language-model"`.
  - No context-window size is documented, and an overflow throws `QuotaExceededError`.
- **Sources:** <https://developer.chrome.com/docs/ai/prompt-api> and
  <https://developer.chrome.com/release-notes/148>

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
  create.js           the dialog and the Prompt API: createOffer({ onCreated }) returns a function
                      that opens the dialog, or null where the model is unavailable; loads
                      authoring.js and the pack's semantics lazily, so they are chunks of their
                      own; shows the model download's progress, an elapsed-time line while the
                      model writes, and plain-language errors
scripts/
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

1. **A by-hand run in Chrome 148+ with the real model.** It is not yet established whether
   `responseConstraint` honours `minItems`/`maxItems`, so the schema leaves counts out and code
   keeps at most `count` items. Also check the time per activity and the quality.
2. **Installable and offline.** The app's own Service Worker, which calls `mountH5P(self)` and
   precaches the shell and the pack's parts, as the player repo's `/app/sw.js` does; the element
   then uses it through `sw`. A web app manifest and icons.
3. **A list of the files made.** Keep the generated `File`s in IndexedDB so they reopen offline.
4. **Close issue #47** in missing-elements/h5p-offline-player, linking this repository.

Done: the page, Create and Save (2026-10-19), and the browser tests with a stand-in model.
