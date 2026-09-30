/**
 * Utterance demo: text-to-speech and speech-to-text on iOS and Android.
 *
 * Copy this file to Resources/app.js of a Titanium app that includes the bencoding.utterance module.
 *
 * tiapp.xml needs:
 *
 *   <property name="ti.ui.defaultunit" type="string">dp</property>
 *
 *   <ios><plist><dict>
 *     <key>NSMicrophoneUsageDescription</key><string>Used to convert your voice to text.</string>
 *     <key>NSSpeechRecognitionUsageDescription</key><string>Used to convert your voice to text.</string>
 *   </dict></plist></ios>
 *
 *   <android xmlns:android="http://schemas.android.com/apk/res/android"><manifest>
 *     <uses-permission android:name="android.permission.RECORD_AUDIO"/>
 *     <uses-permission android:name="android.permission.INTERNET"/>
 *   </manifest></android>
 *
 *   <modules>
 *     <module platform="iphone">bencoding.utterance</module>
 *     <module platform="android">bencoding.utterance</module>
 *   </modules>
 */

const utterance = require('bencoding.utterance')

const IOS = Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad'
const ANDROID = Ti.Platform.osname === 'android'

// =============================================================================
// Design tokens
// =============================================================================

const C = {
  bg: '#0B1020',
  surface: '#141A2E',
  surface2: '#1D2540',
  line: '#2A3354',
  text: '#F4F6FF',
  muted: '#8C96B8',
  accent: '#7C5CFF',
  accent2: '#22D3C5',
  danger: '#FF6B8A',
  dangerSoft: '#3A1F33',
  success: '#3DDC97'
}

const gradient = () => ({
  type: 'linear',
  startPoint: { x: '0%', y: '0%' },
  endPoint: { x: '100%', y: '100%' },
  colors: [C.accent, C.accent2]
})

const LANGUAGES = [
  { code: 'en-US', name: 'English', sample: 'Welcome to Utterance. Your device is reading this text out loud.' },
  { code: 'es-MX', name: 'Español', sample: 'Bienvenido a Utterance. Tu dispositivo está leyendo este texto en voz alta.' },
  { code: 'fr-FR', name: 'Français', sample: 'Bienvenue dans Utterance. Votre appareil lit ce texte à voix haute.' },
  { code: 'de-DE', name: 'Deutsch', sample: 'Willkommen bei Utterance. Dein Gerät liest diesen Text laut vor.' },
  { code: 'it-IT', name: 'Italiano', sample: 'Benvenuto in Utterance. Il tuo dispositivo legge questo testo ad alta voce.' }
]

const RATES = [
  { name: 'Very slow', key: 'VERY_SLOW_SPEECH_RATE' },
  { name: 'Slow', key: 'SLOW_SPEECH_RATE' },
  { name: 'Normal', key: 'DEFAULT_SPEECH_RATE' },
  { name: 'Fast', key: 'FAST_SPEECH_RATE' },
  { name: 'Very fast', key: 'VERY_FAST_SPEECH_RATE' }
]

// Commands the Listen tab recognizes. `words` holds every alternative the recognizer returns, best first,
// so a command is matched even when it is the second or third guess.
const COMMANDS = [
  { id: 'next', glyph: '▶', name: 'Next', says: ['next card', 'next', 'siguiente carta', 'siguiente', 'la que sigue'] },
  { id: 'pause', glyph: '❚❚', name: 'Pause', says: ['pause', 'pausa', 'espera'] },
  { id: 'repeat', glyph: '↺', name: 'Repeat', says: ['repeat', 'again', 'repite', 'repetir', 'otra vez'] }
]

const MAX_LISTEN_SECONDS = 20

const state = {
  page: 0,
  speakLanguage: 0,
  listenLanguage: 0,
  rate: 2,
  speaking: false,
  requested: false,
  listening: false,
  starting: false,
  stopping: false,
  seconds: 0,
  ticker: null
}

