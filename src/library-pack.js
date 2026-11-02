/**
 * The library pack Create builds from and the editor reads, in the page: h5p-author's `openPack`
 * over the libraries' `pack` export, which the player plays from too. Opened the first time it is
 * needed, with h5p-author's code, so the app's first load carries neither; a library's part is
 * fetched whole when content first needs it, and checked against the pack's SHA-256 before it is
 * read. It needs a secure context, which the app has: `localhost`, or the desktop app's window.
 */

import { pack } from '@missing-elements/h5p-libraries'

/** @type {Promise<import('@missing-elements/h5p-author/core').LibrarySource> | null} */
let opened = null

export function libraryPack() {
  opened ??= import('@missing-elements/h5p-author/browser')
    .then(({ openPack }) => openPack(pack))
    .catch((error) => {
      opened = null
      throw error
    })
  return opened
}
