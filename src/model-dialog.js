/**
 * The Model dialog: which model server on this computer, and which of its models, the app asks.
 * It looks on the usual ports when it opens and offers what answers; another address can be typed.
 * A server that wants an API key says so, and the key is asked for. Built the first time it opens,
 * so the app and the eval page share it.
 */

import { ModelError, SERVERS, discover, models, serverName } from './model/openai.js'
import { currentServer, setCurrentServer } from './model/settings.js'

let dialog = null

/** Opens the dialog; resolves with the server chosen, or `null` where it was closed without one. */
export function openModelDialog() {
  dialog ??= build()
  return dialog.open()
}

function build() {
  const element = document.createElement('dialog')
  element.className = 'create-dialog'
  element.setAttribute('aria-labelledby', 'model-title')
  element.innerHTML = `
    <form method="dialog">
      <h2 id="model-title">Model</h2>
      <p>The model runs on this computer, in an app such as LM Studio, Ollama or Unsloth Studio. Start
        the app and load a model in it, then choose it here. Nothing is sent anywhere else.</p>
      <label class="create-label" for="model-url">Server</label>
      <input class="field" id="model-url" name="url" list="model-servers" required autocomplete="off" spellcheck="false" />
      <datalist id="model-servers"></datalist>
      <label class="create-label" for="model-key">API key, if the server wants one</label>
      <input class="field" id="model-key" name="key" type="password" autocomplete="off" />
      <label class="create-label" for="model-model">Model</label>
      <select class="field" id="model-model" name="model" required></select>
      <p class="create-status" role="status" aria-live="polite"></p>
      <div class="dialog-actions">
        <button type="button" data-action="look">Look again</button>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="submit" class="primary">Use this model</button>
      </div>
    </form>`
  document.body.append(element)

  const form = element.querySelector('form')
  const url = form.elements.namedItem('url')
  const key = form.elements.namedItem('key')
  const select = form.elements.namedItem('model')
  const list = element.querySelector('datalist')
  const status = element.querySelector('[role="status"]')
  const say = (text, tone = '') => {
    status.textContent = text
    status.dataset.tone = tone
  }

  /** The models of the server the fields name, each with its window. */
  let offered = []
  let resolve = () => {}

  const server = () => ({ name: serverName({ url: url.value.trim() }), url: url.value.trim(), key: key.value.trim() })

  async function load() {
    select.replaceChildren()
    offered = []
    if (!url.value.trim()) return say('Type the server\'s address, such as http://127.0.0.1:1234/v1.', 'error')
    say('Asking the server…')
    try {
      offered = await models(server(), { signal: AbortSignal.timeout(5000) })
    } catch (error) {
      return say(error instanceof ModelError ? error.message : `Nothing answers at ${url.value.trim()}.`, 'error')
    }
    if (!offered.length) return say(`${server().name} answers, but offers no model. Load one in it, then press Look again.`, 'error')
    for (const model of offered) select.append(new Option(model.loaded ? model.id : `${model.id} (not loaded)`, model.id))
    const chosen = currentServer()
    if (chosen && chosen.url === url.value.trim() && offered.some((model) => model.id === chosen.model)) select.value = chosen.model
    say(`${server().name} answers with ${offered.length} model${offered.length === 1 ? '' : 's'}.`)
  }

  async function look() {
    say('Looking for model servers on this computer…')
    const found = await discover()
    list.replaceChildren(...found.filter((each) => each.status !== 'absent').map((each) => new Option(each.name, each.url)))
    const chosen = currentServer()
    const first = found.find((each) => each.status === 'ready') ?? found.find((each) => each.status === 'key')
    if (!url.value.trim()) url.value = chosen?.url ?? first?.url ?? SERVERS[0].url
    if (!found.some((each) => each.status !== 'absent') && !chosen) {
      select.replaceChildren()
      return say('No model server answers on the usual ports. Start LM Studio, Ollama or Unsloth Studio with a model loaded, then press Look again, or type the address it gives.', 'error')
    }
    await load()
  }

  url.addEventListener('change', load)
  key.addEventListener('change', load)
  element.querySelector('[data-action="look"]').addEventListener('click', look)
  element.querySelector('[data-action="cancel"]').addEventListener('click', () => element.close())
  form.addEventListener('submit', (event) => {
    const model = offered.find((each) => each.id === select.value)
    if (!model) {
      event.preventDefault()
      return say('Choose a model the server offers.', 'error')
    }
    const { name, url: address, key: secret } = server()
    setCurrentServer({ name, url: address, model: model.id, window: model.window, ...(secret ? { key: secret } : {}) })
    resolve(currentServer())
  })
  element.addEventListener('close', () => resolve(null))

  return {
    open() {
      const chosen = currentServer()
      url.value = chosen?.url ?? ''
      key.value = chosen?.key ?? ''
      say('')
      element.showModal()
      look()
      return new Promise((done) => {
        resolve = (value) => {
          resolve = () => {}
          done(value)
        }
      })
    }
  }
}
