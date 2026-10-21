# Embed My Creator

Make an H5P activity from your own text, in the browser, with the AI model built into Chrome. Paste a
passage, your notes or a lesson summary, choose what to make, and get a `.h5p` file that plays at once
and that you can upload to any H5P site. The text and the result never leave your device.

It makes four kinds of activity, in English, German, Spanish, French or Japanese:

- **Quiz:** a Question Set of Multiple Choice
- **True or false:** a Question Set of True/False
- **Fill in the blanks**
- **Flashcards:** Dialog Cards

**Status:** in development. The page creates, plays and saves; it is not yet installable or
offline. Creating needs desktop Chrome 148 or later, on hardware that runs Chrome's on-device model.
Other browsers can open and play `.h5p` files.

## How it works

The model writes only the words, in a small JSON shape for each kind of activity. The app puts
those words into the content type's own structure, built from the library's `semantics.json`, with
every default filled in and its buttons translated into the content's language. Everything the
model wrote is escaped as H5P saves text, so the package is what an H5P site would have saved.

It plays with [h5p-offline-player](https://github.com/missing-elements/h5p-offline-player) and
its library pack, installed from npm.

## Development

Needs Node 22.12 or later, pnpm, and Chrome or Edge for the tests.

```bash
pnpm install
pnpm dev         # the app at http://localhost:5173
pnpm test        # builds each kind of activity and plays it in Chrome through h5p-verify
pnpm typecheck
pnpm build && pnpm e2e   # the built app in Chromium, Firefox and WebKit, with a stand-in model
```

[AGENTS.md](AGENTS.md) has the design, what Chrome's Prompt API offers, and what is left to do.

## Licence

MIT. `scripts/sweep-content.mjs` is copied from h5p-offline-player, also MIT
([LICENSE-h5p-offline-player](LICENSE-h5p-offline-player)). The H5P runtime the app will carry is
GPL-3.0, and the H5P libraries in the pack have their own licences, listed in
`@missing-elements/h5p-libraries`' `libraries.txt`.

Not affiliated with H5P Group. H5P is a registered trademark of H5P Group AS.
