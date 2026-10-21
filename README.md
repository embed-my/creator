# Embed My Creator

Make an H5P activity from your own text, with an AI model that runs on your own computer. Paste a
passage, your notes or a lesson summary, choose what to make, and get a `.h5p` file that plays at once
and that you can upload to any H5P site. The text and the result never leave your computer.

It makes four kinds of activity, in English, German, Spanish, French or Japanese:

- **Quiz:** a Question Set of Multiple Choice
- **True or false:** a Question Set of True/False
- **Fill in the blanks**
- **Flashcards:** Dialog Cards

**Status:** in development, as a desktop app (built with Tauri; checked on macOS so far) over a web
app. It creates, plays and saves. Creating needs a model server on your computer — LM Studio, Ollama,
Unsloth Studio or llama.cpp's `llama-server` — with a model loaded; the app finds them on their usual
ports, and you choose the model under **Model**. Without one, you can still open and play `.h5p`
files.

## How it works

The model writes only the words, in a small JSON shape for each kind of activity, which the model
server holds it to. The app talks to the server through its OpenAI-compatible API. The app puts
those words into the content type's own structure, built from the library's `semantics.json`, with
every default filled in and its buttons translated into the content's language. Everything the
model wrote is escaped as H5P saves text, so the package is what an H5P site would have saved.

It plays with [h5p-offline-player](https://github.com/missing-elements/h5p-offline-player) and
its library pack, installed from npm.

## Development

Needs Node 22.12 or later, pnpm, and Chrome or Edge for the tests; Rust (through rustup) for the
desktop app.

```bash
pnpm install
pnpm dev         # the web app at http://localhost:5173; it reaches a model server that allows its origin
pnpm test        # Create's packages played through h5p-verify, the editing spine, the model module
pnpm typecheck
pnpm build && pnpm e2e   # the built app in Chromium, Firefox and WebKit, with a stand-in model server
pnpm tauri build --debug --no-bundle   # the desktop app: src-tauri/target/debug/embed-my-creator
```

[AGENTS.md](AGENTS.md) has the design, what the local model servers offer, and what is left to do.

## Licence

MIT. `scripts/sweep-content.mjs` is copied from h5p-offline-player, also MIT
([LICENSE-h5p-offline-player](LICENSE-h5p-offline-player)). The H5P runtime the app will carry is
GPL-3.0, and the H5P libraries in the pack have their own licences, listed in
`@missing-elements/h5p-libraries`' `libraries.txt`.

Not affiliated with H5P Group. H5P is a registered trademark of H5P Group AS.
