# Utterance v4.2: text to speech

Utterance speaks text in Titanium apps with AVSpeechSynthesizer on iOS and TextToSpeech on Android, using the same API and rate values on both.

- [Requirements](#requirements)
- [What's new](#whats-new)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How a speech works](#how-a-speech-works)
- [Speaking: options](#speaking-options)
- [Voices](#voices)
- [Controlling playback](#controlling-playback)
- [Events](#events)
- [Words as they are spoken](#words-as-they-are-spoken)
- [Saving speech to a file](#saving-speech-to-a-file)
- [Errors](#errors)
- [Only on iOS](#only-on-ios)
- [Only on Android](#only-on-android)
- [Recipes](#recipes)
- [Differences between platforms](#differences-between-platforms)
- [Performance and the speaker](#performance-and-the-speaker)
- [Best practices](#best-practices)
- [Tested and not tested](#tested-and-not-tested)

## Requirements

* Titanium SDK 13.0.0+ (the minimum in each module's `manifest`)
* iOS 15.0+ (current Xcode no longer builds for older targets)
* Android 7.0+ (API level 24+), the minimum of Titanium SDK 13.4.1

## What's new

### v4.2
- `wordstart` reports each word as it is spoken, with its position in the text.
- `volume` works on Android, `pan` and `audioUsage` are new, and `audioFocus` is new on Android.
- `synthesizeToFile()` renders a speech to a WAV file instead of playing it, and `playSilence()` puts a pause in the queue.
- `getState()`, `isPaused()` and `getMaxTextLength()`. On Android a text longer than the engine accepts is cut into sentences instead of failing.
- Failures carry a `code`, with the new constants `ERROR_SYNTHESIS`, `ERROR_NOT_READY` and `ERROR_TEXT_TOO_LONG`.
- iOS: SSML, IPA pronunciations, `marker` events, Personal Voice, `voiceschanged`, the audio session options, and `speakerWakeDelay`, a short silence before the first word when the speaker has been idle.
- Android: `addSpeech()`, `addEarcon()` and `playEarcon()` for prerecorded audio, and pause and resume from the word where the speech stopped.
- Behavior changes on iOS: `startSpeaking()` without `queue: true` now cuts off what is speaking, as Android always did; before, it was ignored with "Already speaking". An empty text fails with `invalid_argument`. A failure arrives in `completed` with `success: false` and a `code`, and the `error` and `errored` events fire too. With `queue: true`, `canceled` fires only for the last utterance. Events are asynchronous and fire only when a listener exists. `stopSpeaking()` also stops a paused speech.
- Events reach your app only while JavaScript holds the proxy. See [Keep a reference to the proxy](#keep-a-reference-to-the-proxy).

### v4.0
- No text-to-speech changes. Speech-to-text changed on both platforms; see the [changelog](../CHANGELOG.md).

### v3.3
- iOS now requires Titanium SDK 13.0.0, like Android. No API changes.

### v3.2
- No TTS calls on Android's main thread. Speaking, stopping, canceling, preloading, changing engine and the initial voice setup run on a background thread. Android's `TextToSpeech` waits on an internal lock while it connects to the engine; on the main thread that wait was reported by Google Play as an ANR (`Input dispatching timed out`).
- On Android, `isSpeaking` reads a flag instead of asking the engine. Only the last queued utterance moves the flag, so it answers immediately and an earlier utterance finishing cannot turn it off.
- `requestVoices()` delivers the installed voices asynchronously in a `voices` event, with the same shape on both platforms. See [Listing the installed voices](#listing-the-installed-voices).
- New `startSpeaking()` options: `voiceId`, `bestVoice` and `queue`.
- iOS fixes: `voice` accepts `es_MX` as well as `es-MX`, and out-of-range `rate`, `pitchMultiplier` and `volume` values are now rejected (the range check always passed before).

### v3.1
- Speech starts right away: the legacy 100 ms warm-up delay on Android is gone.
- Flag resets are centralized, which cuts redundant atomic operations by about 89 % per utterance.
- Removed the unused `reset()` helper and the defensive readiness checks.
- Rapid stop/cancel/start sequences no longer drop utterances.

### v3.0
- The same rate value produces the same perceived speed on both platforms.
- Detailed voice information with quality indicators.
- Better language detection and availability checking.
- Legacy workarounds removed, and faster initialization on Android.
- All v2.x APIs keep working unchanged.

## Installation

Download the iOS and Android zips from the [releases page](https://github.com/macCesar/Utterance/releases), install them in your Titanium project and add the module to `tiapp.xml`:

```xml
<modules>
  <module platform="iphone">bencoding.utterance</module>
  <module platform="android">bencoding.utterance</module>
</modules>
```

```javascript
const utterance = require('bencoding.utterance');
```

Text-to-speech needs no permissions. The entries below are for speech-to-text; add them to your `tiapp.xml` if you also use it:

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

## Quick start

```javascript
const utterance = require('bencoding.utterance');

// One proxy for the whole app, held by a constant at the top of the module
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

`voice` is a language code. `rate` uses a constant that sounds equally fast on both platforms. `completed` fires when the speech ends and also when it fails, so a single listener covers both.

## How a speech works

### Keep a reference to the proxy

Events reach your app only while JavaScript still holds the proxy. If `createSpeech()` runs inside a function and nothing else refers to the result, JavaScript can collect the proxy once the function has finished, and its events stop arriving without any error. Keep the proxy in a constant at the top of a CommonJS module, for example `const speech = utterance.createSpeech()`, and export the functions that use it.

### The life of a speech

`startSpeaking()` returns at once and the speech happens in the background. The events arrive in this order:

1. `started` when the speech begins.
2. `wordstart` for every word, if a listener exists.
3. `completed` when the speech ends. A failure also arrives here, with `success: false`, followed by `error`.

`paused` and `continued` follow `pauseSpeaking()` and `continueSpeaking()`. `stopped` follows `stopSpeaking()`, and iOS adds `canceled`. `cancelSpeaking()` on Android fires `canceled`.

Events fire after the call that caused them returns, never inside it, and only when a listener exists at that moment. Add your listeners before the first call.

### Cut off or queue

By default `startSpeaking()` cuts off what is speaking. With `queue: true` the text waits for its turn, each part keeps its own voice and rate, and `completed` fires once, when the whole queue ends. `getState()` tells you what is going on:

```javascript
speech.startSpeaking({ text: 'The first sentence.', voice: 'en-US' });
speech.startSpeaking({ text: 'The second one waits.', voice: 'en-US', queue: true });

speech.getState(); // { speaking: true, paused: false, queued: 1 }
```

`queued` counts the utterances waiting behind the one that sounds.

## Speaking: options

`startSpeaking(options)` starts speaking the given text.

| Parameter                                                                                   | Type    | Platform     | Description                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                                                                                      | String  | **Required** | The text to be spoken                                                                                                                                 |
| `voice`                                                                                     | String  | Optional     | A language code such as `es-MX` or `es_MX`. iOS defaults to `auto`, which detects the language of the text. Android also accepts an engine voice name |
| `voiceId`                                                                                   | String  | Optional     | A voice `id` from the `voices` event (v3.2). If that voice is no longer installed, `voice` is used instead                                            |
| `bestVoice`                                                                                 | Boolean | Optional     | When no `voiceId` applies, use the highest-quality installed voice for `voice`, same region first (v3.2). Default: `false`                            |
| `rate`                                                                                      | Float   | Optional     | Speech rate. 0 to 1 on iOS, 0.1 to 3 on Android. Use the constants in [Rate constants](#rate-constants)                                               |
| `volume`                                                                                    | Float   | Optional     | Volume level, 0 to 1. Default: 1.0. Android supports it since v4.2. A value outside the range is ignored and logged                                   |
| `pitch`                                                                                     | Float   | Optional     | Speech pitch, 1.0 by default. On iOS it goes from 0.5 to 2. `pitchMultiplier` is the same option                                                      |
| `queue`                                                                                     | Boolean | Optional     | Speak after the current utterance instead of cutting it off (v3.2). `completed` fires once, when the queue ends. Default: `false`                     |
| `pan`                                                                                       | Float   | Android only | Stereo position from -1 (left) to 1 (right) (v4.2). iOS ignores it                                                                                    |
| `audioUsage`                                                                                | String  | Optional     | `media`, `assistant`, `notification`, `alarm` or `accessibility` (v4.2). See [Audio usage and focus](#audio-usage-and-focus)                          |
| `audioFocus`                                                                                | Boolean | Android only | Hold transient audio focus, lowering other audio, while the speech lasts (v4.2). Default: `false`                                                     |
| `splitLongText`                                                                             | Boolean | Android only | Cut a text longer than `getMaxTextLength()` into sentences (v4.2). Default: `true`                                                                    |
| `ssml`                                                                                      | Boolean | iOS only     | Treat `text` as SSML (v4.2, iOS 16). On iOS 15 the call fails with `unsupported`                                                                      |
| `pronunciations`                                                                            | Array   | iOS only     | `[{ start, end, ipa }]`: ranges of `text` spoken with the given IPA (v4.2)                                                                            |
| `speakerWakeDelay`                                                                          | Float   | iOS only     | Seconds of silence before the first word when the speaker has been idle (v4.2). Default: 0.2; 0 turns it off                                          |
| `preUtteranceDelay`, `postUtteranceDelay`                                                   | Float   | iOS only     | Seconds before and after the speech. They are the synthesizer's own properties and add no measurable wait; use `playSilence()` for a pause            |
| `usesApplicationAudioSession`, `mixToTelephonyUplink`, `prefersAssistiveTechnologySettings` | Boolean | iOS only     | The AVSpeechSynthesizer properties of the same name (v4.2)                                                                                            |

### Rate constants

The constants sound about equally fast on both platforms, although the numbers differ because the engines define their ranges differently. Use them instead of numbers and the same code works everywhere.

| Constant                | iOS  | Android | Use               |
| ----------------------- | ---- | ------- | ----------------- |
| `VERY_SLOW_SPEECH_RATE` | 0.25 | 0.4     | Accessibility     |
| `SLOW_SPEECH_RATE`      | 0.35 | 0.6     | Careful listening |
| `DEFAULT_SPEECH_RATE`   | 0.5  | 1.0     | Normal speed      |
| `FAST_SPEECH_RATE`      | 0.55 | 1.3     | Efficient reading |
| `VERY_FAST_SPEECH_RATE` | 0.65 | 1.6     | Quick consumption |

`MIN_SPEECH_RATE` and `MAX_SPEECH_RATE` are the limits of each platform. Four `MATH_*` constants (`MATH_VERY_SLOW_SPEECH_RATE`, `MATH_SLOW_SPEECH_RATE`, `MATH_FAST_SPEECH_RATE` and `MATH_VERY_FAST_SPEECH_RATE`) map one range onto the other with an exact formula, `android = 0.1 + ios × 2.9`, for apps that need arithmetic equivalence more than a matching impression.

To let the user pick a speed, keep the constants in a list and index it:

```javascript
const SPEEDS = [
  { title: 'Slow', rate: speech.SLOW_SPEECH_RATE },
  { title: 'Normal', rate: speech.DEFAULT_SPEECH_RATE },
  { title: 'Fast', rate: speech.FAST_SPEECH_RATE }
];

speech.startSpeaking({ text, voice: 'en-US', rate: SPEEDS[selected].rate });
```

### Volume, pan and pitch

`volume` goes from 0 to 1 on both platforms. `pan` goes from -1 (left) to 1 (right) and works on Android only; iOS ignores it. A value outside the range is ignored and logged. `pitch` and `pitchMultiplier` are the same option on both platforms.

### Audio usage and focus

`audioUsage` says what the speech is for: `media`, `assistant`, `notification`, `alarm` or `accessibility`. On Android it sets the engine's audio attributes. On iOS it sets the app's audio session, and only while `usesApplicationAudioSession` is `true` (the default): `media` and `alarm` use the Playback category, `assistant` and `accessibility` use Playback with the spoken audio mode, and `notification` uses Ambient.

On Android, `audioFocus: true` requests transient audio focus that lowers other audio, and releases it when the speech ends. A navigation prompt over music is the usual case:

```javascript
speech.startSpeaking({
  voice: 'en-US',
  audioFocus: true,
  audioUsage: 'assistant',
  text: 'In 200 meters, turn left.'
});
```

## Voices

### Choosing the language and the voice

`voice` takes a language code. On iOS the code is all it accepts: `voice: 'Paulina'` is not a language and the default voice speaks instead. On Android, `voice` also accepts the name of an engine voice. Code that must run on both platforms picks voices with `voiceId`, which the next section explains.

Without `voice`, iOS detects the language from the text. Android uses the engine's current language.

`bestVoice: true` picks the installed voice with the highest quality for `voice`, preferring the same region (`es-MX` before `es-ES`). Without it, iOS keeps using the compact voice even when a better one is installed. The result is cached per language for the life of the app:

```javascript
speech.startSpeaking({ text: 'La Dama', voice: 'es_MX', bestVoice: true });
```

### Listing the installed voices

`requestVoices()` returns immediately and delivers the list in a `voices` event. Use it to build a voice picker: on Android, `getModernVoices()` waits for the engine on the calling thread, and called from a tap while the engine is connecting it can freeze the app.

Every voice has the same shape on both platforms:

| Property          | Type    | Description                                                                                                        |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`              | String  | Pass it as `voiceId` to `startSpeaking()`. iOS: the voice identifier. Android: the voice name                      |
| `name`            | String  | Display name on iOS (`Paulina`, `Juan`). On Android, the language followed by the engine's own name in parentheses |
| `language`        | String  | BCP-47 tag, e.g. `es-MX`, `en-US`. Android reports `es_MX`, so compare with `/[-_]/`                               |
| `quality`         | String  | `default`, `enhanced` or `premium`                                                                                 |
| `networkRequired` | Boolean | Whether the voice needs a connection                                                                               |

iOS adds `gender` (`male`, `female` or `unspecified`), `novelty` and `personal`. Android adds `installed`, `latency` and `features`. `requestVoices({ includeNovelty: true })` on iOS adds the novelty voices, and a Personal Voice has `personal: true`. `requestVoices({ includeNetwork: true, includeNotInstalled: true })` on Android adds the voices that need the network and the ones whose data is not on the device.

By default only voices usable offline are listed. Apps cannot download voices; on iOS users add them in **Settings › Accessibility › Spoken Content › Voices**.

On a cold start Android can still be connecting to the engine and answer with an empty list. Ask again after a moment, as the picker recipe does.

`getModernVoices()` is the older call. Its shape differs by platform: iOS returns `name`, `language`, `identifier` and a numeric `quality` from 1 to 3, and Android returns `name`, `locale`, `language`, `country`, `quality` up to 500, `qualityString` and `isNetworkConnectionRequired`. Code that must read both is simpler with `requestVoices()`.

### Remembering the user's choice

Save the `id` of the voice the user picked, and pass it with the language as a fallback. If the voice is uninstalled later, `voiceId` finds nothing and the best installed voice for the language speaks instead:

```javascript
speech.startSpeaking({
  voice: 'es_MX',
  bestVoice: true,
  text: 'El Gallo',
  voiceId: Ti.App.Properties.getString('voiceId', '')
});
```

### Personal Voice (iOS 17)

```javascript
speech.addEventListener('personalvoice', (e) => {
  // e = { success, status, authorized }
});
speech.requestPersonalVoiceAuthorization();
```

`status` is `not_determined`, `denied`, `unsupported` or `authorized`; `getPersonalVoiceStatus()` returns the same value without asking. The app needs `NSPersonalVoiceUsageDescription` in the iOS `plist` of `tiapp.xml`. Once authorized, a Personal Voice appears in `requestVoices()` with `personal: true`. The `voiceschanged` event fires with `{ success: true }` when the installed voices change.

## Controlling playback

```javascript
speech.stopSpeaking();
speech.pauseSpeaking();
speech.continueSpeaking();

speech.isPaused();
speech.getState();     // { speaking, paused, queued }
speech.isSpeaking();   // true while a speech sounds. `speech.isSpeaking` without parentheses works too
```

Call `pauseSpeaking()` without arguments on Android. On iOS it accepts `speech.SPEECH_BOUNDARY_WORD` to pause at the next word instead of at once, and `stopSpeaking()` accepts the same constant. `SPEECH_BOUNDARY_IMMEDIATE` and `SPEECH_BOUNDARY_WORD` are 0 and 1 on both platforms.

`stopSpeaking()` also stops a paused speech. `cancelSpeaking()` exists on Android only.

### Pause and resume on Android

Android's `TextToSpeech` has no pause. `pauseSpeaking()` stops the speech at once, even in the middle of a word, and remembers the position of the last word. `continueSpeaking()` says the rest of the text from the start of that word, so a word cut in half is repeated whole. That needs an engine that reports word positions. Without them `paused` carries `success: false` and the code `unsupported`.

A pause button that works on both platforms listens to the events and not to its own state, so the label follows what really happened:

```javascript
speech.addEventListener('paused', (e) => {
  if (e.success) {
    pauseButton.title = 'Resume';
  } else {
    console.warn(`This engine cannot pause: ${e.code}`);
  }
});
speech.addEventListener('continued', () => {
  pauseButton.title = 'Pause';
});

pauseButton.addEventListener('click', () => {
  if (speech.isPaused()) {
    speech.continueSpeaking();
  } else {
    speech.pauseSpeaking();
  }
});
```

### Silence: `playSilence()`

`playSilence(milliseconds, { queue })` puts a pause in the queue. With `queue: true` it comes after what is speaking; without it, it replaces it. On iOS the pause is timed by the module, and it fires `started` (with an empty `text`) and `completed` like a speech. On Android it fires neither and does not count as speaking.

```javascript
speech.startSpeaking({ text: 'Ready.', voice: 'en-US' });
speech.playSilence(800, { queue: true });
speech.startSpeaking({ text: 'Set.', voice: 'en-US', queue: true });
```

### Text length

`getMaxTextLength()` returns 4000 on Android and 0 on iOS, which has no limit. On Android, `startSpeaking()` cuts a longer text into sentences and speaks the parts in order; `completed` fires once, at the end. With `splitLongText: false` the call fails with the code `text_too_long`.

## Events

| Event           | Platform     | Payload                                                                                                                                  |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `started`       | iOS, Android | `{ success, speaking, text, voice, utteranceId }` and on Android `rate`, `pitch`. The speech began to sound                              |
| `completed`     | iOS, Android | The same keys. The speech ended, or failed: check `success` and read `code` and `message`. With `queue: true`, once the whole queue ends |
| `wordstart`     | iOS, Android | `{ start, end, word, utteranceId }`. A word is about to be spoken (v4.2)                                                                 |
| `paused`        | iOS, Android | The speech paused. On Android `success: false` means the engine cannot pause                                                             |
| `continued`     | iOS, Android | The speech resumed                                                                                                                       |
| `stopped`       | iOS, Android | `stopSpeaking()` stopped the speech                                                                                                      |
| `canceled`      | iOS, Android | The speech was canceled. iOS fires it after `stopped`; Android fires it for `cancelSpeaking()`                                           |
| `error`         | iOS, Android | `{ success: false, error, message, code }`. iOS also fires `errored`                                                                     |
| `voices`        | iOS, Android | Reply to `requestVoices()`: `{ voices: [{ id, name, language, quality, ... }] }`                                                         |
| `synthesized`   | iOS, Android | Reply to `synthesizeToFile()`: `{ success, file, duration, format, sampleRate, utteranceId }` (v4.2)                                     |
| `registered`    | iOS, Android | Reply to `addSpeech()` and `addEarcon()`; iOS answers `unsupported` (v4.2)                                                               |
| `marker`        | iOS 17       | A synthesizer marker: `{ kind, start, end }` (v4.2)                                                                                      |
| `personalvoice` | iOS 17       | Reply to `requestPersonalVoiceAuthorization()` (v4.2)                                                                                    |
| `voiceschanged` | iOS          | The installed voices changed (v4.2)                                                                                                      |
| `initialized`   | Android      | The engine finished connecting                                                                                                           |

```javascript
speech.addEventListener('error', (e) => console.warn(e.code, e.message));
speech.addEventListener('started', (e) => console.log('Speaking:', e.text));
speech.addEventListener('completed', (e) => console.log(e.success ? 'Done' : `Failed: ${e.code}`));
```

## Words as they are spoken

```javascript
speech.addEventListener('wordstart', (e) => {
  // e = { start, end, word, utteranceId }
  highlight(e.start, e.end);
});
```

`start` and `end` are positions in the text you passed, also when Android splits a long text. On iOS `end` is the first position after the word; on Android the positions are UTF-16 offsets. With `ssml: true` they are offsets in the SSML string. The event fires only when a listener exists. On Android it needs Android 8 (API 26) and an engine that reports ranges; only Google's engine was tried.

The recipe [Read a text aloud with the word highlighted](#read-a-text-aloud-with-the-word-highlighted) shows it working.

## Saving speech to a file

```javascript
speech.addEventListener('synthesized', (e) => {
  if (e.success) {
    console.log(e.file, e.duration, e.sampleRate);
  } else {
    console.warn(e.code, e.message);
  }
});

speech.synthesizeToFile({
  text: 'Hello',
  voice: 'en-US',
  file: Ti.Filesystem.applicationDataDirectory + 'hello.wav'
});
```

`synthesizeToFile()` takes the options of `startSpeaking()` plus `file`, and plays nothing. The file is a 16 bit WAV. On iOS `file` is a path ending in `.wav`. On Android it is a path, a URL Titanium understands or a `Ti.Filesystem.File`. Without `file` the audio goes to the cache and the event says where.

`synthesized` carries `success`, `file`, `duration` in seconds, `format` (`'wav'`), `sampleRate` and `utteranceId`. Android adds `channels`, `bitsPerSample` and `text`. A failure carries `success: false`, `code`, `message` and `utteranceId`. On iOS 16 and later, `markers: true` adds a `markers` array to the event with the entries described under [SSML, pronunciations and markers](#ssml-pronunciations-and-markers) and a `time` in milliseconds.

On Android the engine has one queue, so the file is made after what is speaking, and a speech without `queue: true`, `stopSpeaking()` or `cancelSpeaking()` cancels it with the code `canceled`.

To play the file, hand its path to `Ti.Media.createSound`. Android needs a `file://` URL:

```javascript
speech.addEventListener('synthesized', (e) => {
  if (!e.success) {
    return;
  }
  const url = e.file.indexOf('file') === 0 ? e.file : 'file://' + e.file;
  const sound = Ti.Media.createSound({ url });
  sound.addEventListener('complete', () => sound.release());
  sound.play();
});
```

## Errors

A failure arrives in `completed` with `success: false`, `code`, `nativeCode` and `message`, and in an `error` event with `error`, `message` and `code`. On iOS an `errored` event fires as well, the name that version used before. Both platforms answer the same way, including a call that was refused before anything was queued.

| Code                                                        | When                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `invalid_argument`                                          | The text is missing or empty, or an option has an invalid value                                                          |
| `unsupported`                                               | The platform has no equivalent, or the iOS version is too old (for example SSML on iOS 15)                               |
| `not_ready`                                                 | Android: the engine has not finished starting                                                                            |
| `text_too_long`                                             | Android: the text is over the limit and `splitLongText` is `false`                                                       |
| `synthesis`, `service_error`, `audio`, `network`, `timeout` | Android: the engine reported the matching error. `synthesis` is also the code of an iOS synthesis that produced no audio |
| `language_unavailable`                                      | Android: the voice data for the language is not installed yet                                                            |
| `invalid_file`                                              | The file of `synthesizeToFile()` cannot be written                                                                       |
| `canceled`                                                  | The work was canceled before it finished                                                                                 |
| `unknown`                                                   | Anything else                                                                                                            |

The constants are `ERROR_INVALID_ARGUMENT`, `ERROR_UNSUPPORTED`, `ERROR_NOT_READY`, `ERROR_TEXT_TOO_LONG`, `ERROR_SYNTHESIS`, `ERROR_SERVICE_ERROR`, `ERROR_AUDIO`, `ERROR_NETWORK`, `ERROR_TIMEOUT`, `ERROR_LANGUAGE_UNAVAILABLE`, `ERROR_INVALID_FILE`, `ERROR_CANCELED` and `ERROR_UNKNOWN`. iOS never emits `text_too_long`. The other `ERROR_*` constants of the module belong to speech to text.

### Reacting to a failure

Decide from the `code`. The message is for the log. A listener on `completed` is enough, because a failure always arrives there:

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
  switch (e.code) {
    case speech.ERROR_NOT_READY:
      // Android is still connecting to the engine: try once more shortly
      setTimeout(() => speech.startSpeaking(lastOptions), 1000);
      break;
    case speech.ERROR_UNSUPPORTED:
      // For example SSML on iOS 15: say the same text without SSML
      speech.startSpeaking({ ...lastOptions, ssml: false, text: stripTags(lastOptions.text) });
      break;
    default:
      // Nothing else is worth repeating: show the text instead
      showTextOnScreen(lastOptions.text);
  }
});
```

`stripTags` and `showTextOnScreen` are your own functions. Do not retry in a loop. One retry after `not_ready` covers a slow engine; any other code fails again with the same input.

## Only on iOS

### SSML, pronunciations and markers

With `ssml: true` (iOS 16), `text` is SSML:

```javascript
speech.startSpeaking({
  ssml: true,
  text: '<speak>Hello<break time="500ms"/>world</speak>'
});
```

`pronunciations` speaks ranges of `text` with an IPA transcription:

```javascript
speech.startSpeaking({
  text: 'tomato',
  pronunciations: [{ start: 0, end: 6, ipa: 'təˈmɑːtoʊ' }]
});
```

The `marker` event (iOS 17) reports the synthesizer's markers while it speaks, and `synthesizeToFile({ markers: true })` returns them in `synthesized` (iOS 16). Each one is `{ kind, start, end }`, with `phoneme` or `bookmark` when they apply. `kind` is `word`, `sentence`, `paragraph`, `phoneme` or `bookmark`. It is called `kind` and not `type` because Titanium replaces `type` in an event with the event name.

### Speaker wake: `speakerWakeDelay`

The built-in speaker of an iPad powers down about two seconds after the last sound and starts cold with the next one. A cold start under the first word can click. When more than 1.8 seconds have passed since the last sound and the output is the built-in speaker, `startSpeaking()` plays silence and waits `speakerWakeDelay` seconds before the speech begins. The silence keeps playing until the speech ends.

The default is 0.2 seconds. It adds 0.3 to 0.4 seconds to a speech that follows a pause (measured from the call to the voice on an iPad), and nothing to speeches that follow each other or to speech through headphones. `speakerWakeDelay: 0` turns it off. Android ignores the option.

The click is intermittent, and the evidence that the wake prevents it comes from listening on one iPad (9th generation, iOS 27): no click in the ten cases with a warm speaker or a silent lead-in, against four clicks in seven cold starts without it.

An app that answers at once to a tap, such as a game that calls a card, can trade the click protection for speed with `speakerWakeDelay: 0`.

### Warm-up

The speech engine needs about two seconds to answer the first speech after the app opens. Creating the proxy starts a silent speech with the default voice that pays that cost, and `warmUp()` repeats it for apps that create the proxy late.

## Only on Android

### Prerecorded audio

`addSpeech(text, source)` plays an audio file when the text is spoken, and `addEarcon(name, source)` registers a short sound that `playEarcon(name, { queue })` plays. `source` is the name, without extension, of a file in `platform/android/res/raw`. A path does not work: the speech engine is another app and cannot open the folder of yours. The answer arrives in a `registered` event with `success`, `kind` (`speech` or `earcon`), `key` and, on failure, `code` and `message`. Playing a name nobody registered fires `error`.

```javascript
speech.addEventListener('registered', (e) => {
  if (e.success && e.kind === 'earcon') {
    speech.playEarcon('chime');
    speech.startSpeaking({ text: 'Your order is ready.', voice: 'en-US', queue: true });
  }
});
speech.addEarcon('chime', 'chime'); // platform/android/res/raw/chime.mp3
```

On iOS `addSpeech()` and `addEarcon()` answer `registered` with `code: 'unsupported'`, and `playEarcon()` answers `completed` with the same code.

### Background

Android stops the speech and drops the queue when the app's activity stops, for example when the user leaves the app.

### Engine information

`getEngineInfo()`, `getDiagnostics()`, `setEngine(packageName)`, `isLanguageAvailable(language)`, `isNetworkRequired(language)`, `preloadVoiceData(language)`, `getEstimatedDuration(text, rate)`, `getModernLanguages()` and `isTTSReady()` read or change the engine. They wait for the engine while it connects, so call them after the `initialized` event and not from a tap.

## Recipes

### Voice picker that remembers the choice

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

let attempts = 0;

speech.addEventListener('voices', ({ voices }) => {
  // On a cold start Android can answer with an empty list while the engine connects
  if (voices.length === 0 && attempts < 3) {
    attempts += 1;
    setTimeout(() => speech.requestVoices(), 1500);
    return;
  }

  const rank = { premium: 0, enhanced: 1, default: 2 };
  const spanish = voices
    .filter((voice) => voice.language.toLowerCase().startsWith('es'))
    .sort((a, b) => rank[a.quality] - rank[b.quality]);

  const dialog = Ti.UI.createOptionDialog({
    title: 'Pick a voice',
    options: spanish.map((voice) => `${voice.name || voice.id} (${voice.language}, ${voice.quality})`)
  });
  dialog.addEventListener('click', (e) => {
    if (e.cancel) {
      return;
    }
    Ti.App.Properties.setString('voiceId', spanish[e.index].id);
    speech.startSpeaking({ text: 'Así suena esta voz.', voiceId: spanish[e.index].id, voice: 'es-MX' });
  });
  dialog.show();
});

speech.requestVoices();
```

### Read a text aloud with the word highlighted

The label shows the whole text, and every `wordstart` paints the word that is about to sound:

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

const TEXT = 'Utterance reads this paragraph aloud, and each word lights up as it is spoken.';
const label = Ti.UI.createLabel({ text: TEXT, left: 16, right: 16, font: { fontSize: 20 } });

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

speech.addEventListener('completed', () => {
  label.attributedString = Ti.UI.createAttributedString({ text: TEXT, attributes: [] });
});

speech.startSpeaking({ text: TEXT, voice: 'en-US', bestVoice: true });
```

The same code runs on both platforms. The demo app under `ios/example` and `android/example` does the same with a toggle.

### Save a speech and play it back

```javascript
const speech = utterance.createSpeech();

speech.addEventListener('synthesized', (e) => {
  if (!e.success) {
    Ti.UI.createAlertDialog({ title: 'Could not save', message: `${e.code}: ${e.message}` }).show();
    return;
  }
  console.log(`Saved ${e.duration.toFixed(1)} s at ${e.sampleRate} Hz`);
  const sound = Ti.Media.createSound({ url: e.file.indexOf('file') === 0 ? e.file : 'file://' + e.file });
  sound.addEventListener('complete', () => sound.release());
  sound.play();
});

speech.synthesizeToFile({
  voice: 'en-US',
  file: Ti.Filesystem.applicationDataDirectory + 'sentence.wav',
  text: 'This sentence is saved to a file and then played back.'
});
```

### Announcements in two languages with a pause

One `completed` marks the end of the whole queue, so the screen can react once:

```javascript
speech.addEventListener('completed', (e) => {
  if (e.success) {
    banner.hide();
  }
});

banner.show();
speech.startSpeaking({ text: 'Attention, please. Table three has won.', voice: 'en-US' });
speech.playSilence(500, { queue: true });
speech.startSpeaking({ text: 'Atención. La mesa tres ganó.', voice: 'es-MX', queue: true });
```

### A spoken prompt over music

```javascript
function announce(text) {
  speech.startSpeaking({
    text,
    voice: 'en-US',
    audioFocus: true,          // Android: lower the music while it speaks
    audioUsage: 'assistant'    // iOS: spoken audio session. Android: assistant attributes
  });
}

announce('Recording saved.');
```

### A game that speaks on every tap

Each call cuts off the previous one, so a quick succession of taps always says the last. When the first word must be heard at once after a pause, turn the speaker wake off:

```javascript
const speech = utterance.createSpeech();

function call(card) {
  speech.startSpeaking({
    text: card,
    voice: 'es-MX',
    bestVoice: true,
    speakerWakeDelay: 0    // iOS: start without the 0.2 s lead-in
  });
}
```

### Speech in both directions

Speech recognition and synthesis share one microphone and one speaker, so stop listening before speaking. The [speech-to-text guide](speech_to_text.md#integration-with-text-to-speech) has a conversation example.

## Differences between platforms

| Area                                | iOS                                                   | Android                                                                        |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Engine                              | AVSpeechSynthesizer                                   | android.speech.tts.TextToSpeech                                                |
| Rate range                          | 0 to 1                                                | 0.1 to 3                                                                       |
| `voice`                             | A language code, or `auto` to detect it from the text | A language code or an engine voice name                                        |
| `getModernVoices()`                 | `name`, `language`, `identifier`, numeric `quality`   | `name`, `locale`, `language`, `country`, `quality` up to 500                   |
| Pause                               | Native, immediate or at the next word                 | Emulated: cuts at once and repeats the word that was cut. Needs word positions |
| `wordstart`                         | Always                                                | Android 8 or later, with an engine that reports ranges                         |
| `pan`                               | Ignored                                               | Works                                                                          |
| Long text                           | No limit                                              | Cut into sentences above 4000 characters                                       |
| SSML, IPA, markers, Personal Voice  | Yes                                                   | No                                                                             |
| Earcons and prerecorded audio       | `unsupported`                                         | Yes                                                                            |
| `speakerWakeDelay`, `warmUp()`      | Yes                                                   | Ignored. The engine warms up on its own                                        |
| `stopSpeaking()`                    | Fires `stopped`, then `canceled`                      | Fires `stopped`. `cancelSpeaking()` fires `canceled`                           |
| `playSilence()`                     | Fires `started` and `completed`                       | Fires neither and does not count as speaking                                   |
| `initialized` event, engine methods | No                                                    | Yes                                                                            |

## Performance and the speaker

- The first speech after the app opens can take up to two seconds to sound on iOS while the engine starts. Creating the proxy early pays that cost with a silent speech. See [Warm-up](#warm-up).
- The first speech of a session with `bestVoice: true` searches the installed voices, which costs 110 to 200 ms once per language.
- After a pause longer than 1.8 seconds, the iPad's built-in speaker needs a wake that adds 0.3 to 0.4 seconds. See [Speaker wake](#speaker-wake-speakerwakedelay).
- On Android, `getModernVoices()` and the engine methods wait for the engine on the calling thread. Use `requestVoices()` from a tap.
- Cache what you read from `requestVoices()`. The list changes only when the user installs or removes a voice, and `voiceschanged` tells you on iOS.

## Best practices

1. Create the proxy once, at startup, and keep it in a module level constant. See [Keep a reference to the proxy](#keep-a-reference-to-the-proxy).
2. Add the listeners before the first call. An event fires only when a listener exists at that moment.
3. Use the rate constants and the `voiceId` of `requestVoices()`, so the same code runs on both platforms.
4. Decide from `event.code` in `completed`, and show the text when speech is not available.
5. Pass `bestVoice: true` when the user has not picked a voice.
6. Use `queue: true` to say several parts in order, and `playSilence()` for pauses between them.
7. Call `requestVoices()` for pickers. On Android `getModernVoices()` can freeze a tap while the engine connects.
8. Test speech on the speaker as well as with headphones. The speaker wake applies only there.

## Tested and not tested

### What was compiled but not tried

These are in the code and were not run on a device: Android 12 and earlier; any speech engine on Android other than Google's, including whether it reports word positions; the Android engine error `ERROR_NOT_INSTALLED_YET`, which is reported as `language_unavailable`; Personal Voice with authorization granted and a voice created (the iPad used for testing was in `denied`); `voiceschanged`; phoneme markers (a `<phoneme>` tag produced none, and a `bookmark` marker arrived with the range 0 to 0); SSML and `markers: true` on iOS 15 and 16; IPA pronunciations (accepted, not listened to); the order of markers against the last audio buffer; `audioUsage` on iOS beyond the audio session category it sets. Pan on Android has not been listened to; volume at 30% was, on an OPPO.

### What is left out

`outputChannels` (it needs session objects Titanium cannot build), the raw stream of audio buffers (`synthesizeToFile()` covers it without sending megabytes through events), `setOnUtteranceCompletedListener` and `areDefaultsEnforced` (obsolete on Android), and the macOS-only Alex voice identifier.

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
