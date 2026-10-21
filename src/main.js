/**
 * The page: the player, a file to open, the model server and model Create asks (the Model
 * dialog), Create, and Save for a file Create made. The element registers its own Service Worker beside its script; the app's own
 * worker, which also keeps the page for offline use (`mountH5P`), is still to come.
 */

import '@missing-elements/h5p-offline-player'
import { pack } from '@missing-elements/h5p-libraries'
import { runtime } from '@missing-elements/h5p-runtime'
import { createOffer } from './create.js'
import { openModelDialog } from './model-dialog.js'
import { findServer, modelLabel, onServerChange } from './model/settings.js'

const $ = (selector) => document.querySelector(selector)

const player = $('h5p-player')
const save = $('#save')
// Both before the first file: a content-only package takes its libraries from the pack, served
// from this site.
player.runtime = runtime
player.pack = pack

/** The object URL behind Save, revoked when another file takes its place. */
let saved = null

/** Plays a file, and offers Save when Create made it, since it exists nowhere else yet. */
function play(file, { created = false } = {}) {
  if (saved) URL.revokeObjectURL(saved)
  saved = created ? URL.createObjectURL(file) : null
  save.hidden = !created
  if (saved) {
    save.href = saved
    save.download = file.name
  }
  $('#home').hidden = true
  player.hidden = false
  player.file = file
}

$('#file').addEventListener('change', (event) => {
  const [file] = event.target.files
  if (file) play(file)
  event.target.value = ''
})

player.addEventListener('ready', (event) => {
  const title = event.detail.metadata?.title
  document.title = title ? `${title} · Embed My Creator` : 'Embed My Creator'
})

/** The Model button names the model chosen; the home page says how to get one where none answers. */
function showServer(server) {
  $('#model').textContent = server ? `Model: ${modelLabel(server)}` : 'Model'
  $('#model').title = server ? `${server.model} at ${server.url}` : 'Choose the model server and model'
  $('#no-model').hidden = Boolean(server)
}
onServerChange(showServer)
$('#model').addEventListener('click', openModelDialog)

const openCreate = createOffer({ onCreated: (file) => play(file, { created: true }) })
// Create with no model chosen asks for one first.
$('#create').addEventListener('click', async () => {
  if ((await findServer()) || (await openModelDialog())) openCreate()
})
showServer(await findServer())
