import type { ConsoleMessage, Page } from '@playwright/test'

/**
 * A model server as LM Studio serves one on its usual port, for the app in a browser: the
 * OpenAI-compatible API, with the CORS headers a page needs (the desktop app goes through Tauri's
 * HTTP client and needs none). The other usual ports refuse, as on a computer where only LM
 * Studio runs; with no `answer`, they all do, as where no server runs. `answer` writes each
 * answer's content from the request, and every request is kept, in order.
 *
 * Looking for servers, the browser logs a console error for each port that refuses (Chromium
 * names the address in the message's location, Firefox in its text); `refusal` tells those
 * apart from any other error, which is still a problem.
 */

export const MODEL = 'stand-in-model'

export type ChatRequest = {
  model: string
  messages: { role: string; content: string }[]
  response_format?: { type: string; json_schema?: { schema: { properties: Record<string, any> } } }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization'
}

export async function modelServer(page: Page, answer: ((request: ChatRequest) => string) | null, { window = 6000 } = {}) {
  const asked: ChatRequest[] = []
  const refused = answer ? /http:\/\/127\.0\.0\.1:(11434|8888|8080)\// : /http:\/\/127\.0\.0\.1:(1234|11434|8888|8080)\//
  const refusal = (message: ConsoleMessage) => refused.test(message.text()) || refused.test(message.location().url)
  await page.route(/^http:\/\/127\.0\.0\.1:(1234|11434|8888|8080)\//, async (route) => {
    const request = route.request()
    const { port, pathname } = new URL(request.url())
    if (port !== '1234' || !answer) return route.abort('connectionrefused')
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (pathname === '/v1/models') return route.fulfill({ headers: CORS, json: { object: 'list', data: [{ id: MODEL, object: 'model', context_length: window }] } })
    if (pathname === '/v1/chat/completions') {
      const body = request.postDataJSON() as ChatRequest
      asked.push(body)
      const content = answer(body)
      return route.fulfill({
        headers: CORS,
        json: {
          object: 'chat.completion',
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1100, completion_tokens: 100, total_tokens: 1200 }
        }
      })
    }
    return route.fulfill({ status: 404, headers: CORS })
  })
  return { asked, refusal }
}
