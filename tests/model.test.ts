import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelError, discover, models, session } from '../src/model/openai.js'
import { currentServer, findServer } from '../src/model/settings.js'

/*
 * The model module against a model server on `fetch`: what it asks, in the shape the
 * OpenAI-compatible servers take, and what it makes of their answers and their errors.
 */

type Route = (body: any) => Response
type Asked = { url: string; body: any; headers: Record<string, string> }

/** A fetch that answers by address prefix, refuses any other, and keeps every request. */
function serve(routes: Record<string, Route>): Asked[] {
  const asked: Asked[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null
    asked.push({ url, body, headers: (init.headers ?? {}) as Record<string, string> })
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!route) throw new TypeError('fetch failed')
    return route[1](body)
  })
  return asked
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const completion = (content: string) => json({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })

const LM_STUDIO = { name: 'LM Studio', url: 'http://127.0.0.1:1234/v1', model: 'gemma-4-e4b', window: 8192 }
const SCHEMA = { type: 'object', properties: { changes: { type: 'object' } }, required: ['changes'] }

afterEach(() => vi.unstubAllGlobals())

describe('a session', () => {
  it('asks with the system prompt, the schema as response_format, and the turns so far', async () => {
    const answers = ['{"changes":{"t1":"<h1>A</h1>"}}', '{"changes":{"t1":"A"}}']
    const asked = serve({ 'http://127.0.0.1:1234/v1/chat/completions': () => completion(answers.shift()!) })
    const conversation = await session({ server: LM_STUDIO, system: 'The rules.' })
    expect(await conversation.prompt('The outline and the request.', { schema: SCHEMA })).toBe('{"changes":{"t1":"<h1>A</h1>"}}')
    await conversation.prompt('These changes could not be used.', { schema: SCHEMA })

    expect(asked[0].body).toEqual({
      model: 'gemma-4-e4b',
      messages: [
        { role: 'system', content: 'The rules.' },
        { role: 'user', content: 'The outline and the request.' }
      ],
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: SCHEMA } }
    })
    // The second try sees the first: the fix round refers to it.
    expect(asked[1].body.messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(asked[1].body.messages[2].content).toBe('{"changes":{"t1":"<h1>A</h1>"}}')
    expect(conversation.quota()).toEqual({ used: 30, total: 8192 })
  })

  it('asks for any JSON object where told, and sends the key where there is one', async () => {
    const asked = serve({ 'http://127.0.0.1:8888/v1/chat/completions': () => completion('{}') })
    const conversation = await session({ server: { name: 'Unsloth Studio', url: 'http://127.0.0.1:8888/v1', model: 'm', key: 'sk-unsloth-1' } })
    await conversation.prompt('Hello', { json: true })
    expect(asked[0].body.response_format).toEqual({ type: 'json_object' })
    expect(asked[0].body.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(asked[0].headers.authorization).toBe('Bearer sk-unsloth-1')
    // Unsloth Studio does not say the window in an answer: the tokens, and no total.
    expect(conversation.quota()).toEqual({ used: 30, total: null })
  })

  it("says what went wrong in the teacher's words, and keeps a failed turn out of the conversation", async () => {
    const replies: Response[] = [
      json({ error: 'Unauthorized' }, 401),
      json({ error: { message: 'response_format is not supported' } }, 400),
      json({ error: 'model "x" not found' }, 404),
      completion('{}')
    ]
    const asked = serve({ 'http://127.0.0.1:1234/v1/chat/completions': () => replies.shift()! })
    const conversation = await session({ server: LM_STUDIO, system: 'The rules.' })
    await expect(conversation.prompt('one')).rejects.toMatchObject({ name: 'ModelError', kind: 'key', status: 401, message: 'LM Studio wants its API key.' })
    await expect(conversation.prompt('two')).rejects.toMatchObject({ kind: 'server', status: 400, message: 'LM Studio said: response_format is not supported' })
    await expect(conversation.prompt('three')).rejects.toMatchObject({ status: 404, message: 'LM Studio said: model "x" not found' })
    await conversation.prompt('four')
    expect(asked[3].body.messages).toEqual([
      { role: 'system', content: 'The rules.' },
      { role: 'user', content: 'four' }
    ])

    const elsewhere = await session({ server: { ...LM_STUDIO, url: 'http://127.0.0.1:9999/v1', name: '' } })
    const error = await elsewhere.prompt('hello').catch((caught) => caught)
    expect(error).toBeInstanceOf(ModelError)
    expect(error).toMatchObject({ kind: 'unreachable', message: 'Nothing answers at http://127.0.0.1:9999/v1. Is The model server running?' })
  })
})

describe('finding a server', () => {
  it('lists what a server offers, loaded models first, without embedding models', async () => {
    serve({
      'http://127.0.0.1:8888/v1/models': () =>
        json({
          data: [
            { id: 'unsloth/Qwen3.5-9B-GGUF', loaded: false },
            { id: 'gemma-4-E4B-it-Q6_K', loaded: true, context_length: 8192 },
            { id: 'embeddinggemma:300m' }
          ]
        })
    })
    expect(await models({ url: 'http://127.0.0.1:8888/v1' })).toEqual([
      { id: 'gemma-4-E4B-it-Q6_K', loaded: true, window: 8192 },
      { id: 'unsloth/Qwen3.5-9B-GGUF', loaded: false, window: null }
    ])
  })

  it('looks on the usual ports, and takes the first server that answers with a model', async () => {
    serve({
      'http://127.0.0.1:11434/v1/models': () => json({ data: [{ id: 'qwen3.5:4b' }] }),
      'http://127.0.0.1:8888/v1/models': () => json({ error: 'Unauthorized' }, 401),
      'http://127.0.0.1:8080/v1/models': () => json({ data: [] })
    })
    const found = await discover()
    expect(found.map(({ name, status }) => `${name}: ${status}`)).toEqual(['LM Studio: absent', 'Ollama: ready', 'Unsloth Studio: key', 'llama.cpp: no-model'])

    expect(currentServer()).toBeNull()
    expect(await findServer()).toEqual({ name: 'Ollama', url: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:4b', window: null })
    expect(currentServer()?.model).toBe('qwen3.5:4b')
  })
})
