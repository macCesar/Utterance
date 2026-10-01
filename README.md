# Utterance v4.2
### Text-to-speech and speech-to-text for Titanium

[![Release](https://img.shields.io/github/v/release/macCesar/Utterance)](https://github.com/macCesar/Utterance/releases) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey.svg)](https://github.com/macCesar/Utterance) [![Titanium SDK](https://img.shields.io/badge/Titanium%20SDK-13.0.0%2B-red.svg)](https://github.com/tidev/titanium-sdk)

Utterance speaks text and transcribes speech in Titanium apps on iOS and Android, with the same JavaScript API on both. Text-to-speech uses `AVSpeechSynthesizer` and `TextToSpeech`. Speech-to-text uses `SFSpeechRecognizer` and `SpeechRecognizer`.

## What you get

### Text to speech

- Speak with the voice, language, rate, pitch and volume you choose. The rate constants sound equally fast on both platforms.
- List the installed voices and let the module pick the best one for a language.
- Get each word as it is spoken, to highlight the text in step with the voice.
- Queue speeches, put silences between them, pause, resume or cut off the one that is speaking.
- Render a speech to a WAV file instead of playing it.
- Handle failures with the same error codes on both platforms.
- iOS adds SSML, IPA pronunciations, synthesizer markers and Personal Voice. Android adds audio focus, stereo pan, prerecorded audio and automatic splitting of long texts.

### Speech to text

- Live partial text, a level meter and a transcript when the person stops talking.
- Transcribe recorded audio files, or audio your own code sends.
- On-device recognition, punctuation, alternatives and expected words, on the platforms that support them.
- The same options, events and error codes on both platforms.

Version 4.2 is the text-to-speech release. See the [changelog](CHANGELOG.md) for everything that changed and the [migration guide](documentation/MIGRATION_GUIDE.md) if you upgrade from an earlier version.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Text to speech in practice](#text-to-speech-in-practice)
- [Demo app](#demo-app)
- [API reference](#api-reference)
- [Events](#events)
- [Errors](#errors)
- [Examples](#examples)
- [Differences between platforms](#differences-between-platforms)
- [Troubleshooting](#troubleshooting)
- [Migrating](#migrating)
- [Permissions](#permissions)

## Requirements

| Platform     | Minimum        | Recommended     |
| ------------ | -------------- | --------------- |
| Titanium SDK | 13.0.0+        | Latest          |
| iOS          | 15.0+          | Latest          |
| Android      | 7.0+ (API 24+) | 10.0+ (API 29+) |
| Xcode        | 13.0+          | Latest          |
| Android SDK  | Target API 33+ | Latest          |

## Installation

### Download the compiled module
- [Releases](https://github.com/macCesar/Utterance/releases): each release has the iOS and Android zips attached
- [iOS dist folder](https://github.com/macCesar/Utterance/tree/main/ios/dist)
- [Android dist folder](https://github.com/macCesar/Utterance/tree/main/android/dist)

### Setup
1. Download the latest release for your platforms.
2. Install the module in your Titanium project.
3. Add it to `tiapp.xml`:

```xml
<modules>
  <module platform="iphone">bencoding.utterance</module>
  <module platform="android">bencoding.utterance</module>
</modules>
```

4. Add permissions to `tiapp.xml`. Text-to-speech needs none; speech-to-text needs the microphone:
```xml
<ios>
  <plist>
    <dict>
      <!-- Required for Speech-to-Text (STT) -->
      <key>NSMicrophoneUsageDescription</key>
      <string>This app uses voice recognition to convert speech to text.</string>

      <key>NSSpeechRecognitionUsageDescription</key>
      <string>This app uses speech recognition for voice commands.</string>
    </dict>
  </plist>
</ios>

<android xmlns:android="http://schemas.android.com/apk/res/android">
  <manifest>
    <!-- Required for Speech-to-Text (STT) -->
    <uses-permission android:name="android.permission.RECORD_AUDIO"/>
    <uses-permission android:name="android.permission.INTERNET"/>

    <!-- Optional: For better speech recognition performance -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
  </manifest>
</android>
```

5. Require the module:

```javascript
const utterance = require('bencoding.utterance');
```


## Quick start

### Text-to-speech (iOS and Android)

```javascript
const utterance = require('bencoding.utterance');

// One proxy for the whole app, kept in a constant (see Troubleshooting)
const speech = utterance.createSpeech();

speech.addEventListener('completed', (e) => {
  if (!e.success) {
    console.warn(`The speech failed: ${e.code}, ${e.message}`);
  }
});

if (speech.isSupported()) {
  speech.startSpeaking({
    voice: 'en-US',
    rate: speech.DEFAULT_SPEECH_RATE,
    text: 'Hello! This is Utterance.'
  });
}
```

`voice` is a language code. `rate` takes a constant that sounds equally fast on both platforms: `VERY_SLOW_SPEECH_RATE`, `SLOW_SPEECH_RATE`, `DEFAULT_SPEECH_RATE`, `FAST_SPEECH_RATE` or `VERY_FAST_SPEECH_RATE`. `completed` fires when the speech ends and also when it fails, so one listener covers both. Every call cuts off what is speaking unless it passes `queue: true`.

### Speech-to-text

`startSpeechToText()` listens from the microphone inside the app on both platforms. There is no system dialog, so the app shows its own indicator, such as a button that changes while it listens. `stopRecording()` ends the audio and `completed` delivers the transcript. `partial` delivers the text while the person is still talking, and `cancelRecording()` drops the session.

```javascript
const utterance = require('bencoding.utterance');
const speechToText = utterance.createSpeechToText();

speechToText.addEventListener('partial', (event) => {
  console.log("So far:", event.text);
});

speechToText.addEventListener('completed', (event) => {
  if (!event.success) {
    console.warn(event.code, event.message);
    return;
  }
  console.log(event.text, event.confidence);
});

function listen() {
  speechToText.startSpeechToText({ language: "es-MX" }); // language is optional
}

if (!speechToText.isSupported()) {
  console.warn("Speech-to-Text not supported on this device");
} else if (speechToText.getPermissionStatus().granted) {
  listen();
} else {
  speechToText.addEventListener('permissions', (event) => event.granted && listen(), { once: true });
  speechToText.requestPermissions();
}

// Later, when the user is done speaking:
speechToText.stopRecording();
```

The default language is the system language on iOS (when `SFSpeechRecognizer` supports it, otherwise `en-US`) and the device language on Android. The session ends by itself after a pause. `silenceTimeout` (seconds of silence after speech) and `noSpeechTimeout` (seconds to wait for speech) adjust it on both platforms, and 0 turns either one off. Without them, iOS uses 2 and 6 seconds, and Android leaves the choice to the recognizer.

The same options work on both platforms where the platform has the feature: `taskHint`, `contextualStrings`, `onDevice`, `punctuation`, `segments` and `alternatives`. `transcribeFile()` and `appendAudio()` transcribe audio that does not come from the microphone. Failures carry a stable `code`. The [speech-to-text guide](documentation/speech_to_text.md) has every option, the error codes and what was tried on each platform.


## Text to speech in practice

Each snippet runs as it is on both platforms. The [text-to-speech guide](documentation/text_to_speech.md) has the options, the edge cases and more recipes.

### Choose a voice and remember it

`requestVoices()` answers in a `voices` event with the same shape on both platforms. Keep the `id` of the voice the person picks and pass it as `voiceId`. If that voice is uninstalled later, `bestVoice` makes the best installed voice for the language speak instead:

```javascript
speech.addEventListener('voices', ({ voices }) => {
  const spanish = voices.filter((voice) => voice.language.toLowerCase().startsWith('es'));
  console.log(spanish.map((voice) => `${voice.name || voice.id} (${voice.language}, ${voice.quality})`));
});
speech.requestVoices();

speech.startSpeaking({
  voice: 'es-MX',
  bestVoice: true,
  text: 'El Gallo',
  voiceId: Ti.App.Properties.getString('voiceId', '')
});
```

On iOS `voice` takes only language codes, so pick a particular voice with `voiceId`.

### Highlight each word as it is spoken

`wordstart` carries the position of the word in the text you passed:

```javascript
const TEXT = 'Utterance reads this paragraph aloud, and each word lights up as it is spoken.';
const label = Ti.UI.createLabel({ text: TEXT });

speech.addEventListener('wordstart', (e) => {
  label.attributedString = Ti.UI.createAttributedString({
    text: TEXT,
    attributes: [{
      value: '#FFE08A',
      range: [e.start, e.end - e.start],
      type: Ti.UI.ATTRIBUTE_BACKGROUND_COLOR
    }]
  });
});

speech.startSpeaking({ text: TEXT, voice: 'en-US' });
```

### Save a speech to a file

```javascript
speech.addEventListener('synthesized', (e) => {
  if (e.success) {
    console.log(`Saved ${e.duration.toFixed(1)} s at ${e.sampleRate} Hz: ${e.file}`);
  } else {
    console.warn(e.code, e.message);
  }
});

speech.synthesizeToFile({
  voice: 'en-US',
  text: 'This sentence goes to a file.',
  file: Ti.Filesystem.applicationDataDirectory + 'sentence.wav'
});
```

### Queue speeches and add a pause

```javascript
speech.startSpeaking({ text: 'Attention, please.', voice: 'en-US' });
speech.playSilence(500, { queue: true });
speech.startSpeaking({ text: 'Atención, por favor.', voice: 'es-MX', queue: true });

speech.addEventListener('completed', () => {
  // Fires once, when the whole queue has been spoken
});
```

### Pause and resume

```javascript
speech.pauseSpeaking();
speech.continueSpeaking();
```

iOS pauses in place. Android has no pause, so the module stops the speech and resumes from the word where it stopped, which repeats a word that was cut in half. That needs an engine that reports word positions; without one, `paused` carries `success: false`.

### Handle failures

```javascript
let lastOptions = null;

function say(options) {
  lastOptions = options;
  speech.startSpeaking(options);
}

speech.addEventListener('completed', (e) => {
  if (e.success) {
    return;
  }
  if (e.code === speech.ERROR_NOT_READY) {
    // Android: the engine is still connecting. One retry covers it
    setTimeout(() => speech.startSpeaking(lastOptions), 1000);
  } else {
    // Any other code fails again with the same input: show the text instead
    showTextOnScreen(lastOptions.text);
  }
});
```

The [guide](documentation/text_to_speech.md#errors) lists every code and a recovery for each.

### SSML on iOS

```javascript
speech.startSpeaking({
  ssml: true,
  text: '<speak>Hello<break time="500ms"/>world</speak>'
});
```

## Demo app

`ios/example/app.js` and `android/example/app.js` (the two files are identical) are one demo app with two tabs. Speak reads a text aloud with the voice, language, speed and volume you pick. Queue adds the text after what is speaking, Word highlight marks each word as it is spoken, and Save to file renders the speech to a WAV file and plays it back. Listen shows the speech-to-text API: live text while you talk, a command acted on as soon as it is heard, a level indicator, the languages that work without a connection, and the options for punctuation, on-device recognition, the search hint and expected words.

To run it, copy `app.js` and `semantic.colors.json` (in the same folder) to the `Resources` folder of a Titanium app that includes the module. The comment at the top of `app.js` lists what `tiapp.xml` needs. The colors follow the system's light or dark mode.

|         | Speak                                                                  | Listen                                                                  | Listen, scrolled                                                                |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| iOS     | <img src="documentation/images/example-ios-speak.png" width="200">     | <img src="documentation/images/example-ios-listen.png" width="200">     | <img src="documentation/images/example-ios-listen-options.png" width="200">     |
| Android | <img src="documentation/images/example-android-speak.png" width="200"> | <img src="documentation/images/example-android-listen.png" width="200"> | <img src="documentation/images/example-android-listen-options.png" width="200"> |

Captured on an iPhone 18 Pro simulator (iOS 27) and a Pixel 8 emulator (Android 16), in English and light mode.

## API reference

### Text-to-speech methods

| Method                                                                                                                                                               | Platform      | Description                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `startSpeaking(options)`                                                                                                                                             | iOS, Android  | Start speaking. The options are in the [guide](documentation/text_to_speech.md#speaking-options)  |
| `pauseSpeaking(boundary?)`                                                                                                                                           | iOS, Android* | Pause the current speech. `boundary` (`SPEECH_BOUNDARY_WORD`) is iOS only                         |
| `continueSpeaking()`                                                                                                                                                 | iOS, Android* | Resume paused speech                                                                              |
| `stopSpeaking(boundary?)`                                                                                                                                            | iOS, Android  | Stop the current speech, also when it is paused                                                   |
| `cancelSpeaking()`                                                                                                                                                   | Android       | Cancel the speech: `canceled` fires                                                               |
| `playSilence(ms, options?)`                                                                                                                                          | iOS, Android  | Put a pause in the queue (v4.2)                                                                   |
| `synthesizeToFile(options)`                                                                                                                                          | iOS, Android  | Render a speech to a WAV file; `synthesized` answers (v4.2)                                       |
| `getState()`                                                                                                                                                         | iOS, Android  | `{ speaking, paused, queued }` (v4.2)                                                             |
| `isPaused()`                                                                                                                                                         | iOS, Android  | Whether the speech is paused (v4.2)                                                               |
| `getMaxTextLength()`                                                                                                                                                 | iOS, Android  | 4000 on Android, 0 (no limit) on iOS (v4.2)                                                       |
| `isSpeaking`, `isSpeaking()`                                                                                                                                         | iOS, Android  | Whether speech is in progress. The property and the method return the same value                  |
| `isSupported()`                                                                                                                                                      | iOS, Android  | Whether the platform supports text-to-speech                                                      |
| `requestVoices(options?)`                                                                                                                                            | iOS, Android  | Installed voices, delivered in a `voices` event (v3.2)                                            |
| `getModernVoices()`, `getModernLanguages()`                                                                                                                          | iOS, Android  | Voice and language data from the engine. The shape differs by platform; prefer `requestVoices()`  |
| `addSpeech(text, source)`, `addEarcon(name, source)`                                                                                                                 | Android       | Register prerecorded audio from `res/raw`; `registered` answers. iOS answers `unsupported` (v4.2) |
| `playEarcon(name, options?)`                                                                                                                                         | Android       | Play a registered earcon. iOS answers `unsupported` (v4.2)                                        |
| `warmUp()`                                                                                                                                                           | iOS           | Start the speaker with a silent utterance; it stays awake about two seconds (v4.2)                |
| `requestPersonalVoiceAuthorization()`, `getPersonalVoiceStatus()`                                                                                                    | iOS 17        | Personal Voice permission; `personalvoice` answers (v4.2)                                         |
| `getEngineInfo()`, `getDiagnostics()`, `setEngine()`, `isLanguageAvailable()`, `isNetworkRequired()`, `preloadVoiceData()`, `getEstimatedDuration()`, `isTTSReady()` | Android       | Read or change the speech engine                                                                  |

*\*Android has no pause: it stops the speech and resumes from the last word position, which needs an engine that reports word positions. Without them the events carry `success: false`.*

*On Android, `getModernVoices()`, `getModernLanguages()`, `isLanguageAvailable()`, `isNetworkRequired()`, `getEngineInfo()` and `getDiagnostics()` return data from the engine, so they wait for it while it connects. Call them after the `initialized` event, not from a click handler.*

The constants are `VERY_SLOW_SPEECH_RATE`, `SLOW_SPEECH_RATE`, `DEFAULT_SPEECH_RATE`, `FAST_SPEECH_RATE`, `VERY_FAST_SPEECH_RATE`, the four `MATH_*` variants, `MIN_SPEECH_RATE`, `MAX_SPEECH_RATE`, `SPEECH_BOUNDARY_IMMEDIATE`, `SPEECH_BOUNDARY_WORD` and the `ERROR_*` codes.

| Constant                | iOS  | Android |
| ----------------------- | ---- | ------- |
| `VERY_SLOW_SPEECH_RATE` | 0.25 | 0.4     |
| `SLOW_SPEECH_RATE`      | 0.35 | 0.6     |
| `DEFAULT_SPEECH_RATE`   | 0.5  | 1.0     |
| `FAST_SPEECH_RATE`      | 0.55 | 1.3     |
| `VERY_FAST_SPEECH_RATE` | 0.65 | 1.6     |

### Speech-to-text methods

| Method                                | Platform         | Description                                                                       |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `isSupported()`                       | iOS, Android     | Whether the platform supports speech recognition                                  |
| `isAvailable(language?)`              | iOS, Android     | Whether recognition can run now (Android ignores the language)                    |
| `supportsOnDevice(language?)`         | iOS, Android     | Whether it can run without the network (Android ignores the language)             |
| `startSpeechToText(options?)`         | iOS, Android     | Start listening. See the [guide](documentation/speech_to_text.md) for the options |
| `stopRecording()`                     | iOS, Android     | Stop listening and deliver the transcript in `completed`                          |
| `cancelRecording()`                   | iOS, Android     | Drop the session: `canceled` fires and `completed` does not                       |
| `transcribeFile(file, options?)`      | iOS, Android 13+ | Transcribe a recorded file                                                        |
| `appendAudio(data)`                   | iOS, Android 13+ | Send PCM audio to a session started with `audioSource: 'buffer'`                  |
| `getNativeAudioFormat()`              | iOS, Android     | The audio format the recognizer prefers                                           |
| `getPermissionStatus()`               | iOS, Android     | The microphone (and on iOS speech recognition) permission state                   |
| `requestPermissions()`                | iOS, Android     | Ask for the permissions; the `permissions` event answers                          |
| `requestSupportedLanguages()`         | iOS, Android     | The `languages` event lists them and which ones work without the network          |
| `downloadLanguage({ language })`      | Android 13+      | Download an on-device model; `download` events report it                          |
| `getState()`                          | iOS              | State of the recognition task                                                     |
| `prepareCustomLanguageModel(options)` | iOS 17+          | Prepare a custom language model; the `languagemodel` event answers                |

## Events

### Text-to-speech events

| Event           | Platform      | Description                                                                                          |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `started`       | iOS, Android  | Speech synthesis has started                                                                         |
| `completed`     | iOS, Android  | The speech ended or failed (check `success`); with `queue: true`, once the whole queue ends          |
| `wordstart`     | iOS, Android  | A word is about to be spoken: `{ start, end, word, utteranceId }` (v4.2)                             |
| `paused`        | iOS, Android* | Speech synthesis paused                                                                              |
| `continued`     | iOS, Android* | Speech synthesis resumed                                                                             |
| `stopped`       | iOS, Android  | `stopSpeaking()` stopped the speech                                                                  |
| `canceled`      | iOS, Android  | Speech synthesis canceled. iOS fires it after `stopped`                                              |
| `error`         | iOS, Android  | A failure: `{ error, message, code }`. iOS also fires `errored` (v4.2)                               |
| `voices`        | iOS, Android  | Reply to `requestVoices()`: `{ voices: [{ id, name, language, quality }] }`                          |
| `synthesized`   | iOS, Android  | Reply to `synthesizeToFile()`: `{ success, file, duration, format, sampleRate, utteranceId }` (v4.2) |
| `registered`    | iOS, Android  | Reply to `addSpeech()` and `addEarcon()`; iOS answers `unsupported` (v4.2)                           |
| `initialized`   | Android       | The speech engine finished connecting                                                                |
| `marker`        | iOS 17        | A synthesizer marker: `{ kind, start, end }` (v4.2)                                                  |
| `personalvoice` | iOS 17        | Reply to `requestPersonalVoiceAuthorization()` (v4.2)                                                |
| `voiceschanged` | iOS           | The installed voices changed (v4.2)                                                                  |

Events fire only when a listener exists at that moment, and right after the call that caused them returns, not inside it. Add your listeners before the first call.

### Speech-to-text events

| Event                      | Platform     | Description                                                                    |
| -------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `started`                  | iOS, Android | The audio is flowing and recognition has started                               |
| `partial`                  | iOS, Android | The text recognized so far: `{ text, words }`                                  |
| `speechstart`, `speechend` | iOS, Android | The speech started and ended                                                   |
| `audiolevel`               | iOS, Android | `{ level, decibels }`, with `level` from 0 to 1                                |
| `completed`                | iOS, Android | Recognition finished, or failed: check `success` and read `code` and `message` |
| `canceled`                 | iOS, Android | `cancelRecording()` dropped the session                                        |
| `permissions`              | iOS, Android | Answer to `requestPermissions()`                                               |
| `languages`                | iOS, Android | Answer to `requestSupportedLanguages()`                                        |
| `audioduration`            | iOS          | Seconds of audio processed so far                                              |
| `availability`             | iOS          | The recognizer became available or unavailable                                 |
| `languagemodel`            | iOS          | Answer to `prepareCustomLanguageModel()`                                       |
| `download`                 | Android      | Progress of `downloadLanguage()`                                               |
| `segmentresult`            | Android      | One piece of a `segmentedSession`                                              |
| `languagedetected`         | Android      | The recognizer detected the spoken language                                    |

Events fire only when a listener exists at that moment, and right after the call that caused them returns, not inside it.

`completed` on success: `{ success: true, text, confidence, words, wordCount, detectedInput, language, source }`, plus `segments`, `alternatives`, `metadata` and `voiceAnalytics` when asked for. On failure: `{ success: false, message, code, detectedInput: false, wordCount: 0, words: [] }` plus `nativeCode` (and `nativeDomain` on iOS). `words` lists the alternative transcriptions, best first, and `wordCount` counts them. `confidence` is the average of the segments of the best transcription on iOS and the recognizer's score for it on Android, which can be constant or 0 depending on the recognizer.


## Errors

A text-to-speech failure arrives in `completed` with `success: false`, a `code` and a `message`, and also in an `error` event. Decide from the `code`:

| Code                                                        | When                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `invalid_argument`                                          | The text is missing or empty, or an option has an invalid value    |
| `unsupported`                                               | The platform has no equivalent, or the iOS version is too old      |
| `not_ready`                                                 | Android: the engine has not finished starting                      |
| `text_too_long`                                             | Android: the text is over the limit and `splitLongText` is `false` |
| `synthesis`, `service_error`, `audio`, `network`, `timeout` | The engine reported the matching error                             |
| `language_unavailable`                                      | Android: the voice data for the language is not installed yet      |
| `invalid_file`                                              | The file of `synthesizeToFile()` cannot be written                 |
| `canceled`                                                  | The work was canceled before it finished                           |
| `unknown`                                                   | Anything else                                                      |

Each code has a constant on the proxy, such as `speech.ERROR_NOT_READY`. Speech-to-text has its own codes, listed in the [speech-to-text guide](documentation/speech_to_text.md#error-codes).

## Examples

### A voice assistant that listens and answers

```javascript
const utterance = require('bencoding.utterance');

// Both proxies live in constants, so JavaScript never collects them
const speech = utterance.createSpeech();
const listener = utterance.createSpeechToText();

const LANGUAGE = 'en-US';

function reply(text) {
  speech.startSpeaking({ text, voice: LANGUAGE, bestVoice: true });
}

listener.addEventListener('completed', (e) => {
  if (!e.success || !e.detectedInput) {
    reply('I did not catch that.');
    return;
  }

  const heard = e.text.toLowerCase();
  if (heard.includes('hello')) {
    reply('Hello! How can I help you?');
  } else if (heard.includes('time')) {
    reply(`It is ${new Date().toLocaleTimeString()}.`);
  } else {
    reply(`You said: ${e.text}`);
  }
});

// Call it from a button, after the microphone permission is granted (see the speech-to-text quick start)
function listen() {
  if (speech.isSpeaking()) {
    speech.stopSpeaking();
  }
  listener.startSpeechToText({ language: LANGUAGE });
}
```

### Speak in several languages

Say each phrase in its own language, one after another. The `voices` event tells which languages have a voice installed, so the app does not ask for one that is missing:

```javascript
const PHRASES = [
  { text: 'Hola, ¿cómo estás hoy?', voice: 'es-MX' },
  { text: 'Hello, how are you today?', voice: 'en-US' },
  { text: 'Bonjour, comment allez-vous aujourd’hui ?', voice: 'fr-FR' }
];

speech.addEventListener('voices', ({ voices }) => {
  const installed = new Set(voices.map((voice) => voice.language.split(/[-_]/)[0].toLowerCase()));

  PHRASES
    .filter((phrase) => installed.has(phrase.voice.split('-')[0]))
    .forEach((phrase) => speech.startSpeaking({ ...phrase, bestVoice: true, queue: true }));
});

speech.requestVoices();
```

More scripts are in [examples/](examples/): `quick_test.js` for a first run, `tts_advanced_example.js` for the 4.2 features and `stt_comprehensive_example.js` for speech to text. `tests/test_tts_api.js` checks every text-to-speech function on a device and prints one PASS, FAIL or SKIP line for each.

## Differences between platforms

The API is the same, and the platforms differ where the system does. The [guide](documentation/text_to_speech.md#differences-between-platforms) has the full table.

| Area                                                   | iOS                                                          | Android                                                |
| ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| `voice` option                                         | Language codes, or `auto` to detect the language of the text | Language codes and engine voice names                  |
| Pause                                                  | Native                                                       | Emulated: stops and repeats the word that was cut      |
| `wordstart`                                            | Always                                                       | Android 8 or later, with an engine that reports ranges |
| Long text                                              | No limit                                                     | Cut into sentences above 4000 characters               |
| `pan`, `audioFocus`, earcons                           | Not available                                                | Available                                              |
| SSML, IPA, markers, Personal Voice, `speakerWakeDelay` | Available                                                    | Not available                                          |

## Troubleshooting

| What you see                                                          | Why, and what to do                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events stop arriving after a while                                    | JavaScript collected the proxy. Keep `createSpeech()` in a constant at the top of a module, not inside a function.                                                                                                                                                                        |
| The first speech after the app opens is late                          | On iOS the speech engine needs about two seconds to start. Creating the proxy starts it with a silent speech, so create it at startup. `warmUp()` repeats that for apps that create the proxy late.                                                                                       |
| A click at the start of a speech on an iPad speaker                   | The built-in speaker powers down after about two seconds of silence and starts cold with the next sound. The module plays a short silence first when the speaker has been idle, which delays the speech by 0.3 to 0.4 seconds. `speakerWakeDelay: 0` removes the wait and the protection. |
| `voice: 'Paulina'` speaks with another voice on iOS                   | `voice` takes language codes there. Choose a voice with `voiceId`, from the `voices` event.                                                                                                                                                                                               |
| `requestVoices()` returns an empty list on Android right after launch | The engine is still connecting. Ask again after a second or two, or wait for `initialized`.                                                                                                                                                                                               |
| A long text on Android                                                | Texts over 4000 characters are cut into sentences on their own. With `splitLongText: false` the call fails with `text_too_long`.                                                                                                                                                          |
| `pauseSpeaking()` answers `unsupported` on Android                    | The speech engine does not report word positions, which the emulated pause needs.                                                                                                                                                                                                         |
| A failure shows up twice                                              | It arrives in `completed` first, with `success: false`, and then in `error`. Listening to `completed` alone is enough.                                                                                                                                                                    |

## Migrating

The [migration guide](documentation/MIGRATION_GUIDE.md) lists what changes in each version. The two points that matter when you come from 3.x or 2.x:

- Since v3.0, `isSpeaking` works as a property and as a method on both platforms, and `isSupported()` is a method on both. Remove the platform checks around them.
- Replace the rates you tuned per platform with the rate constants, which sound the same on both.

From 4.1, one thing changes on iOS: `startSpeaking()` without `queue: true` cuts off what is speaking. Before, the call was ignored.

## Permissions

Text-to-speech needs no permissions. Speech-to-text needs the microphone permissions shown under [Setup](#setup). `requestPermissions()` asks for them at runtime on both platforms, as shown under [Speech-to-text](#speech-to-text); on Android the permission must be granted before the first `startSpeechToText()`.

## License

Utterance is available under the Apache 2.0 license.

```
Copyright 2024 Benjamin Bahrenburg

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Contributing

See the [contributing guidelines](CONTRIBUTING.md).

## Support

- [Migration guide](documentation/MIGRATION_GUIDE.md)
- [Examples](examples/)
- [GitHub issues](https://github.com/macCesar/Utterance/issues)
