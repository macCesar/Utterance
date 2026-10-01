/**
 * Utterance v4.2 - text-to-speech API test
 *
 * Paste it into a Titanium app (or require it from app.js) on a real device and read the log:
 * one line per function, PASS, FAIL or SKIP, and a summary at the end. It speaks aloud and
 * writes WAV files to the app's data directory. It takes about two minutes.
 *
 * Edit the constants below to turn on the checks that need a setup of their own.
 */

const utterance = require('bencoding.utterance')

// Name, without extension, of an audio file in platform/android/res/raw. Needed only for the
// positive earcon check on Android.
const EARCON_RESOURCE = null
// Asking for Personal Voice access can open a system prompt.
const ASK_PERSONAL_VOICE = false
// Android: speak a text over the engine's limit (several minutes of audio).
const RUN_LONG_TEXT = false

const speech = utterance.createSpeech()
// JavaScript collects a proxy that nothing holds, and its events stop arriving.
global.__ttsApiTestSpeech = speech

const IOS = Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad'
const IOS_VERSION = IOS ? parseFloat(Ti.Platform.version) : 0
const counts = { PASS: 0, FAIL: 0, SKIP: 0 }
const VOICE = 'es-MX'

function report (status, name, detail) {
  counts[status]++
  console.log(status + ' ' + name + (detail ? ' | ' + detail : ''))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Android's Ti.Filesystem wants the file: scheme on an absolute path
const fileUrl = (path) => (path.indexOf('file:') === 0 ? path : 'file://' + path)

class Skip extends Error {}
const skip = (reason) => { throw new Skip(reason) }

// Runs one check. It passes when the function returns, fails when it throws, and is skipped when it calls skip().
async function check (name, fn) {
  try {
    const detail = await fn()
    report('PASS', name, typeof detail === 'string' ? detail : '')
  } catch (error) {
    if (error instanceof Skip) {
      report('SKIP', name, error.message)
    } else {
      report('FAIL', name, error && error.message ? error.message : String(error))
    }
  }
  speech.stopSpeaking()
  await sleep(400)
}

function expect (condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

// Registers the listener first and returns a promise for the next matching event.
function waitFor (name, ms, filter) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      speech.removeEventListener(name, handler)
      reject(new Error('no "' + name + '" event in ' + ms + ' ms'))
    }, ms)
    function handler (e) {
      if (filter && !filter(e)) {
        return
      }
      clearTimeout(timer)
      speech.removeEventListener(name, handler)
      resolve(e)
    }
    speech.addEventListener(name, handler)
  })
}

// Collects every event of a kind for a while.
function collect (name, ms) {
  const events = []
  const handler = (e) => events.push(e)
  speech.addEventListener(name, handler)
  return sleep(ms).then(() => {
    speech.removeEventListener(name, handler)
    return events
  })
}

// Speaks and waits for the successful completed event.
async function speak (options, ms) {
  const done = waitFor('completed', ms || 20000)
  speech.startSpeaking(Object.assign({ text: 'Probando.', voice: VOICE }, options))
  const e = await done
  expect(e.success === true, 'completed with success ' + e.success + ' code ' + e.code + ' ' + e.message)
  return e
}