// =============================================================================
// Small view factories
// =============================================================================

const label = (text, props = {}) => Ti.UI.createLabel(Object.assign({
  text,
  color: C.text,
  left: 0,
  font: { fontSize: 15 }
}, props))

function card(title) {
  const view = Ti.UI.createView({
    layout: 'vertical',
    height: Ti.UI.SIZE,
    left: 16,
    right: 16,
    top: 14,
    backgroundColor: C.surface,
    borderRadius: 22
  })
  view.add(label(title.toUpperCase(), {
    left: 18,
    top: 18,
    color: C.muted,
    font: { fontSize: 11, fontWeight: 'bold' }
  }))
  return view
}

function chipRow(items, selected, onSelect) {
  const row = Ti.UI.createView({ layout: 'horizontal', height: Ti.UI.SIZE, left: 18, right: 18, top: 6 })
  const chips = items.map((item, index) => {
    const chip = Ti.UI.createView({
      width: Ti.UI.SIZE,
      height: 34,
      left: 0,
      right: 8,
      top: 8,
      borderRadius: 17,
      borderWidth: 1
    })
    const text = label(item.name, { width: Ti.UI.SIZE, left: 14, right: 14, font: { fontSize: 13, fontWeight: 'bold' }, touchEnabled: false })
    chip.add(text)
    chip.addEventListener('click', () => onSelect(index))
    row.add(chip)
    return { chip, text }
  })
  const paint = (index) => chips.forEach((entry, i) => {
    const on = i === index
    entry.chip.backgroundColor = on ? C.accent : C.surface2
    entry.chip.borderColor = on ? C.accent : C.line
    entry.text.color = on ? '#FFFFFF' : C.muted
  })
  paint(selected)
  return { view: row, select: paint }
}

// A gradient button; `danger` fades a solid layer over the gradient, so the change never redraws the gradient itself
function bigButton(title, onTap) {
  const view = Ti.UI.createView({ height: 54, left: 18, right: 18, top: 20, bottom: 18, borderRadius: 27, backgroundGradient: gradient() })
  const danger = Ti.UI.createView({ backgroundColor: C.danger, borderRadius: 27, opacity: 0, touchEnabled: false })
  const text = label(title, { left: null, color: '#FFFFFF', font: { fontSize: 16, fontWeight: 'bold' }, touchEnabled: false })
  view.add(danger)
  view.add(text)
  view.addEventListener('click', onTap)
  return {
    view,
    set: (newTitle, isDanger) => {
      text.text = newTitle
      danger.opacity = isDanger ? 1 : 0
    }
  }
}

function notice() {
  const view = Ti.UI.createView({
    height: 0,
    visible: false,
    left: 16,
    right: 16,
    top: 14,
    backgroundColor: C.dangerSoft,
    borderColor: C.danger,
    borderWidth: 1,
    borderRadius: 16
  })
  const text = label('', { height: Ti.UI.SIZE, left: 16, right: 16, top: 14, bottom: 14, color: C.text, font: { fontSize: 14 } })
  view.add(text)
  return {
    view,
    show: (message) => {
      text.text = message
      view.height = Ti.UI.SIZE
      view.visible = true
    },
    hide: () => {
      view.visible = false
      view.height = 0
    }
  }
}

function page() {
  return Ti.UI.createScrollView({
    layout: 'vertical',
    scrollType: 'vertical',
    showVerticalScrollIndicator: false,
    width: Ti.UI.FILL,
    height: Ti.UI.FILL,
    contentHeight: Ti.UI.SIZE
  })
}

const spacer = (height = 32) => Ti.UI.createView({ height, width: 1 })

// =============================================================================
// Window, header and tabs
// =============================================================================

const win = Ti.UI.createWindow(Object.assign({ backgroundColor: C.bg, layout: 'vertical', extendSafeArea: false },
  ANDROID ? { windowSoftInputMode: Ti.UI.Android.SOFT_INPUT_ADJUST_PAN } : {}))
