# Utterance v4.1: Speech to Text
### Voice recognition for Titanium iOS and Android apps

Utterance listens to the microphone inside the app and delivers the transcript in an event. It uses `SFSpeechRecognizer` on iOS and `android.speech.SpeechRecognizer` on Android. Neither platform opens a system dialog, so the app shows its own indicator while it listens. It can also transcribe an audio file, or audio the app feeds itself. The examples use ES6+.

## Requirements
* Titanium SDK 13.0.0+ (the minimum in `android/manifest` and `ios/manifest`)
* iOS 15.0+ (the module's deployment target). Some options need a newer iOS and say so.
* Android 7.0+ / API level 24+, the minimum of Titanium SDK 13.4.1. Some options need a newer Android and say so.

## What's new

### v4.1
- Options for most of what `SFSpeechRecognizer` and `SpeechRecognizer` offer, with the same name on both platforms where the platform has the feature: `taskHint`, `contextualStrings`, `onDevice`, `punctuation`, `partialResults`, `audioLevelInterval`, `segments`, `alternatives`.
- New events: `partial`, `speechstart`, `speechend`, `audiolevel`, `canceled`, `permissions`, `languages`.
- New methods: `cancelRecording()`, `requestPermissions()`, `getPermissionStatus()`, `isAvailable()`, `supportsOnDevice()`, `requestSupportedLanguages()`, `transcribeFile()`, `appendAudio()`, `getNativeAudioFormat()`.
- Failures in `completed` carry a stable `code`, so an app does not have to read the `message`.
- iOS only: `metadata`, `voiceAnalytics`, `customLanguageModel`, `prepareCustomLanguageModel()`, `getState()`, and the `audioduration` and `availability` events.
- Android only: language detection and switching, `maskOffensiveWords`, `segmentedSession`, `minimumLength`, `biasDeviceContext`, `downloadLanguage()`, and the `segmentresult`, `languagedetected` and `download` events.
- Nothing from 4.0 was removed or renamed. [What changes in behavior](#behavior-changes-from-40) lists the few things that do something different.

### v4.0
- iOS: speech-to-text is supported and documented. The default language is the system language.
- Android: `startSpeechToText()` listens inside the app instead of opening the system's voice dialog, needs `RECORD_AUDIO` granted at runtime, and has a new `stopRecording()`.
- Both platforms: the same `completed` payload, with `text`, `confidence`, `words`, `wordCount` and `detectedInput`. Failures arrive in `completed` with `success: false`.
- This guide was rewritten: it described an `error` event and a `results` field that the module never had. See the [changelog](../CHANGELOG.md) and the [migration guide](MIGRATION_GUIDE.md) for the full list.

## Installation and setup

### Import the module

```javascript
const utterance = require('bencoding.utterance');
```

### Required permissions

Add the usage descriptions and permissions to `tiapp.xml`:

```xml
<ios>
  <plist>
    <dict>
      <key>NSMicrophoneUsageDescription</key>
      <string>This app uses the microphone to convert speech to text.</string>

      <key>NSSpeechRecognitionUsageDescription</key>
      <string>This app uses speech recognition for voice commands.</string>
    </dict>
  </plist>
</ios>

<android xmlns:android="http://schemas.android.com/apk/res/android">
  <manifest>
    <uses-permission android:name="android.permission.RECORD_AUDIO"/>
    <uses-permission android:name="android.permission.INTERNET"/>
  </manifest>
</android>
```

`requestPermissions()` asks for what the platform needs (the microphone, and on iOS speech recognition too) and answers in the `permissions` event. `getPermissionStatus()` reads the current state without asking.

```javascript
const speechToText = utterance.createSpeechToText();

function ensureMicrophone(callback) {
  if (speechToText.getPermissionStatus().granted) {
    callback(true);
    return;
  }
  speechToText.addEventListener('permissions', (event) => callback(event.granted), { once: true });
  speechToText.requestPermissions();
}
```

iOS also asks the first time `startSpeechToText()` runs. Android does not: without `RECORD_AUDIO` granted, `completed` reports `success: false` with `code: 'permission_denied'`.

## Working with speech-to-text

### Creating an instance

```javascript
const speechToText = utterance.createSpeechToText();

if (!speechToText.isSupported()) {
  console.warn("Speech-to-Text not supported on this device");
  // Offer another way to type or choose
}
```

### Conventions

- An option is ignored, without an error, on a platform that has no equivalent. The tables say which platform each one applies to.
- Events fire only when the app has a listener at that moment, so add the listeners before starting. An event never fires inside the call that caused it: it arrives right after the call returns.
- An asynchronous method with no equivalent on a platform answers through its event with `{ success: false, code: 'unsupported' }`, so the app never waits for nothing.
- Without any of the new options, a session behaves as in 4.0.

## API methods

### `startSpeechToText(options?)`

Starts listening. `started` fires when the microphone is open and `completed` fires once, when recognition ends. The session ends by itself after a pause; `silenceTimeout` and `noSpeechTimeout` adjust how long. Calling it while it is already listening does nothing.

| Option                                                 | Platform             | Description                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `language`                                             | iOS, Android         | BCP 47 tag such as `es-MX`. Default: the system language on iOS (when `SFSpeechRecognizer` supports it, otherwise `en-US`) and the device language on Android. An unsupported language fails on iOS with `language_unsupported`; Android decides on its own and may fall back instead                                                                                                                                                |
| `taskHint`                                             | iOS, Android         | `speechToText.TASK_HINT_DICTATION` (default), `TASK_HINT_SEARCH`, `TASK_HINT_CONFIRMATION` or `TASK_HINT_UNSPECIFIED`. Android has two models, so `search` selects web search and the other three free form                                                                                                                                                                                                                          |
| `languageModel`                                        | iOS, Android         | The older name of `taskHint`: `LANGUAGE_MODEL_FREE_FORM` or `LANGUAGE_MODEL_WEB_SEARCH`. `taskHint` wins when both are set                                                                                                                                                                                                                                                                                                           |
| `maxResults`                                           | iOS, Android         | How many alternative transcriptions `words` holds (default 10). Android asks the recognizer for that many; iOS trims the list                                                                                                                                                                                                                                                                                                        |
| `contextualStrings`                                    | iOS, Android 13+     | Words the recognizer should expect, such as names. See [Test results](#test-results) for what each platform did with them                                                                                                                                                                                                                                                                                                            |
| `onDevice`                                             | iOS, Android         | `true` requires recognition on the device and fails with `on_device_unavailable` (iOS) or `language_unsupported` / `language_unavailable` (Android) when the language has no local model. `'prefer'` uses the local model when there is one and the network otherwise. Default: the platform decides. Apple warns that on-device recognition is less accurate. Android below 12 cannot require it: `true` is only a preference there |
| `punctuation`                                          | iOS 16+, Android 13+ | Adds punctuation to the text                                                                                                                                                                                                                                                                                                                                                                                                         |
| `partialResults`                                       | iOS, Android         | `true` (default) fires `partial` events. `false` stops them, but the recognizer still computes partial results internally while a silence timer is on                                                                                                                                                                                                                                                                                |
| `audioLevelInterval`                                   | iOS, Android         | Milliseconds between `audiolevel` events (default 100, minimum 10)                                                                                                                                                                                                                                                                                                                                                                   |
| `silenceTimeout`                                       | iOS, Android         | Seconds of silence after speech before the session ends. Default on iOS: 2. On Android the recognizer decides unless you set it. 0 turns it off                                                                                                                                                                                                                                                                                      |
| `noSpeechTimeout`                                      | iOS, Android         | Seconds to wait for speech to start before ending with `no_speech`. Default on iOS: 6. On Android the recognizer decides unless you set it. 0 turns it off                                                                                                                                                                                                                                                                           |
| `audioSource`                                          | iOS, Android 13+     | `'microphone'` (default) or `'buffer'`: the app sends the audio with `appendAudio()`. See [Audio that does not come from the microphone](#audio-that-does-not-come-from-the-microphone)                                                                                                                                                                                                                                              |
| `sampleRate`, `channels`                               | iOS, Android 13+     | Format of the audio sent with `appendAudio()`. Defaults: 16000 and 1                                                                                                                                                                                                                                                                                                                                                                 |
| `segments`                                             | iOS, Android 14+     | Adds `segments` to `completed`: the best transcription split by word                                                                                                                                                                                                                                                                                                                                                                 |
| `alternatives`                                         | iOS, Android 14+     | Adds `alternatives` to `completed`: other readings of parts of the text                                                                                                                                                                                                                                                                                                                                                              |
| `metadata`                                             | iOS 14.5+            | Adds `metadata` to `completed`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `voiceAnalytics`                                       | iOS 14.5+            | Adds `voiceAnalytics` to `completed`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `customLanguageModel`                                  | iOS 17+              | `{ languageModel, vocabulary?, weight? }`: a model prepared with `prepareCustomLanguageModel()`. `weight` needs iOS 26. Forces on-device recognition                                                                                                                                                                                                                                                                                 |
| `detectLanguage`                                       | Android 14+          | Detects the spoken language. `allowedLanguages` limits the candidates                                                                                                                                                                                                                                                                                                                                                                |
| `allowedLanguages`                                     | Android 14+          | Array of language tags for `detectLanguage` and `switchLanguages`                                                                                                                                                                                                                                                                                                                                                                    |
| `switchLanguages`                                      | Android 14+          | `true` or a sensitivity: `'balanced'`, `'highPrecision'`, `'quickResponse'`. Follows the speaker when the language changes mid-session                                                                                                                                                                                                                                                                                               |
| `maxLanguageSwitches`, `languageSwitchInitialDuration` | Android 15+          | Limit the number of switches, and how long (milliseconds) the first language stays active                                                                                                                                                                                                                                                                                                                                            |
| `maskOffensiveWords`                                   | Android 13+          | Masks offensive words                                                                                                                                                                                                                                                                                                                                                                                                                |
| `segmentedSession`                                     | Android 13+          | Keeps listening across pauses and reports each piece in `segmentresult`. End it with `stopRecording()`. The module's own silence timers stay off                                                                                                                                                                                                                                                                                     |
| `minimumLength`                                        | Android              | Milliseconds of audio the recognizer should listen before it may end                                                                                                                                                                                                                                                                                                                                                                 |
| `biasDeviceContext`                                    | Android 13+          | Lets the recognizer use on-device context, such as contact names, to bias the results                                                                                                                                                                                                                                                                                                                                                |
| `promptText`                                           | none                 | No effect. Older versions showed it in the system dialog, which no longer opens                                                                                                                                                                                                                                                                                                                                                      |

For short commands such as "next card", `silenceTimeout: 1` ends the session about a second after the user stops talking. Keep `noSpeechTimeout` at 5 or more: people need a moment to start talking after the tap, and on an iPad a value of 3 cut sentences that had just begun.

### `stopRecording()`

Ends the audio. Recognition does not stop at once: `completed` arrives a moment later with the transcript of everything said so far. Call it from a "done" button, or after your own timeout.

### `cancelRecording()`

Drops the session. The result is discarded and `completed` never fires; `canceled` fires instead. It also fires when nothing was listening, and when the call comes while the permission prompt is still open or before `started`. A session started after a cancel works normally.

Use it when the app already has what it needs from the partial text, such as a voice command.

### `transcribeFile(file, options?)`

Transcribes a recorded file, such as a voice message, without the microphone. `file` is a `Ti.Filesystem.File`, a path, a `file://` or `app://` URL (a path with no scheme is relative to `Resources`), or a `Ti.Blob`. The options are the same as for `startSpeechToText()`, except the ones about the microphone. `started`, `partial`, `speechstart`, `speechend` and `completed` fire as in a live session, with `source: 'file'`.

A file that does not exist or cannot be read fails with `invalid_file`. On Android it needs Android 13, and it decodes with `MediaExtractor`, so it reads what the device can decode (wav, m4a and mp3 were tried).

### `appendAudio(data)` and `getNativeAudioFormat()`

With `audioSource: 'buffer'`, the app sends the audio itself. `data` is a `Ti.Buffer` or `Ti.Blob` of 16-bit little-endian PCM in the `sampleRate` and `channels` given to `startSpeechToText()`. Send it in chunks of any size. The module converts it to what the recognizer reads (16 kHz mono on Android, the request's native format on iOS). `stopRecording()` marks the end of the audio and `completed` follows.

`getNativeAudioFormat()` returns `{ sampleRate, channels }`: on iOS the format `SFSpeechAudioBufferRecognitionRequest` prefers, on Android 16000 and 1.

### `isSupported()`, `isAvailable(language?)`, `supportsOnDevice(language?)`

`isSupported()` asks whether the platform has speech recognition at all. `isAvailable()` asks whether recognition can run now. `supportsOnDevice()` asks whether it can run without the network. The `language` argument works on iOS. Android cannot answer for one language synchronously, so it ignores the argument; use `requestSupportedLanguages()` there.

### `requestPermissions()`, `getPermissionStatus()`

See [Required permissions](#required-permissions). `getPermissionStatus()` and the `permissions` event return `{ granted, status, microphone }` and, on iOS, `speech`. `status` is `'granted'`, `'denied'`, `'restricted'` (iOS) or `'undetermined'` (iOS). Android cannot tell "never asked" from "denied" without an activity, so it never reports `'undetermined'`.

### `requestSupportedLanguages()`

Answers in the `languages` event with `{ success, checked, languages }`. Each language is `{ language, online, onDevice, installed, pending }`. On iOS, `installed` equals `onDevice`: the system downloads models by itself and an app cannot tell whether one is present. Android 13 and later report the real lists; before that, `checked` is `false` and `languages` is empty.

### `downloadLanguage({ language })`

Android 13+. Asks the speech service to download the on-device model for a language. `download` events report `state`: `'requested'` (Android 13, no progress), or on Android 14 and later `'scheduled'`, `'progress'` (with `progress` from 0 to 100) and `'success'`. On iOS it answers `unsupported`: the system downloads models by itself.

### `getState()` (iOS)

Returns `{ state, listening, finishing, canceled }` and, after a failure, `message` and `code`. `state` is `'idle'`, `'starting'`, `'running'`, `'finishing'`, `'canceling'` or `'completed'`. Android returns `{ state: 'running' | 'idle', listening }`.

### `prepareCustomLanguageModel(options)` (iOS 17+)

Prepares a custom language model. The asset is the file that Apple's `SFCustomLanguageModelData.export()` writes, which the app has to provide: the module does not build it. Options: `asset`, `languageModel` (where the prepared model goes), `vocabulary`, `weight` (iOS 26), `ignoresCache`. Answers in the `languagemodel` event with `{ success }` or a failure with `code: 'language_model_invalid'`. Android answers `unsupported`.

## Events

### `started`

Fires when the audio is flowing. Use it to change the button or show a level indicator. Payload: `{ success: true, language, source }`.

### `partial`

The text recognized so far, while the person is still talking. Payload: `{ text, words }`, where `words` is `[text]`: only `completed` carries alternatives. The same text never fires twice in a row.

### `speechstart`, `speechend`

The speech started and ended. On Android these are the recognizer's own events. On iOS the system documents equivalents but did not call them on the iPad this was tested on (iOS 27), so the module reports `speechstart` with the first recognized text and `speechend` when it ends the audio (a silence timer, `stopRecording()`, or the end of a file).

### `audiolevel`

How loud the microphone is, up to 10 times a second by default. Payload: `{ level, decibels }`. `level` goes from 0 to 1 on both platforms and is meant for a level meter. `decibels` is the raw platform value and the two do not match: dBFS on iOS (0 is the loudest, quiet rooms are about -60 or lower) and the recognizer's `rmsdB` on Android (about -2 to 10). The `level` scales were chosen by trial on one device each and are not calibrated.

### `audioduration` (iOS)

Seconds of audio the recognizer has processed. Fires often, so add a listener only if you need it.

### `canceled`

`cancelRecording()` ran. Payload: `{ success: true }`.

### `permissions`, `languages`, `download`, `languagemodel`

Answers to `requestPermissions()`, `requestSupportedLanguages()`, `downloadLanguage()` and `prepareCustomLanguageModel()`. See those methods.

### `availability` (iOS)

The recognizer became available or unavailable. Payload: `{ available, language }`. If it becomes unavailable during a session, the session fails with `unavailable`.

### `segmentresult`, `languagedetected` (Android)

`segmentresult` carries each piece of a `segmentedSession`: `{ text, words, confidence }`. `languagedetected` carries `{ language, confidence, alternatives, switchResult }` when `detectLanguage` or `switchLanguages` is on and the recognizer reports it.

### `completed`

Fires once per session, with a transcript or a failure. Failures arrive here: there is no `error` event.

| Field                        | Type           | Description                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`                    | Boolean        | `true` when recognition ran to the end; `false` on failure                                                                                                                                                                                                                                                              |
| `text`                       | String         | The best transcription, or an empty string                                                                                                                                                                                                                                                                              |
| `words`                      | Array          | The alternative transcriptions, best first                                                                                                                                                                                                                                                                              |
| `wordCount`                  | Integer        | How many entries `words` has (not how many words `text` has)                                                                                                                                                                                                                                                            |
| `detectedInput`              | Boolean        | Whether anything was recognized                                                                                                                                                                                                                                                                                         |
| `confidence`                 | Number         | iOS: the average over the segments of the best transcription. Android: the recognizer's score for it. On one device the Google recognizer returned the same value (0.948) for every Spanish result, and 0 for audio sent with `transcribeFile()` or `appendAudio()`, so do not rely on it there                         |
| `language`                   | String         | The language of the session                                                                                                                                                                                                                                                                                             |
| `source`                     | String         | `'microphone'`, `'buffer'` or `'file'`                                                                                                                                                                                                                                                                                  |
| `segments`                   | Array          | Only with `segments: true`. One entry per word: `{ text, timestamp, duration, confidence, start, end }`. `timestamp` and `duration` are in seconds, `start` and `end` are character positions in `text`. Android has no `duration`, gives `confidence` as a level divided by 5 and adds `confidenceLevel` and `rawText` |
| `alternatives`               | Array          | Only with `alternatives: true`. `{ start, end, alternatives }` for each part of the text that has other readings                                                                                                                                                                                                        |
| `metadata`                   | Object         | iOS, only with `metadata: true`: `{ speakingRate, averagePauseDuration, speechStartTimestamp, speechDuration }`                                                                                                                                                                                                         |
| `voiceAnalytics`             | Object         | iOS, only with `voiceAnalytics: true`: `{ jitter, shimmer, pitch, voicing }`, each `{ frameDuration, values }` with one value per frame. The arrays are large                                                                                                                                                           |
| `detectedLanguage`           | String         | Android, when the recognizer reports one                                                                                                                                                                                                                                                                                |
| `message`                    | String         | Only with `success: false`                                                                                                                                                                                                                                                                                              |
| `code`                       | String         | Only with `success: false`. See [Error codes](#error-codes)                                                                                                                                                                                                                                                             |
| `nativeCode`, `nativeDomain` | Number, String | Only with `success: false`: the platform's own error (`nativeDomain` is iOS only)                                                                                                                                                                                                                                       |

On failure the payload is `{ success: false, message, code, detectedInput: false, wordCount: 0, words: [] }` plus `language`, `source` and the native error when there is one.

```javascript
speechToText.addEventListener('started', () => {
  console.log("Listening...");
});

speechToText.addEventListener('partial', (event) => {
  console.log("So far:", event.text);
});

speechToText.addEventListener('completed', (event) => {
  if (!event.success) {
    console.warn(event.code, event.message);
    return;
  }
  console.log("Best:", event.text, event.confidence);
  console.log("Alternatives:", event.words);
});
```

## Error codes

Compare `event.code` with the constants (`speechToText.ERROR_NO_SPEECH`) or with the strings. `message` keeps the 4.0 wording.

| Code                     | Constant                       | Meaning                                         | iOS                                                                     | Android                                                                                             |
| ------------------------ | ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `no_speech`              | `ERROR_NO_SPEECH`              | Nothing was said, or nothing matched            | `kAFAssistantErrorDomain` 1110                                          | `ERROR_SPEECH_TIMEOUT`, `ERROR_NO_MATCH`                                                            |
| `permission_denied`      | `ERROR_PERMISSION_DENIED`      | The microphone or speech permission is off      | the permission request, 1700                                            | `ERROR_INSUFFICIENT_PERMISSIONS`, or the check before starting                                      |
| `network`                | `ERROR_NETWORK`                | The recognizer could not reach its server       | `NSURLErrorDomain`                                                      | `ERROR_NETWORK`, `ERROR_NETWORK_TIMEOUT`                                                            |
| `audio`                  | `ERROR_AUDIO`                  | The microphone or the audio session failed      | no input, session or engine errors                                      | `ERROR_AUDIO`                                                                                       |
| `busy`                   | `ERROR_BUSY`                   | Another session is running                      | 1100                                                                    | `ERROR_RECOGNIZER_BUSY`                                                                             |
| `unavailable`            | `ERROR_UNAVAILABLE`            | The recognizer is not available now             | `isAvailable` is false, or it became so                                 |                                                                                                     |
| `language_unsupported`   | `ERROR_LANGUAGE_UNSUPPORTED`   | The language is not supported                   | the framework has no recognizer for it                                  | `ERROR_LANGUAGE_NOT_SUPPORTED`                                                                      |
| `language_unavailable`   | `ERROR_LANGUAGE_UNAVAILABLE`   | Supported, but its model is not installed       | `kLSRErrorDomain` 102                                                   | `ERROR_LANGUAGE_UNAVAILABLE`                                                                        |
| `on_device_unavailable`  | `ERROR_ON_DEVICE_UNAVAILABLE`  | `onDevice: true` and the device cannot          | the language has no local model                                         | `isOnDeviceRecognitionAvailable` is false (Android 12+)                                             |
| `too_many_requests`      | `ERROR_TOO_MANY_REQUESTS`      | Too many requests to the recognizer             |                                                                         | `ERROR_TOO_MANY_REQUESTS`                                                                           |
| `disabled`               | `ERROR_DISABLED`               | Siri or Dictation is off                        | `kLSRErrorDomain` 201                                                   |                                                                                                     |
| `service_error`          | `ERROR_SERVICE_ERROR`          | The recognition service failed                  | 203, 1101, 1107, `kLSRErrorDomain` 300, `SFSpeechErrorCode` 1           | `ERROR_SERVER`, `ERROR_CLIENT`, `ERROR_SERVER_DISCONNECTED`, and the checks and downloads that fail |
| `canceled`               | `ERROR_CANCELED`               | The platform canceled the request               | `kLSRErrorDomain` 301                                                   |                                                                                                     |
| `timeout`                | `ERROR_TIMEOUT`                | No answer in time                               | `SFSpeechErrorCode` 12                                                  | Android: a file was sent whole and the recognizer did not answer in 20 seconds                      |
| `invalid_argument`       | `ERROR_INVALID_ARGUMENT`       | An option has a wrong value                     | `audioSource`, `sampleRate`, `channels`, audio that cannot be converted |                                                                                                     |
| `invalid_file`           | `ERROR_INVALID_FILE`           | The audio file does not exist or cannot be read |                                                                         |                                                                                                     |
| `language_model_invalid` | `ERROR_LANGUAGE_MODEL_INVALID` | The custom language model is wrong              | `SFSpeechErrorCode` 7 and 8                                             |                                                                                                     |
| `unsupported`            | `ERROR_UNSUPPORTED`            | The platform or version has no such feature     |                                                                         |                                                                                                     |
| `unknown`                | `ERROR_UNKNOWN`                | Anything else                                   |                                                                         |                                                                                                     |

The `message` values from 4.0 are unchanged.

## Audio that does not come from the microphone

`transcribeFile()` and `audioSource: 'buffer'` work on both platforms; on Android they need Android 13. The sources go through the same options and events as a live session, with `source` telling them apart.

```javascript
// A voice message the app already has
speechToText.transcribeFile(Ti.Filesystem.getFile(Ti.Filesystem.resourcesDirectory, 'message.m4a'), {
  language: 'es-MX',
  segments: true
});

// Audio the app produces, for example from a stream
speechToText.startSpeechToText({ audioSource: 'buffer', sampleRate: 16000, channels: 1 });
speechToText.addEventListener('started', () => {
  chunks.forEach((chunk) => speechToText.appendAudio(chunk)); // Ti.Buffer of 16-bit PCM
  speechToText.stopRecording();
});
```

On Android the recognizer reads the audio through a pipe (`EXTRA_AUDIO_SOURCE`). Three things were found on a device:

- It only answered 16 kHz mono audio, so the module converts anything else before it enters the pipe.
- Its final result for this audio was empty even when the partial results were complete, so `completed` takes the last `partial` text and `confidence` is 0.
- `segments` and `alternatives` did not come back for it.

## Language support

Pass `language` to listen in a specific language. Without it, iOS uses the system language when `SFSpeechRecognizer` supports it (same region first, then any region of that language) and `en-US` otherwise; Android leaves the choice to the recognizer, which uses the device language.

```javascript
speechToText.startSpeechToText({ language: "es-MX" });
```

`requestSupportedLanguages()` lists the languages and which ones work without the network. Which languages work depends on the recognizer installed on the device.

## Practical examples

### Voice commands with a push-to-talk button

The command is acted on as soon as a partial contains it, and `cancelRecording()` drops the session without waiting for the final result. The alternatives in `words` make the match in `completed` more forgiving, because the command is sometimes not the first guess.

```javascript
const utterance = require('bencoding.utterance');

const COMMANDS = {
  'siguiente carta': 'next',
  'la que sigue': 'next',
  'pausa': 'pause'
};

class VoiceCommands {
  constructor(button, onCommand) {
    this.button = button;
    this.onCommand = onCommand;
    this.listening = false;
    this.speechToText = utterance.createSpeechToText();

    this.speechToText.addEventListener('started', () => {
      this.listening = true;
      this.button.title = 'Listening...';
    });

    this.speechToText.addEventListener('partial', (event) => {
      const command = this.find([event.text]);
      if (command) {
        this.speechToText.cancelRecording();
        this.onCommand(command);
      }
    });

    this.speechToText.addEventListener('canceled', () => this.done());

    this.speechToText.addEventListener('completed', (event) => {
      this.done();
      if (!event.success || !event.detectedInput) {
        return;
      }
      const command = this.find(event.words);
      if (command) {
        this.onCommand(command);
      }
    });

    this.button.addEventListener('click', () => this.toggle());
  }

  find(texts) {
    const heard = texts.map((text) => text.toLowerCase().trim());
    const match = heard.find((text) => COMMANDS[text]);
    return match ? COMMANDS[match] : null;
  }

  done() {
    this.listening = false;
    this.button.title = 'Speak';
  }

  toggle() {
    if (this.listening) {
      this.speechToText.stopRecording();
      return;
    }
    ensureMicrophone((granted) => {
      if (granted) {
        this.speechToText.startSpeechToText({ language: 'es-MX', contextualStrings: Object.keys(COMMANDS) });
      }
    });
  }
}
```

`ensureMicrophone()` is the helper from [Required permissions](#required-permissions).

### Dictation

```javascript
const speechToText = utterance.createSpeechToText();
let transcript = '';

speechToText.addEventListener('completed', (event) => {
  if (event.success) {
    transcript += (transcript ? ' ' : '') + event.text;
    textArea.value = transcript;
  }
});

startButton.addEventListener('click', () => ensureMicrophone((granted) => {
  if (granted) {
    speechToText.startSpeechToText({ language: 'es-MX', punctuation: true });
  }
}));
stopButton.addEventListener('click', () => speechToText.stopRecording());
```

Each session ends with one `completed`. To keep dictating, start another session from the next tap.

## Platform differences

| Topic                                                | iOS                                                                               | Android                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Recognizer                                           | `SFSpeechRecognizer`                                                              | `SpeechRecognizer`, the recognizer installed on the device                         |
| Permissions                                          | Asked on the first call, or with `requestPermissions()`                           | `requestPermissions()`, before the first call                                      |
| End of speech                                        | The module ends the session after `silenceTimeout` seconds of silence (default 2) | The recognizer decides, and the module ends it earlier if you set `silenceTimeout` |
| `speechstart`, `speechend`                           | Reported by the module (see the events)                                           | The recognizer's own events                                                        |
| Punctuation                                          | `punctuation: true` (iOS 16+)                                                     | `punctuation: true` is passed on (Android 13+); the recognizer may ignore it       |
| On-device recognition                                | `onDevice`                                                                        | `onDevice`; Android 12+ can require it, older versions only prefer it              |
| Audio leaves the device                              | Possible unless `onDevice: true`                                                  | Up to the recognizer                                                               |
| Result detail                                        | `segments`, `alternatives`, `metadata`, `voiceAnalytics`                          | `segments` and `alternatives` on Android 14+, if the recognizer returns them       |
| Language detection and switching, segmented sessions | none                                                                              | Android 13 and later, if the recognizer supports them                              |

## Behavior changes from 4.0

- iOS: `maxResults` limits `words`, and `languageModel` selects the task hint. Before, iOS ignored both.
- iOS: an unsupported `language` fails with `language_unsupported`. Before, the recognizer was created with a missing locale.
- iOS: events fire right after the call returns instead of inside it, as on Android.
- iOS: a failure while a session was open now closes the microphone first and reports afterwards, so a handler that starts a new session finds the module idle.
- iOS: calling `startSpeechToText()` while the permission prompt is still open no longer opens a second session.

## Test results

What was tried on a device, and what was not. Anything not listed as tried was only compiled.

### iOS

An iPad (9th generation) with iOS 27, speaking Spanish (`es-MX`) and English (`en-US`).

- Tried and working: `requestPermissions()` with the permissions already granted, `getPermissionStatus()`, `isAvailable()`, `supportsOnDevice()`, `getNativeAudioFormat()`, `requestSupportedLanguages()` (62 languages in 404 ms), `cancelRecording()` while idle, mid-sentence and before `started`, a new session after a cancel, `transcribeFile()` with a `File`, a relative path and a `Blob` and with wav, m4a and mp3, `appendAudio()` with a `Ti.Buffer`, `partial`, `audiolevel`, `audioduration`, `speechstart` and `speechend`, `no_speech`, `language_unsupported`, `invalid_file`, `onDevice: true`, `segments`, `metadata`, `voiceAnalytics`, `punctuation` (the same audio came back as "Hola mundo, esta es una prueba..." with it and "Hola mundo esta es una prueba..." without it), and `contextualStrings`: without the option the speech "el chonchito" came back as "El chanchito" and with it as "El chonchito".
- Not tried: `customLanguageModel` and `prepareCustomLanguageModel()`, the `availability` event, interruptions such as a phone call, the permission prompt itself (the permissions were already granted), `alternatives` with content (it came back empty), `getState()` during a session, `onDevice: 'prefer'`, `taskHint` and `unspecified`/`confirmation` hints.

### Android

An OPPO CPH2639 with Android 16 and the Google recognizer, speaking Spanish and English.

- Tried and working: `requestPermissions()` and `getPermissionStatus()`, `requestSupportedLanguages()` (31 languages), `cancelRecording()` while idle, mid-sentence and before `started`, a new session after a cancel, `transcribeFile()` with a `File`, a relative path and a `Blob` and with wav, m4a (22.05 kHz) and mp3, `appendAudio()` with a `Ti.Buffer`, `partial`, `audiolevel`, `speechstart`, `speechend`, `no_speech`, `invalid_file`, `onDevice: true` reporting `language_unsupported` and `language_unavailable` (no local model is installed for `es-MX` or `en-US`), and `onDevice: 'prefer'` falling back to the network.
- Accepted by the recognizer, with no effect seen: `contextualStrings` ("el chonchito" came back as "el Chanchito" with and without it), `punctuation` ("Cómo te llamas" came back the same with it on and off), `segments` and `alternatives` (the result bundle held only `current_locale`, `results_recognition` and `confidence_scores`), `segmentedSession` (the session ended at the first pause, with no `segmentresult`), `minimumLength` (the session ended in 2.7 seconds with 6000 set), `detectLanguage` and `switchLanguages` (no `languagedetected` event), `maskOffensiveWords` and `biasDeviceContext` (no effect could be seen). The log shows the extras reaching the recognizer. Another recognizer, a newer Google app or another device may behave differently.
- Not tried: `downloadLanguage()`, an on-device session with an installed model, Android versions other than 16, and any other recognizer. The checks for Android 12 and earlier (`onDevice` as a preference, no `requestSupportedLanguages()` result, no `transcribeFile()`) were not run.

## Best practices

### Do
- End every session with `stopRecording()`, `cancelRecording()` or let it finish; `completed` or `canceled` always follows.
- Show that the microphone is open from `started` to `completed` or `canceled`.
- Start listening after the text-to-speech `completed` event, so the recognizer does not hear the app's own voice.
- Check `success` and `detectedInput` before using `text`, and `code` to decide what to tell the user.
- Ask for the microphone permission from a user action, such as the button that starts listening.
- Add the listeners before starting a session or calling a method that answers with an event.

### Don't
- Don't restart listening in a loop without a visible indicator and a way to stop it: it keeps the microphone open and drains the battery.
- Don't assume `words` has more than one entry.
- Don't rely on an option that only some recognizers honor, such as `punctuation` or `contextualStrings` on Android, to change the result.
- Don't rely on `promptText`: no dialog shows it.

## Integration with text-to-speech

```javascript
const speech = utterance.createSpeech();
const speechToText = utterance.createSpeechToText();

speech.addEventListener('completed', () => {
  ensureMicrophone((granted) => {
    if (granted) {
      speechToText.startSpeechToText({ language: 'es-MX' });
    }
  });
});

speech.startSpeaking({ text: "¿Qué carta sigue?", voice: "es-MX" });
```

## License

Utterance is available under the Apache 2.0 license.

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