async function main () {
  console.log('Utterance TTS API test | ' + Ti.Platform.osname + ' ' + Ti.Platform.version)

  await check('isSupported', () => {
    expect(speech.isSupported() === true, 'text to speech is not supported')
  })

  await check('constants', () => {
    expect(speech.ERROR_SYNTHESIS === 'synthesis', 'ERROR_SYNTHESIS is ' + speech.ERROR_SYNTHESIS)
    expect(speech.ERROR_NOT_READY === 'not_ready', 'ERROR_NOT_READY is ' + speech.ERROR_NOT_READY)
    expect(speech.ERROR_TEXT_TOO_LONG === 'text_too_long', 'ERROR_TEXT_TOO_LONG is ' + speech.ERROR_TEXT_TOO_LONG)
    expect(speech.ERROR_INVALID_ARGUMENT === 'invalid_argument', 'ERROR_INVALID_ARGUMENT is ' + speech.ERROR_INVALID_ARGUMENT)
    expect(speech.SPEECH_BOUNDARY_IMMEDIATE === 0 && speech.SPEECH_BOUNDARY_WORD === 1,
      'SPEECH_BOUNDARY_* are ' + speech.SPEECH_BOUNDARY_IMMEDIATE + ' and ' + speech.SPEECH_BOUNDARY_WORD)
  })

  await check('getMaxTextLength', () => {
    const max = speech.getMaxTextLength()
    expect(IOS ? max === 0 : max > 0, 'returned ' + max)
    return String(max)
  })

  await check('getState idle', () => {
    const state = speech.getState()
    expect(state.speaking === false && state.paused === false && state.queued === 0, JSON.stringify(state))
    expect(speech.isPaused() === false, 'isPaused is not false')
  })

  await check('startSpeaking started and completed', async () => {
    const started = waitFor('started', 10000)
    const e = await speak({ text: 'Esta es una prueba corta.' })
    await started
    expect(typeof e.utteranceId === 'string' && e.utteranceId.length > 0, 'completed has no utteranceId')
  })

  await check('events do not fire inside the call', async () => {
    let inside = true
    let firedInside = false
    const handler = () => { firedInside = firedInside || inside }
    speech.addEventListener('completed', handler)
    const failed = waitFor('completed', 10000)
    speech.startSpeaking({ text: '', voice: VOICE })
    inside = false
    await failed
    speech.removeEventListener('completed', handler)
    expect(firedInside === false, 'the completed event fired inside the call')
  })

  await check('wordstart', async () => {
    const text = 'Uno dos tres cuatro cinco'
    const events = collect('wordstart', 6000)
    await speak({ text })
    const words = await events
    if (words.length === 0) {
      skip('the engine reported no word positions')
    }
    let last = -1
    for (const w of words) {
      expect(text.substring(w.start, w.end) === w.word, 'word "' + w.word + '" is not at ' + w.start + '-' + w.end)
      expect(w.start > last, 'positions do not increase')
      expect(typeof w.utteranceId === 'string', 'no utteranceId')
      last = w.start
    }
    return words.length + ' words'
  })

  for (const option of [['volume', { volume: 0.5 }], ['pan', { pan: 0 }], ['pitch', { pitch: 1.1 }], ['pitchMultiplier', { pitchMultiplier: 1.1 }]]) {
    await check('option ' + option[0], async () => {
      await speak(option[1])
      return 'accepted; loudness, balance and pitch need listening'
    })
  }

  await check('option audioUsage', async () => {
    await speak({ audioUsage: 'assistant' })
  })

  await check('option audioFocus', async () => {
    if (IOS) {
      skip('Android only')
    }
    await speak({ audioFocus: true })
  })

  await check('playSilence', async () => {
    const t0 = Date.now()
    speech.playSilence(1200)
    // iOS fires started for the silence too; the speech is the one with text
    const started = waitFor('started', 10000, (e) => e.text && e.text.indexOf('Después') !== -1)
    speech.startSpeaking({ text: 'Después del silencio.', voice: VOICE, queue: true })
    await started
    const waited = Date.now() - t0
    expect(waited >= 1000, 'the speech started after ' + waited + ' ms')
    await waitFor('completed', 10000)
    return 'speech began after ' + waited + ' ms'
  })

  await check('queue: one completed for two utterances', async () => {
    const completed = collect('completed', 9000)
    const started = collect('started', 9000)
    speech.startSpeaking({ text: 'Primera frase.', voice: VOICE })
    speech.startSpeaking({ text: 'Segunda frase.', voice: VOICE, queue: true })
    const [c, s] = await Promise.all([completed, started])
    expect(c.length === 1, c.length + ' completed events')
    expect(s.length === 2, s.length + ' started events')
    expect(c[0].text.indexOf('Segunda') !== -1, 'the completed event is about "' + c[0].text + '"')
  })

  await check('cut off without queue', async () => {
    const completed = collect('completed', 7000)
    speech.startSpeaking({ text: 'Esta es una frase larga que no debe terminar de decirse, porque otra la reemplaza.', voice: VOICE })
    await sleep(600)
    speech.startSpeaking({ text: 'Reemplazo.', voice: VOICE })
    const c = await completed
    const ok = c.filter((e) => e.success)
    expect(ok.length === 1 && ok[0].text.indexOf('Reemplazo') !== -1, 'completed events: ' + JSON.stringify(c.map((e) => [e.success, e.text])))
  })

  await check('getState while speaking', async () => {
    speech.startSpeaking({ text: 'Una frase para ver el estado.', voice: VOICE })
    speech.startSpeaking({ text: 'La segunda espera su turno.', voice: VOICE, queue: true })
    await waitFor('started', 10000)
    const state = speech.getState()
    expect(state.speaking === true && state.queued === 1, JSON.stringify(state))
    expect(speech.isSpeaking() === true, 'isSpeaking is not true')
  })

  await check('pauseSpeaking and continueSpeaking', async () => {
    const text = 'Esta frase se detiene dos segundos y luego sigue hasta el final.'
    const words = []
    const onWord = (e) => words.push({ word: e.word, at: Date.now() })
    speech.addEventListener('wordstart', onWord)
    try {
      speech.startSpeaking({ text, voice: VOICE })
      await waitFor('started', 10000)
      await sleep(900)
      const paused = waitFor('paused', 5000)
      speech.pauseSpeaking()
      const p = await paused
      if (p.success === false) {
        skip('paused with success false and code ' + p.code)
      }
      expect(speech.isPaused() === true, 'isPaused is not true')
      const pausedAt = Date.now()
      await sleep(2000) // the pause lasts: listen for the silence
      const during = words.filter((w) => w.at > pausedAt + 300)
      expect(during.length === 0, during.length + ' words were spoken during the pause: ' + during.map((w) => w.word).join(' '))
      const before = words.length
      const resumed = waitFor('continued', 5000)
      speech.continueSpeaking()
      await resumed
      await waitFor('completed', 15000)
      if (words.length === 0) {
        return 'paused and resumed; the engine reports no word positions, so the pause itself needs listening'
      }
      expect(words[words.length - 1].word.indexOf('final') !== -1, 'the last word was "' + words[words.length - 1].word + '"')
      return before + ' words before the pause, ' + (words.length - before) + ' after'
    } finally {
      speech.removeEventListener('wordstart', onWord)
    }
  })

  await check('stopSpeaking fires stopped', async () => {
    speech.startSpeaking({ text: 'Esta frase se corta antes de terminar.', voice: VOICE })
    await waitFor('started', 10000)
    const stopped = waitFor('stopped', 5000)
    speech.stopSpeaking()
    await stopped
    expect(speech.getState().speaking === false, 'getState still says speaking')
  })

  await check('failure has a code and an error event', async () => {
    const completed = waitFor('completed', 5000)
    const error = waitFor('error', 5000)
    speech.startSpeaking({ text: '', voice: VOICE })
    const c = await completed
    const e = await error
    expect(c.success === false && c.code === 'invalid_argument', 'completed: ' + JSON.stringify([c.success, c.code]))
    expect(typeof e.error === 'string' && e.error.length > 0, 'the error event has no error field')
    expect(e.code === 'invalid_argument', 'the error event code is ' + e.code)
  })

  // synthesizeToFile ----------------------------------------------------------------------

  const wavPath = Ti.Filesystem.applicationDataDirectory + 'tts_api_test.wav'
  await check('synthesizeToFile writes a WAV file', async () => {
    const done = waitFor('synthesized', 30000)
    speech.synthesizeToFile({ text: 'Este audio se guarda en un archivo.', voice: VOICE, file: wavPath })
    const e = await done
    expect(e.success === true, 'success false, code ' + e.code + ' ' + e.message)
    expect(e.format === 'wav' && e.duration > 0.5 && e.sampleRate > 0, JSON.stringify([e.format, e.duration, e.sampleRate]))
    const file = Ti.Filesystem.getFile(fileUrl(e.file))
    expect(file.exists(), 'the file does not exist: ' + e.file)
    const bytes = file.size
    const channels = e.channels || 1
    const expected = e.duration * e.sampleRate * channels * 2
    expect(bytes >= expected && bytes <= expected + 8192, 'file size ' + bytes + ' does not match ' + Math.round(expected) + ' bytes of audio')
    const stream = Ti.Filesystem.openStream(Ti.Filesystem.MODE_READ, fileUrl(e.file))
    const head = Ti.createBuffer({ length: 12 })
    const read = stream.read(head, 0, 12)
    stream.close()
    const riff = read === 12 && head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70 &&
      head[8] === 87 && head[9] === 65 && head[10] === 86 && head[11] === 69
    expect(riff, 'the file does not start with RIFF....WAVE (read ' + read + ' bytes)')
    return e.duration.toFixed(2) + ' s, ' + e.sampleRate + ' Hz, ' + bytes + ' bytes'
  })

  await check('synthesizeToFile without file', async () => {
    const done = waitFor('synthesized', 30000)
    speech.synthesizeToFile({ text: 'Sin ruta de destino.', voice: VOICE })
    const e = await done
    expect(e.success === true && Ti.Filesystem.getFile(fileUrl(e.file)).exists(), 'no file at ' + e.file)
  })

  await check('synthesizeToFile with a bad file', async () => {
    if (!IOS) {
      skip('iOS rejects a file that does not end in .wav; Android has no such rule')
    }
    const done = waitFor('synthesized', 10000)
    speech.synthesizeToFile({ text: 'Mala ruta.', voice: VOICE, file: Ti.Filesystem.applicationDataDirectory + 'x.mp3' })
    const e = await done
    expect(e.success === false && e.code === 'invalid_argument', JSON.stringify([e.success, e.code]))
  })

  // voices --------------------------------------------------------------------------------

  let voices = []
  await check('requestVoices', async () => {
    const done = waitFor('voices', 15000)
    speech.requestVoices()
    voices = (await done).voices
    expect(voices.length > 0, 'no voices')
    for (const v of voices) {
      expect(v.id && v.name !== undefined && v.language && v.quality && typeof v.networkRequired === 'boolean',
        'voice without a field: ' + JSON.stringify(v))
    }
    if (IOS) {
      expect(['male', 'female', 'unspecified'].indexOf(voices[0].gender) !== -1, 'gender is ' + voices[0].gender)
      expect(typeof voices[0].novelty === 'boolean' && typeof voices[0].personal === 'boolean', 'no novelty or personal')
    } else {
      expect(typeof voices[0].installed === 'boolean' && voices[0].latency, 'no installed or latency')
    }
    return voices.length + ' voices'
  })

  const spanish = voices.find((v) => String(v.language).toLowerCase().indexOf('es') === 0) || voices[0]
  await check('option voiceId', async () => {
    if (!spanish) {
      skip('no voices')
    }
    await speak({ voiceId: spanish.id })
    return spanish.name
  })

  await check('option bestVoice', async () => {
    await speak({ bestVoice: true })
  })

  // iOS only ------------------------------------------------------------------------------

  await check('ssml', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    const done = waitFor('completed', 15000)
    speech.startSpeaking({ ssml: true, voice: VOICE, text: '<speak>Hola<break time="400ms"/>mundo</speak>' })
    const e = await done
    if (IOS_VERSION < 16) {
      expect(e.success === false && e.code === 'unsupported', 'iOS ' + IOS_VERSION + ' answered ' + JSON.stringify([e.success, e.code]))
    } else {
      expect(e.success === true, 'code ' + e.code + ' ' + e.message)
    }
  })

  await check('pronunciations', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    await speak({ text: 'tomato', voice: 'en-US', pronunciations: [{ start: 0, end: 6, ipa: 'təˈmɑːtoʊ' }] })
    return 'accepted; the sound needs listening'
  })

  await check('marker', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    if (IOS_VERSION < 17) {
      skip('needs iOS 17')
    }
    const markers = collect('marker', 6000)
    await speak({ text: 'Uno dos tres.' })
    const list = await markers
    expect(list.length > 0, 'no marker events')
    expect(list.every((m) => typeof m.kind === 'string' && typeof m.start === 'number' && typeof m.end === 'number'), JSON.stringify(list[0]))
    return list.length + ' markers, kinds ' + Array.from(new Set(list.map((m) => m.kind))).join(',')
  })

  await check('synthesizeToFile markers', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    if (IOS_VERSION < 16) {
      skip('needs iOS 16')
    }
    const done = waitFor('synthesized', 30000)
    speech.synthesizeToFile({ text: 'Uno dos tres.', voice: VOICE, markers: true, file: Ti.Filesystem.applicationDataDirectory + 'tts_api_markers.wav' })
    const e = await done
    expect(e.success === true && Array.isArray(e.markers) && e.markers.length > 0, 'markers: ' + JSON.stringify(e.markers))
    expect(typeof e.markers[0].time === 'number', 'marker without time')
    return e.markers.length + ' markers'
  })

  await check('getPersonalVoiceStatus', () => {
    if (!IOS) {
      skip('iOS only')
    }
    const status = speech.getPersonalVoiceStatus()
    expect(['not_determined', 'denied', 'unsupported', 'authorized'].indexOf(status) !== -1, 'status is ' + status)
    return status
  })

  await check('requestPersonalVoiceAuthorization', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    if (!ASK_PERSONAL_VOICE) {
      skip('set ASK_PERSONAL_VOICE to true; it can open a system prompt')
    }
    const done = waitFor('personalvoice', 60000)
    speech.requestPersonalVoiceAuthorization()
    const e = await done
    expect(typeof e.status === 'string', JSON.stringify(e))
    return e.status
  })

  await check('warmUp', () => {
    if (!IOS) {
      skip('iOS only')
    }
    speech.warmUp()
  })

  await check('speakerWakeDelay', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    const route = JSON.stringify(Ti.Media.currentRoute)
    if (route.indexOf('Speaker') === -1) {
      skip('the output is not the built-in speaker: ' + route)
    }
    const latency = async (options) => {
      await sleep(3500) // longer than the idle limit
      const started = waitFor('started', 10000)
      const t0 = Date.now()
      speech.startSpeaking(Object.assign({ text: 'Uno.', voice: VOICE }, options))
      await started
      const ms = Date.now() - t0
      await waitFor('completed', 10000)
      return ms
    }
    const withWake = await latency({})
    const without = await latency({ speakerWakeDelay: 0 })
    expect(withWake - without >= 100, 'default ' + withWake + ' ms, speakerWakeDelay 0 ' + without + ' ms')
    return 'default ' + withWake + ' ms, speakerWakeDelay 0 ' + without + ' ms'
  })

  await check('addSpeech and addEarcon answer unsupported', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    const first = waitFor('registered', 5000)
    speech.addSpeech('hola', 'x')
    const a = await first
    const second = waitFor('registered', 5000)
    speech.addEarcon('ding', 'x')
    const b = await second
    expect(a.success === false && a.code === 'unsupported' && a.kind === 'speech', JSON.stringify(a))
    expect(b.success === false && b.code === 'unsupported' && b.kind === 'earcon', JSON.stringify(b))
  })

  await check('playEarcon answers unsupported', async () => {
    if (!IOS) {
      skip('iOS only')
    }
    const done = waitFor('completed', 5000)
    speech.playEarcon('ding')
    const e = await done
    expect(e.success === false && e.code === 'unsupported', JSON.stringify([e.success, e.code]))
  })

  // Android only --------------------------------------------------------------------------

  await check('addEarcon with a file that does not exist', async () => {
    if (IOS) {
      skip('Android only')
    }
    const done = waitFor('registered', 5000)
    speech.addEarcon('ding', 'no_such_file')
    const e = await done
    expect(e.success === false && e.code === 'invalid_file', JSON.stringify([e.success, e.code]))
  })

  await check('addEarcon with a path is refused', async () => {
    if (IOS) {
      skip('Android only')
    }
    const done = waitFor('registered', 5000)
    speech.addEarcon('ding', Ti.Filesystem.applicationDataDirectory + 'ding.wav')
    const e = await done
    expect(e.success === false && e.code === 'invalid_argument', JSON.stringify([e.success, e.code]))
  })

  await check('addEarcon and playEarcon', async () => {
    if (IOS) {
      skip('Android only')
    }
    if (!EARCON_RESOURCE) {
      skip('set EARCON_RESOURCE to a file in platform/android/res/raw')
    }
    const registered = waitFor('registered', 5000)
    speech.addEarcon('ding', EARCON_RESOURCE)
    const r = await registered
    expect(r.success === true, JSON.stringify(r))
    speech.playEarcon('ding')
    await sleep(1500)
    return 'registered; the sound needs listening'
  })

  await check('playEarcon with a name nobody registered', async () => {
    if (IOS) {
      skip('Android only')
    }
    const done = waitFor('error', 5000)
    speech.playEarcon('never_registered')
    await done
  })

  await check('text over the limit with splitLongText false', async () => {
    if (IOS) {
      skip('Android only')
    }
    const text = 'a'.repeat(speech.getMaxTextLength() + 100)
    const done = waitFor('completed', 5000)
    speech.startSpeaking({ text, voice: VOICE, splitLongText: false })
    const e = await done
    expect(e.success === false && e.code === 'text_too_long', JSON.stringify([e.success, e.code]))
  })

  await check('long text is split', async () => {
    if (IOS) {
      skip('Android only')
    }
    if (!RUN_LONG_TEXT) {
      skip('set RUN_LONG_TEXT to true; it speaks for several minutes')
    }
    const text = 'Una frase corta para llenar el texto largo. '.repeat(100)
    expect(text.length > speech.getMaxTextLength(), 'the text is not long enough')
    const completed = collect('completed', 600000)
    speech.startSpeaking({ text, voice: VOICE })
    const c = await completed
    expect(c.length === 1 && c[0].success === true, JSON.stringify(c.map((e) => [e.success, e.code])))
  })

  console.log('SUMMARY PASS ' + counts.PASS + ' FAIL ' + counts.FAIL + ' SKIP ' + counts.SKIP)
}

main().catch((error) => {
  console.log('FAIL test run | ' + error)
})