if (IOS) {
  win.statusBarStyle = Ti.UI.iOS.StatusBar.LIGHT_CONTENT
}

const header = Ti.UI.createView({ height: Ti.UI.SIZE, left: 20, right: 20, top: 10 })
const headerText = Ti.UI.createView({ layout: 'vertical', height: Ti.UI.SIZE, left: 0 })
headerText.add(label('Utterance', { font: { fontSize: 34, fontWeight: 'bold' } }))
headerText.add(label('Give your app a voice and ears.', { color: C.muted, top: 2, font: { fontSize: 14 } }))
header.add(headerText)
const platformChip = Ti.UI.createView({ right: 0, top: 8, height: 26, width: Ti.UI.SIZE, borderRadius: 13, backgroundColor: C.surface2 })
platformChip.add(label(`${IOS ? 'iOS' : 'Android'} ${Ti.Platform.version}`, { width: Ti.UI.SIZE, left: 12, right: 12, color: C.muted, font: { fontSize: 11, fontWeight: 'bold' } }))
header.add(platformChip)
win.add(header)

const tabs = Ti.UI.createView({ height: 46, left: 16, right: 16, top: 16, backgroundColor: C.surface, borderRadius: 23 })
const tabBody = Ti.UI.createView({ left: 3, right: 3, top: 3, bottom: 3 })
const segments = ['Speak', 'Listen'].map((title, index) => {
  const view = Ti.UI.createView({ width: '50%', left: index === 0 ? '0%' : '50%', borderRadius: 20 })
  const on = Ti.UI.createView({ backgroundGradient: gradient(), borderRadius: 20, opacity: index === 0 ? 1 : 0, touchEnabled: false })
  const text = label(title, { left: null, font: { fontSize: 14, fontWeight: 'bold' }, color: index === 0 ? '#FFFFFF' : C.muted, touchEnabled: false })
  view.add(on)
  view.add(text)
  view.addEventListener('click', () => showPage(index))
  tabBody.add(view)
  return { on, text }
})
tabs.add(tabBody)
win.add(tabs)

const pages = Ti.UI.createView({ width: Ti.UI.FILL, height: Ti.UI.FILL, top: 4 })
win.add(pages)

const speakPage = page()
const listenPage = page()
listenPage.visible = false
pages.add(speakPage)
pages.add(listenPage)

function showPage(index) {
  state.page = index
  speakPage.visible = index === 0
  listenPage.visible = index === 1
  segments.forEach((segment, i) => {
    segment.on.opacity = i === index ? 1 : 0
    segment.text.color = i === index ? '#FFFFFF' : C.muted
  })
}

// =============================================================================
// Speak tab
// =============================================================================

const speech = utterance.createSpeech()
const speakNotice = notice()
speakPage.add(speakNotice.view)

const textCard = card('Text to speak')
const textArea = Ti.UI.createTextArea({
  value: LANGUAGES[0].sample,
  height: 120,
  left: 18,
  right: 18,
  top: 10,
  bottom: 18,
  backgroundColor: C.surface2,
  color: C.text,
  borderRadius: 14,
  borderWidth: 0,
  font: { fontSize: 16 },
  padding: { left: 12, right: 12 }
})
textCard.add(textArea)
speakPage.add(textCard)

const voiceCard = card('Voice')

// Only languages with an installed voice are offered. With no voice for a language, the engine reads the text
// with its default voice, so French would sound like the device language trying to pronounce French.
let speakLanguages = LANGUAGES
let speakChips = null
const speakChipsHolder = Ti.UI.createView({ height: Ti.UI.SIZE, left: 0, right: 0 })
const voicesHint = label('Looking for installed voices...', { left: 18, right: 18, top: 10, color: C.muted, font: { fontSize: 12 } })

