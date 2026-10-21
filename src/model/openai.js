/**
 * The model: a model server on this computer — LM Studio, Ollama, Unsloth Studio, llama.cpp's
 * `llama-server` — through the OpenAI-compatible Chat Completions API, behind the one small
 * interface the app talks to. Nothing else in the app talks to a model.
 *
 * In the desktop app every request goes through Tauri's HTTP client, from Rust, so the server's
 * CORS settings do not matter; in a browser it goes through `fetch`, which reaches only a server
 * that allows the page's origin.
 *
 * - `SERVERS` and `discover()`: the usual servers on their usual ports, and which of them answer.
 * - `models(server)`: the models a server offers (`/v1/models`), loaded ones first.
 * - `session({ server, system, signal })`: a conversation with the rules as its system prompt.
 * - `session.prompt(text, { schema, signal })`: the answer, held to the JSON schema by
 *   `response_format`; `{ json: true }` asks for any JSON object instead, for a server that
 *   refuses the schema. The turns so far go with every prompt, so a second try sees the first.
 * - `session.quota()`: the tokens the last answer took, and the window where the server says it.
 *
 * A server is `{ name, url, model, key?, window? }`, with `url` ending in `/v1`.
 */

/** The usual servers, where they listen by default. */
export const SERVERS = [
  { name: 'LM Studio', url: 'http://127.0.0.1:1234/v1' },
  { name: 'Ollama', url: 'http://127.0.0.1:11434/v1' },
  { name: 'Unsloth Studio', url: 'http://127.0.0.1:8888/v1' },
  { name: 'llama.cpp', url: 'http://127.0.0.1:8080/v1' }
]

/**
 * What went wrong with the server, in the teacher's words. `kind` is `unreachable` (nothing
 * answers), `key` (it wants an API key, or another one) or `server` (it answered with an error,
 * whose HTTP status is `status`).
 */
export class ModelError extends Error {
  constructor(message, { kind = 'server', status = 0 } = {}) {
    super(message)
    this.name = 'ModelError'
    this.kind = kind
    this.status = status
  }
}

/** The name a server goes by: its own, the usual one for its address, or none. */
export function serverName(server) {
  return server.name || SERVERS.find((known) => known.url === server.url)?.name || 'The model server'
}

let tauriFetch = null

/** Tauri's HTTP client in the desktop app, loaded the first time; the page's own `fetch` elsewhere. */
function client() {
  if (!('__TAURI_INTERNALS__' in globalThis)) return (url, init) => globalThis.fetch(url, init)
  tauriFetch ??= import('@tauri-apps/plugin-http').then((module) => module.fetch)
  return async (url, init) => (await tauriFetch)(url, init)
}

async function request(server, path, { body, signal } = {}) {
  let response
  try {
    response = await client()(`${server.url.replace(/\/+$/, '')}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(server.key ? { authorization: `Bearer ${server.key}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ModelError(`Nothing answers at ${server.url}. Is ${serverName(server)} running?`, { kind: 'unreachable' })
  }
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  if (response.status === 401 || response.status === 403) {
    throw new ModelError(`${serverName(server)} wants ${server.key ? 'another' : 'its'} API key.`, { kind: 'key', status: response.status })
  }
  if (!response.ok) {
    const said = typeof data?.error === 'string' ? data.error : (data?.error?.message ?? (text.slice(0, 300) || response.statusText))
    throw new ModelError(`${serverName(server)} said: ${said}`, { status: response.status })
  }
  return data
}

/**
 * The models a server offers, loaded ones first, without embedding models, which cannot write.
 * `window` is the context length where the server says it (Unsloth Studio, LM Studio).
 * @returns {Promise<{ id: string, loaded: boolean, window: number | null }[]>}
 */
export async function models(server, { signal } = {}) {
  const data = await request(server, '/models', { signal })
  const list = Array.isArray(data?.data) ? data.data : []
  return list
    .filter((entry) => typeof entry?.id === 'string' && !/embed/i.test(entry.id))
    .map((entry) => ({ id: entry.id, loaded: entry.loaded !== false, window: entry.context_length ?? entry.max_context_length ?? null }))
    .sort((a, b) => Number(b.loaded) - Number(a.loaded))
}

/**
 * Each usual server with what it said: `ready` with its models, `no-model` (it answers but offers
 * none), `key` (it wants an API key) or `absent`.
 */
export async function discover({ servers = SERVERS, timeout = 1500 } = {}) {
  return Promise.all(
    servers.map(async (server) => {
      try {
        const found = await models(server, { signal: AbortSignal.timeout(timeout) })
        return { ...server, status: found.length ? 'ready' : 'no-model', models: found }
      } catch (error) {
        return { ...server, status: error?.kind === 'key' ? 'key' : 'absent', models: [] }
      }
    })
  )
}

/**
 * A conversation with the server's model.
 * @param {{ server: { name?: string, url: string, model: string, key?: string, window?: number | null }, system?: string, signal?: AbortSignal }} options
 */
export async function session({ server, system, signal }) {
  const messages = system ? [{ role: 'system', content: system }] : []
  let usage = null
  return {
    /**
     * @param {string} text
     * @param {{ schema?: object, json?: boolean, signal?: AbortSignal }} [options]
     * @returns {Promise<string>}
     */
    async prompt(text, { schema, json = false, signal: own } = {}) {
      const turn = [...messages, { role: 'user', content: text }]
      const format = schema ? { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } } : json ? { type: 'json_object' } : null
      const data = await request(server, '/chat/completions', {
        body: { model: server.model, messages: turn, stream: false, ...(format ? { response_format: format } : {}) },
        signal: own ?? signal
      })
      const answer = data?.choices?.[0]?.message?.content
      if (typeof answer !== 'string') throw new ModelError(`${serverName(server)} sent no answer.`)
      messages.push(turn.at(-1), { role: 'assistant', content: answer })
      usage = data.usage ?? null
      return answer
    },
    quota() {
      if (!usage) return null
      return { used: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0), total: server.window ?? null }
    },
    destroy() {}
  }
}
