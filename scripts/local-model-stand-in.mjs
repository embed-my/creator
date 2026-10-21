/**
 * A model server on this machine, as Unsloth Studio, LM Studio and Ollama serve one: the
 * OpenAI-compatible Chat Completions API, here with no CORS headers at all, as LM Studio sends
 * none by default. It answers any edit by changing the title, and prints what the desktop check
 * reports (`desktop-check/check.js`).
 *
 *   node scripts/local-model-stand-in.mjs     (port 47616, or PORT=…)
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 47616)

const json = (response, value) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(value))
}

createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => (body += chunk))
  request.on('end', () => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const origin = request.headers.origin ?? 'no Origin header'
    if (request.method === 'POST' && pathname === '/report') {
      const { step, ok, detail } = JSON.parse(body)
      console.log(`[check] ${ok ? 'ok  ' : 'FAIL'} ${step}${detail ? `\n${typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}` : ''}`)
      return response.end()
    }
    if (request.method === 'GET' && pathname === '/v1/models') return json(response, { object: 'list', data: [{ id: 'stand-in', object: 'model' }] })
    if (request.method === 'POST' && pathname === '/v1/chat/completions') {
      const { response_format: format } = JSON.parse(body)
      console.log(`[stand-in] chat completion from ${origin}, response_format ${format?.type ?? 'none'}`)
      const content = JSON.stringify({ changes: { t1: 'Water on Earth' }, reply: 'I changed the title.' })
      return json(response, {
        id: 'stand-in-1',
        object: 'chat.completion',
        model: 'stand-in',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 20, total_tokens: 920 }
      })
    }
    console.log(`[stand-in] ${request.method} ${pathname} from ${origin}: 404`)
    response.statusCode = 404
    response.end()
  })
}).listen(PORT, '127.0.0.1', () => console.log(`Local model stand-in on http://127.0.0.1:${PORT}`))