function showSpeakLanguages(list, hint) {
  const previous = speakLanguages[state.speakLanguage]
  const wasSample = LANGUAGES.some((language) => language.sample === textArea.value)
  speakLanguages = list
  const kept = list.findIndex((language) => language.code === previous.code)
  state.speakLanguage = kept >= 0 ? kept : 0
  speakChips = chipRow(list, state.speakLanguage, (index) => {
    const isSample = LANGUAGES.some((language) => language.sample === textArea.value)
    state.speakLanguage = index
    speakChips.select(index)
    if (isSample) {
      textArea.value = speakLanguages[index].sample
    }
  })
  speakChipsHolder.removeAllChildren()
  speakChipsHolder.add(speakChips.view)
  voicesHint.text = hint
  if (wasSample) {
    textArea.value = list[state.speakLanguage].sample
  }
}
voiceCard.add(speakChipsHolder)
voiceCard.add(voicesHint)

const bestRow = Ti.UI.createView({ height: 44, left: 18, right: 18, top: 10 })
bestRow.add(label('Best installed voice', { font: { fontSize: 15 } }))
const bestSwitch = Ti.UI.createSwitch({ value: true, right: 0, onTintColor: C.accent, tintColor: C.line })
bestRow.add(bestSwitch)
voiceCard.add(bestRow)

const rateRow = Ti.UI.createView({ height: Ti.UI.SIZE, left: 18, right: 18, top: 4, layout: 'vertical' })
const rateTitle = Ti.UI.createView({ height: 24 })
rateTitle.add(label('Speed', { font: { fontSize: 15 } }))
const rateName = label(RATES[2].name, { left: null, right: 0, color: C.accent2, font: { fontSize: 14, fontWeight: 'bold' } })
rateTitle.add(rateName)
rateRow.add(rateTitle)
const rateSlider = Ti.UI.createSlider({ min: 0, max: RATES.length - 1, value: state.rate, height: Ti.UI.SIZE, left: 0, right: 0, top: 6, bottom: 4, tintColor: C.accent, trackTintColor: C.surface2 })
rateSlider.addEventListener('change', (e) => {
  state.rate = Math.round(e.value)
  rateName.text = RATES[state.rate].name
})
rateRow.add(rateSlider)
voiceCard.add(rateRow)

const speakButton = bigButton('Speak', () => (state.speaking ? speech.stopSpeaking() : speak(textArea.value, speakLanguages[state.speakLanguage].code, true)))
voiceCard.add(speakButton.view)
speakPage.add(voiceCard)

const speakStatus = label('', { left: 0, color: C.muted, font: { fontSize: 13 } })
const speakStatusRow = Ti.UI.createView({ height: Ti.UI.SIZE, left: 34, right: 34, top: 14 })
speakStatusRow.add(speakStatus)
speakPage.add(speakStatusRow)
speakPage.add(spacer())

speakPage.addEventListener('singletap', (e) => {
  if (e.source !== textArea) {
    textArea.blur()
  }
})

function setSpeaking(on, message) {
  state.speaking = on
  speakButton.set(on ? 'Stop' : 'Speak', on)
  speakStatus.text = message || ''
}

// `rate` and `bestVoice` come from the controls on the Speak tab; "Read it back" uses the defaults
function speak(text, code, fromSpeakTab) {
  if (!text || !text.trim()) {
    return
  }
  if (state.listening) {
    stopListening()
  }
  speakNotice.hide()
  state.requested = true
  speech.startSpeaking({
    text,
    voice: code,
    bestVoice: fromSpeakTab ? bestSwitch.value : true,
    rate: speech[RATES[fromSpeakTab ? state.rate : 2].key]
  })
}

if (!speech.isSupported()) {
  speakNotice.show('Text-to-speech is not available on this device.')
}

