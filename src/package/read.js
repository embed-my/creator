/**
 * A package's two JSON files, read from the zip's index without touching anything else. Pure
 * but for zip.js, and the file is a `File` or `Blob`: the tests read in Node.
 */

import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js'

/**
 * @param {Blob} file
 * @returns {Promise<{ manifest: any, params: any, mainLibrary: string | null, entries: string[] }>}
 */
export async function readPackage(file) {
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    const json = async (name) => {
      const entry = entries.find((each) => each.filename === name && !each.directory)
      if (!entry) throw new Error(`The package has no ${name}`)
      return JSON.parse(await entry.getData(new TextWriter()))
    }
    const manifest = await json('h5p.json')
    const params = await json('content/content.json')
    const main = manifest.preloadedDependencies?.find((dependency) => dependency.machineName === manifest.mainLibrary)
    return { manifest, params, mainLibrary: main ? `${main.machineName} ${main.majorVersion}.${main.minorVersion}` : null, entries: entries.map((entry) => entry.filename) }
  } finally {
    await reader.close()
  }
}
