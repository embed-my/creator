/**
 * The working copy the player plays after an edit: the original file's bytes kept in place and
 * referenced, not copied, followed by a new `h5p.json` and `content/content.json`, a new central
 * directory that lists every other entry where it already is, and a new end record. Zip readers
 * find the index from the end, so the old entries for the two files become bytes nothing visits.
 *
 * Measured on 2026-10-19 in Chromium: built in 1–4 ms at any size, and the player reaches
 * `ready` in 83 ms for a Create-sized file and 370 ms at 228 MB. The export (`exportPackage`)
 * writes a clean file; this is for the player only. Archives beyond 4 GB (zip64) are not
 * handled: no H5P package is that large.
 */

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(bytes) {
  let c = -1
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff]
const u32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The signatures of the end record, a central directory entry and a local header. */
const END = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
/** MS-DOS time and date fields, left at zero, and the "version" fields, at 2.0. */
const VERSION = 20

/**
 * @param {Blob} file the package as it is
 * @param {{ manifest?: any, params?: any }} content what replaces `h5p.json` and `content/content.json`; one may be left out
 * @param {{ name?: string, type?: string }} [options]
 * @returns {Promise<File>}
 */
export async function withContent(file, { manifest, params }, { name = file.name, type = file.type || 'application/zip' } = {}) {
  const replaced = new Map()
  if (manifest !== undefined) replaced.set('h5p.json', encoder.encode(JSON.stringify(manifest)))
  if (params !== undefined) replaced.set('content/content.json', encoder.encode(JSON.stringify(params)))

  const { directory, count } = await centralDirectory(file)
  const kept = []
  let keptCount = 0
  const view = new DataView(directory.buffer, directory.byteOffset)
  for (let at = 0; at < directory.length; ) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('The archive index is damaged')
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const total = 46 + nameLength + extraLength + commentLength
    const entryName = decoder.decode(directory.subarray(at + 46, at + 46 + nameLength))
    if (!replaced.has(entryName)) {
      kept.push(directory.subarray(at, at + total))
      keptCount++
    }
    at += total
  }
  if (keptCount + replaced.size > 0xffff || count > 0xffff) throw new Error('Too many entries for a plain zip')

  const parts = [file]
  const added = []
  let offset = file.size
  for (const [entryName, data] of replaced) {
    const nameBytes = encoder.encode(entryName)
    const crc = crc32(data)
    const local = new Uint8Array([...u32(LOCAL), ...u16(VERSION), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes])
    added.push(
      new Uint8Array([
        ...u32(CENTRAL), ...u16(VERSION), ...u16(VERSION), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes
      ])
    )
    parts.push(local, data)
    offset += local.length + data.length
  }
  const entries = [...kept, ...added]
  const directorySize = entries.reduce((sum, entry) => sum + entry.length, 0)
  const end = new Uint8Array([...u32(END), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(directorySize), ...u32(offset), ...u16(0)])
  return new File([...parts, ...entries, end], name, { type, lastModified: Date.now() })
}

/** The central directory and its entry count, from the end record at the end of the file. */
async function centralDirectory(file) {
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer())
  const view = new DataView(tail.buffer, tail.byteOffset)
  for (let at = tail.length - 22; at >= 0; at--) {
    if (view.getUint32(at, true) !== END) continue
    const count = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 12, true)
    const offset = view.getUint32(at + 16, true)
    if (offset === 0xffffffff || size === 0xffffffff) throw new Error('A zip64 archive cannot be given a working copy')
    return { directory: new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()), count }
  }
  throw new Error('Not a zip file: no end record')
}