// The `voices` event lists the installed voices; Android reports languages as es_MX and iOS as es-MX.
// On a cold start the engine can still be connecting and answer with an empty list, so ask again a few times.
let voicesReceived = false
let voiceAttempts = 0
speech.addEventListener('voices', (e) => {
  const installed = new Set((e.voices || []).map((voice) => String(voice.language || '').split(/[-_]/)[0].toLowerCase()))
  if (installed.size === 0 && voiceAttempts < 3) {
    voiceAttempts += 1
    setTimeout(() => speech.requestVoices(), 1500)
    return
  }
  voicesReceived = true
  const available = LANGUAGES.filter((language) => installed.has(language.code.split('-')[0].toLowerCase()))
  if (available.length > 0) {
    showSpeakLanguages(available, 'Only languages with a voice installed on this device are listed.')
  } else {
    showSpeakLanguages(LANGUAGES, 'No installed voices were reported, so every language is listed.')
  }
})
speech.requestVoices()
setTimeout(() => {
  if (!voicesReceived) {
    showSpeakLanguages(LANGUAGES, 'The installed voices could not be listed, so every language is listed.')
  }
}, 8000)
// Android fires `started` for its own warm-up utterance too, so only speech this app asked for counts
speech.addEventListener('started', () => state.requested && setSpeaking(true, 'Speaking...'))
speech.addEventListener('completed', () => {
  state.requested = false
  setSpeaking(false, 'Done.')
})
// stopSpeaking() fires `stopped` (iOS also fires `canceled`); cancelSpeaking() fires `canceled`
const onSpeechStopped = () => {
  state.requested = false
  setSpeaking(false, 'Stopped.')
}
speech.addEventListener('stopped', onSpeechStopped)
speech.addEventListener('canceled', onSpeechStopped)
speech.addEventListener('error', (e) => {
  state.requested = false
  setSpeaking(false, '')
  speakNotice.show(e.error || e.message || 'The device could not speak this text.')
})

// =============================================================================
// Listen tab
// =============================================================================

const stt = utterance.createSpeechToText()
const sttSupported = stt.isSupported()
const listenNotice = notice()
listenPage.add(listenNotice.view)

// The orb: two rings that pulse outward while the microphone is open, a gradient disc, and a mic or stop glyph
const orbArea = Ti.UI.createView({ height: 250, left: 16, right: 16, top: 6 })
const ringA = Ti.UI.createView({ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: C.accent2, opacity: 0, touchEnabled: false })
const ringB = Ti.UI.createView({ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: C.accent, opacity: 0, touchEnabled: false })
const orb = Ti.UI.createView({ width: 136, height: 136, borderRadius: 68, backgroundGradient: gradient() })
const micGlyph = label('🎤', { left: null, font: { fontSize: 50 }, touchEnabled: false })
const stopGlyph = Ti.UI.createView({ width: 34, height: 34, borderRadius: 9, backgroundColor: '#FFFFFF', opacity: 0, touchEnabled: false })
orb.add(micGlyph)
orb.add(stopGlyph)
orb.addEventListener('click', toggleListening)
orbArea.add(ringA)
orbArea.add(ringB)
orbArea.add(orb)
listenPage.add(orbArea)

const listenStatus = label('Tap to speak', { left: null, top: 0, font: { fontSize: 20, fontWeight: 'bold' } })
const listenHint = label('', { left: null, top: 6, color: C.muted, font: { fontSize: 13 } })
listenPage.add(listenStatus)
listenPage.add(listenHint)

const listenChips = chipRow(LANGUAGES, 0, (index) => {
  if (state.listening || state.starting) {
    return
  }
  state.listenLanguage = index
  listenChips.select(index)
})
const languageCard = card('Language')
languageCard.add(listenChips.view)
languageCard.add(spacer(14))
languageCard.top = 22
listenPage.add(languageCard)

