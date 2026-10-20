/**
 * The page: the player, a file to open, Create where Chrome's model is there, and Save for a file
 * Create made. The element registers its own Service Worker beside its script; the app's own
 * worker, which also keeps the page for offline use (`mountH5P`), is still to come.
 */

import '@missing-elements/h5p-offline-player'
import { pack } from '@missing-elements/h5p-libraries'
import { runtime } from '@missing-elements/h5p-runtime'
import { createOffer } from './create.js'

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
  document.title = title ? `${title} · H5P from your text` : 'H5P from your text'
})

const openCreate = await createOffer({ onCreated: (file) => play(file, { created: true }) })
if (openCreate) {
  $('#create').hidden = false
  $('#create').addEventListener('click', openCreate)
  $('#create-offer').hidden = false
} else {
  $('#no-model').hidden = false
}
