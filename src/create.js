/**
 * Create: a teacher's own text made into an H5P file by Chrome's on-device model, through the
 * Prompt API (`LanguageModel`, on the web since Chrome 148, on the desktop). The text and what the
 * model writes stay on the device. Offered only where the browser has the model or can download it:
 * Firefox, Safari, Android and iOS never see the button. What the model is asked, and how its
 * answer becomes a package, is `authoring.js`, loaded with the pack's semantics the first time
 * Create is used, so the app's first load carries neither.
 */

const $ = (selector) => document.querySelector(selector)

/**
 * The Prompt API's options for a language: the instructions are English, the teacher's text and the
 * answer are in the language chosen. `availability()` is asked with the options `create()` gets.
 */
function modelOptions(language) {
  return {
    expectedInputs: [{ type: 'text', languages: [...new Set(['en', language])] }],
    expectedOutputs: [{ type: 'text', languages: [language] }]
  }
}

/** A problem worth saying in the teacher's words, not the API's. */
class CreateError extends Error {}

/**
 * Whether Create can be offered, and if so, the function that opens its dialog. `onCreated` is
 * handed the package as a `File`, to open as any picked file is.
 */
export async function createOffer({ onCreated }) {
  const model = globalThis.LanguageModel
  if (typeof model?.availability !== 'function') return null
  try {
    // 'downloadable' and 'downloading' count: the first Create downloads the model, with its progress shown.
    if ((await model.availability(modelOptions('en'))) === 'unavailable') return null
  } catch {
    return null
  }

  const dialog = $('#create-dialog')
  const form = $('#create-form')
  const status = $('#create-status')
  const submit = $('#create-submit')
  const cancel = $('#create-cancel')
  const languageSelect = form.elements.language

  // The browser's language, when the model writes it.
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
      else say(explain(error, request.language), 'error')
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
 * Asks the model and makes the package: the model's options checked for the language, the session
 * started — which downloads the model the first time, from the click that asked — and its answer,
 * held to the kind's shape, made into content.
 */
async function create({ text, kind, count, language }, signal, say) {
  const options = modelOptions(language)
  const [availability, authoring, pack] = await Promise.all([
    LanguageModel.availability(options),
    import('./authoring.js'),
    import('virtual:h5p-authoring-pack').then((module) => module.default)
  ])
  if (availability === 'unavailable') throw new CreateError(`Chrome's model on this device does not write ${languageName(language)}.`)

  const { system, prompt, schema } = authoring.promptFor(kind, { text, count, language })
  say(availability === 'available' ? 'Starting the model…' : "Downloading Chrome's model. The first time takes a while…")
  const session = await LanguageModel.create({
    ...options,
    initialPrompts: [{ role: 'system', content: system }],
    signal,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => say(`Downloading Chrome's model: ${Math.round(event.loaded * 100)}%`))
    }
  })

  const started = Date.now()
  const writing = () => say(`Writing… ${Math.round((Date.now() - started) / 1000)} s. It can take a minute on this device.`)
  writing()
  const clock = setInterval(writing, 1000)
  try {
    const answer = await session.prompt(prompt, { responseConstraint: schema, signal })
    let parsed
    try {
      parsed = JSON.parse(answer)
    } catch {
      throw new CreateError("The model's answer was not in the form asked for. Try again.")
    }
    return await authoring.packageFrom(authoring.contentFrom(kind, parsed, { pack, language, count }))
  } finally {
    clearInterval(clock)
    session.destroy()
  }
}

/** What went wrong, for the teacher. */
function explain(error, language) {
  if (error instanceof CreateError) return error.message
  if (error?.name === 'AuthoringError') return `${error.message} Try again, or with a longer text.`
  if (error?.name === 'QuotaExceededError') return 'The text is too long for the model on this device. Shorten it and try again.'
  if (error?.name === 'NotSupportedError') return `Chrome's model on this device does not write ${languageName(language)}.`
  if (error?.name === 'NotAllowedError') return `Chrome did not let the model start: ${error.message}`
  return `The model could not write it: ${error instanceof Error ? error.message : String(error)}`
}

function languageName(tag) {
  return $(`#create-form select[name="language"] option[value="${tag}"]`)?.textContent ?? tag
}
