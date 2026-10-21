/**
 * Create: a teacher's own text made into an H5P file by the model on this computer — the server
 * and model chosen in the Model dialog, through `model/openai.js`. The text and what the model
 * writes stay on the computer. What the model is asked, and how its answer becomes a package, is
 * `authoring.js`, loaded with the pack's semantics the first time Create is used, so the app's
 * first load carries neither.
 */

import { ModelError, session as modelSession } from './model/openai.js'
import { currentServer } from './model/settings.js'

const $ = (selector) => document.querySelector(selector)

/** A problem worth saying in the teacher's words. */
class CreateError extends Error {}

/**
 * The function that opens Create's dialog. `onCreated` is handed the package as a `File`, to
 * open as any picked file is.
 */
export function createOffer({ onCreated }) {
  const dialog = $('#create-dialog')
  const form = $('#create-form')
  const status = $('#create-status')
  const submit = $('#create-submit')
  const cancel = $('#create-cancel')
  const languageSelect = form.elements.language

  // The browser's language, where the pack has it.
  const preferred = navigator.language?.split('-')[0]
  if ([...languageSelect.options].some((option) => option.value === preferred)) languageSelect.value = preferred

  const say = (text, tone = '') => {
    status.textContent = text
    status.dataset.tone = tone
  }

  /** The creation under way, for Cancel and for closing the dialog. */
  let running = null
  const setRunning = (controller) => {
    running = controller
    submit.disabled = Boolean(controller)
    for (const field of form.querySelectorAll('textarea, select, input')) field.disabled = Boolean(controller)
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (running) return
    const data = new FormData(form)
    const request = {
      text: String(data.get('text') ?? '').trim(),
      kind: String(data.get('kind')),
      count: Number(data.get('count')),
      language: String(data.get('language'))
    }
    const controller = new AbortController()
    setRunning(controller)
    try {
      const file = await create(request, controller.signal, say)
      say('')
      dialog.close()
      onCreated(file)
    } catch (error) {
      if (controller.signal.aborted) say('')
      else say(explain(error), 'error')
    } finally {
      setRunning(null)
    }
  })

  cancel.addEventListener('click', () => {
    if (running) running.abort()
    else dialog.close()
  })
  // Escape closes the dialog; whatever was being written goes with it.
  dialog.addEventListener('close', () => running?.abort())

  return () => {
    say('')
    dialog.showModal()
  }
}

/**
 * Asks the model and makes the package: the model chosen, asked with the kind's shape as the
 * answer's schema, and its answer made into content.
 */
async function create({ text, kind, count, language }, signal, say) {
  const server = currentServer()
  if (!server) throw new CreateError('Choose a model first, under Model.')
  const [authoring, pack] = await Promise.all([import('./authoring.js'), import('virtual:h5p-authoring-pack').then((module) => module.default)])

  const { system, prompt, schema } = authoring.promptFor(kind, { text, count, language })
  const conversation = await modelSession({ server, system, signal })
  const started = Date.now()
  const writing = () => say(`Writing… ${Math.round((Date.now() - started) / 1000)} s.`)
  writing()
  const clock = setInterval(writing, 1000)
  try {
    const answer = await conversation.prompt(prompt, { schema, signal })
    let parsed
    try {
      parsed = JSON.parse(answer)
    } catch {
      throw new CreateError("The model's answer was not in the form asked for. Try again.")
    }
    return await authoring.packageFrom(authoring.contentFrom(kind, parsed, { pack, language, count }))
  } finally {
    clearInterval(clock)
    conversation.destroy()
  }
}

/** What went wrong, for the teacher. */
function explain(error) {
  if (error instanceof CreateError || error instanceof ModelError) return error.message
  if (error?.name === 'AuthoringError') return `${error.message} Try again, or with a longer text.`
  return `The model could not write it: ${error instanceof Error ? error.message : String(error)}`
}
