/**
 * A package written afresh with its `h5p.json` or `content/content.json` replaced: every other
 * entry copied as it is stored, compressed bytes, checksum and dates included, in its place in
 * the archive, so the libraries and media come out byte for byte. For a file that leaves the app,
 * as the toolset's `apply` writes it; the player's working copy (`working-copy.js`) appends to the
 * original instead, which is quicker and leaves bytes nothing reads. Pure but for zip.js: a `Blob`
 * in, a `Blob` out.
 */

import { BlobReader, BlobWriter, TextReader, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, configure } from '@zip.js/zip.js'

/**
 * @param {Blob} file the package as it is
 * @param {{ manifest?: any, params?: any }} content what replaces `h5p.json` and `content/content.json`; one may be left out
 * @returns {Promise<Blob>}
 */
export async function rewritePackage(file, { manifest, params }) {
  configure({ useWebWorkers: false })
  /** @type {Map<string, string>} */
  const replaced = new Map()
  if (manifest !== undefined) replaced.set('h5p.json', JSON.stringify(manifest))
  if (params !== undefined) replaced.set('content/content.json', JSON.stringify(params))

  const reader = new ZipReader(new BlobReader(file))
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  try {
    for (const entry of await reader.getEntries()) {
      const text = replaced.get(entry.filename)
      if (entry.directory) await writer.add(entry.filename, undefined, { entry })
      else if (text !== undefined) await writer.add(entry.filename, new TextReader(text), { entry, lastModDate: new Date() })
      else {
        // zip.js copies an entry verbatim when handed it with `passThrough`: nothing is
        // decompressed, so its compression, size and checksum are the source's.
        const stored = await /** @type {import('@zip.js/zip.js').FileEntry} */ (entry).getData(new Uint8ArrayWriter(), { passThrough: true })
        await writer.add(entry.filename, new Uint8ArrayReader(stored), { passThrough: true, entry })
      }
    }
    return await writer.close()
  } finally {
    await reader.close()
  }
}