const transcriptCard = card('Transcript')
const heard = label('Your words will appear here.', { left: 18, right: 18, top: 10, color: C.muted, font: { fontSize: 22, fontWeight: 'bold' } })
transcriptCard.add(heard)
const confidenceLabel = label('', { left: 18, top: 14, color: C.muted, font: { fontSize: 12 } })
const confidenceTrack = Ti.UI.createView({ height: 6, left: 18, right: 18, top: 6, borderRadius: 3, backgroundColor: C.surface2, visible: false })
const confidenceFill = Ti.UI.createView({ left: 0, width: '0%', borderRadius: 3, backgroundGradient: gradient() })
confidenceTrack.add(confidenceFill)
transcriptCard.add(confidenceLabel)
transcriptCard.add(confidenceTrack)
const alternativesRow = Ti.UI.createView({ layout: 'horizontal', height: Ti.UI.SIZE, left: 18, right: 18, top: 6 })
transcriptCard.add(alternativesRow)

const readBack = Ti.UI.createView({ height: 44, left: 18, right: 18, top: 16, bottom: 18, borderRadius: 22, borderWidth: 1, borderColor: C.accent, visible: false })
readBack.add(label('Read it back', { left: null, color: C.accent, font: { fontSize: 15, fontWeight: 'bold' }, touchEnabled: false }))
readBack.addEventListener('click', () => speak(heard.text, LANGUAGES[state.listenLanguage].code, false))
transcriptCard.add(readBack)
listenPage.add(transcriptCard)

const commandCard = card('Try a command')
commandCard.add(label('Say "next card", "pause" or "repeat" (or "siguiente carta", "pausa", "repite").', {
  left: 18,
  right: 18,
  top: 8,
  color: C.muted,
  font: { fontSize: 13 }
}))
const commandRow = Ti.UI.createView({ height: 96, left: 18, right: 18, top: 14, bottom: 18 })
const tiles = COMMANDS.map((command, index) => {
  const tile = Ti.UI.createView({
    width: '31%',
    left: index === 0 ? '0%' : (index === 1 ? '34.5%' : null),
    right: index === 2 ? 0 : null,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface2
  })
  const inner = Ti.UI.createView({ layout: 'vertical', height: Ti.UI.SIZE, touchEnabled: false })
  const glyph = label(command.glyph, { left: null, color: C.accent2, font: { fontSize: 22, fontWeight: 'bold' }, touchEnabled: false })
  const name = label(command.name, { left: null, top: 6, color: C.text, font: { fontSize: 14, fontWeight: 'bold' }, touchEnabled: false })
  inner.add(glyph)
  inner.add(name)
  tile.add(inner)
  commandRow.add(tile)
  return { tile, glyph }
})
commandCard.add(commandRow)
listenPage.add(commandCard)
listenPage.add(spacer())

function setListening(on) {
  state.listening = on
  state.starting = false
  micGlyph.opacity = on ? 0 : 1
  stopGlyph.opacity = on ? 1 : 0
  if (on) {
    pulse(ringA, 0)
    pulse(ringB, 800)
  }
}

function pulse(ring, delay) {
  if (!state.listening) {
    return
  }
  ring.applyProperties({ opacity: 0.9, transform: Ti.UI.create2DMatrix() })
  ring.animate({ opacity: 0, transform: Ti.UI.create2DMatrix().scale(2), duration: 1600, delay }, () => pulse(ring, 0))
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function startTicker() {
  state.seconds = 0
  listenStatus.text = 'Listening...'
  listenHint.text = `0:00 · tap again when you are done`
  state.ticker = setInterval(() => {
    state.seconds += 1
    listenHint.text = `${clock(state.seconds)} · tap again when you are done`
    if (state.seconds >= MAX_LISTEN_SECONDS) {
      stopListening()
    }
  }, 1000)
}

function stopTicker() {
  if (state.ticker) {
    clearInterval(state.ticker)
    state.ticker = null
  }
}

function ensureMicrophone(callback) {
  if (!ANDROID || Ti.Android.hasPermission('android.permission.RECORD_AUDIO')) {
    callback(true)
    return
  }
  Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], (e) => callback(e.success))
}

