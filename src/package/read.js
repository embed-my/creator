/**
 * A package's files, read from the zip's index without touching anything else. Pure but for
 * zip.js, and the file is a `File` or `Blob`: the tests and the toolset read in Node.
 */

import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js'

/**
 * A package kept open: the names of its files, and a file's text when it is asked for, as
 * h5p-author's `packageLibraries` reads a package's own libraries. Close it when done.
 * @param {Blob} file
 * @returns {Promise<{ names: string[], read: (name: string) => Promise<string>, close: () => Promise<void> }>}
 */
export async function openPackage(file) {
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    const files = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.filename, entry]))
    return {
      names: entries.map((entry) => entry.filename),
      read: async (name) => {
        const entry = files.get(name)
        if (!entry) throw new Error(`The package has no ${name}`)
        return /** @type {import('@zip.js/zip.js').FileEntry} */ (entry).getData(new TextWriter())
      },
      close: () => reader.close()
    }
  } catch (error) {
    await reader.close()
    throw error
  }
}

/**
 * @param {Blob} file
 * @returns {Promise<{ manifest: any, params: any, mainLibrary: string | null, entries: string[] }>}
 */
export async function readPackage(file) {
  const files = await openPackage(file)
  try {
    const manifest = JSON.parse(await files.read('h5p.json'))
    const params = JSON.parse(await files.read('content/content.json'))
    return { manifest, params, mainLibrary: mainLibraryOf(manifest), entries: files.names }
  } finally {
    await files.close()
  }
}

/** The content type as `h5p.json` names it among its dependencies: `H5P.QuestionSet 1.21`. */
export function mainLibraryOf(manifest) {
  const main = manifest?.preloadedDependencies?.find((dependency) => dependency.machineName === manifest.mainLibrary)
  return main ? `${main.machineName} ${main.majorVersion}.${main.minorVersion}` : null
}
