/**
 * The model server and model the app uses: chosen in the Model dialog, or found on the usual
 * ports when nothing is chosen yet, and kept in this window's storage — in memory alone where
 * storage is refused. An API key is kept with it, on this computer only.
 */

import { discover } from './openai.js'

const KEY = 'creator.model'
const listeners = new Set()
/** @type {{ name: string, url: string, model: string, key?: string, window?: number | null } | null | undefined} */
let current

const valid = (server) => Boolean(server) && typeof server.url === 'string' && typeof server.model === 'string' && server.model !== ''

/** The server chosen, or `null`. */
export function currentServer() {
  if (current === undefined) {
    try {
      current = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    } catch {
      current = null
    }
    if (!valid(current)) current = null
  }
  return current
}

export function setCurrentServer(server) {
  current = valid(server) ? server : null
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current))
    else localStorage.removeItem(KEY)
  } catch {}
  for (const listener of listeners) listener(current)
}

/** Calls `listener` with the server whenever another is chosen. */
export function onServerChange(listener) {
  listeners.add(listener)
}

/**
 * The server chosen; where none is, the first usual server that answers with a model, which is
 * then the one chosen. `null` where none answers.
 */
export async function findServer() {
  if (currentServer()) return current
  const found = (await discover()).find((server) => server.status === 'ready')
  if (!found) return null
  const [model] = found.models
  setCurrentServer({ name: found.name, url: found.url, model: model.id, window: model.window })
  return current
}

/** A model's id as a label: the last part of a path-like id, which is the name people know. */
export function modelLabel(server) {
  return server?.model.split('/').at(-1) ?? ''
}