function toggleListening() {
  if (!sttSupported) {
    listenNotice.show('Speech recognition is not available on this device.')
    return
  }
  if (state.starting || state.stopping) {
    return
  }
  if (state.listening) {
    stopListening()
    return
  }
  ensureMicrophone((granted) => {
    if (!granted) {
      listenNotice.show('The microphone permission is off. Turn it on in the system settings to use speech recognition.')
      return
    }
    if (state.speaking) {
      speech.stopSpeaking()
    }
    listenNotice.hide()
    state.starting = true
    listenStatus.text = 'Getting ready...'
    listenHint.text = ''
    stt.startSpeechToText({ language: LANGUAGES[state.listenLanguage].code })
  })
}

function stopListening() {
  if (!state.listening || state.stopping) {
    return
  }
  state.stopping = true
  stopTicker()
  listenStatus.text = 'Processing...'
  listenHint.text = ''
  stt.stopRecording()
}

function friendly(message) {
  if (/No speech detected/i.test(message)) {
    return "I didn't catch that. Try again, a little closer to the microphone."
  }
  if (/permission/i.test(message)) {
    return 'The microphone permission is off. Turn it on in the system settings to use speech recognition.'
  }
  if (/No audio input/i.test(message)) {
    return 'This device has no microphone available right now.'
  }
  if (/Network/i.test(message)) {
    return 'Speech recognition needs an internet connection.'
  }
  return message
}

function showTranscript(event) {
  heard.text = event.text
  heard.color = C.text

  const confidence = Number(event.confidence) || 0
  const hasConfidence = confidence > 0
  confidenceLabel.text = hasConfidence ? `Confidence ${Math.round(confidence * 100)}%` : ''
  confidenceTrack.visible = hasConfidence
  confidenceFill.width = `${Math.round(Math.min(confidence, 1) * 100)}%`

  alternativesRow.removeAllChildren()
  const alternatives = (event.words || []).slice(1, 4)
  alternatives.forEach((text) => {
    const chip = Ti.UI.createView({ width: Ti.UI.SIZE, height: 30, left: 0, right: 8, top: 8, borderRadius: 15, backgroundColor: C.surface2 })
    chip.add(label(text, { width: Ti.UI.SIZE, left: 12, right: 12, color: C.muted, font: { fontSize: 12 } }))
    alternativesRow.add(chip)
  })
  readBack.visible = true
  matchCommand(event.words || [event.text])
}

function matchCommand(alternatives) {
  const heardWords = alternatives.map((text) => String(text).toLowerCase().trim())
  COMMANDS.forEach((command, index) => {
    // The recognizer returns whole phrases ("next card please"), so look for the command inside them
    if (!heardWords.some((text) => command.says.some((phrase) => text.includes(phrase)))) {
      return
    }
    const entry = tiles[index]
    entry.tile.borderColor = C.accent2
    entry.tile.animate({ transform: Ti.UI.create2DMatrix().scale(1.08), duration: 160, autoreverse: true })
    setTimeout(() => {
      entry.tile.borderColor = C.line
    }, 1400)
  })
}

stt.addEventListener('started', () => {
  setListening(true)
  startTicker()
})

stt.addEventListener('completed', (event) => {
  stopTicker()
  state.stopping = false
  setListening(false)
  listenStatus.text = 'Tap to speak'
  listenHint.text = ''
  if (!event.success) {
    listenNotice.show(friendly(event.message))
    return
  }
  if (!event.detectedInput) {
    listenNotice.show(friendly('No speech detected'))
    return
  }
  listenNotice.hide()
  showTranscript(event)
})

if (!sttSupported) {
  listenStatus.text = 'Not available'
  listenNotice.show('Speech recognition is not available on this device.')
}

// =============================================================================
// Lifecycle
// =============================================================================

win.addEventListener('close', () => {
  stopTicker()
  if (state.listening) {
    stt.stopRecording()
  }
  if (state.speaking) {
    speech.stopSpeaking()
  }
})

win.open()
