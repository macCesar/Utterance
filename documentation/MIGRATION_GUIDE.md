# Utterance v4.1: migration and optimization guide

Upgrade notes for Utterance, from 2.x to 3.1, from 3.1 to 3.2, from 3.2 to 3.3, from 3.3 to 4.0, from 4.0 to 4.1 and from 4.1 to 4.2.

## Upgrading from 4.1 to 4.2

4.2 adds options, events and methods for text-to-speech. Steps 2 to 4 cover what behaves differently on iOS and step 5 what changes on Android.

1. Install the 4.2.0 packages (`bencoding.utterance-iphone-4.2.0.zip`, `bencoding.utterance-android-4.2.0.zip`) and set `version="4.2.0"` in `tiapp.xml`.
2. On iOS, `startSpeaking()` without `queue: true` now cuts off what is speaking and speaks the new text, as Android always did. Before, the new call was ignored with "Already speaking". If your code relied on the old behavior, check `isSpeaking()` before the call, or pass `queue: true` to speak after the current text.
3. On iOS, a speech that starts after the built-in speaker has been idle for more than 1.8 seconds begins 0.3 to 0.4 seconds later: the module plays 0.2 seconds of silence first, to avoid a click from the speaker starting cold. Speeches that follow each other and speech through headphones start at once. Pass `speakerWakeDelay: 0` to restore the previous timing.
4. iOS now fires `error`, the event the guide and Android use, with `{ error, message, code }`. A listener on `error` never ran on iOS before. `errored` still fires. A failure also arrives in `completed` with `success: false` and a `code`.
5. On Android, a call that is refused before it is queued (an empty text, an engine that has not started) now fires `completed` with `success: false` and a `code`, and then `error`, as iOS does. Before it fired only `error`, so a handler that waits for `completed` never ran.
6. Keep the proxy in a constant at the top of a module. If `createSpeech()` runs inside a function that finishes and nothing else holds the result, JavaScript can collect the proxy and its events stop. See [text_to_speech.md](text_to_speech.md#keep-a-reference-to-the-proxy).
7. Optional: use `wordstart` to highlight the text as it is spoken, `synthesizeToFile()` to get the audio as a WAV file, and `volume` on Android. The full list is in [text_to_speech.md](text_to_speech.md#new-in-v42).

## Upgrading from 4.0 to 4.1

Nothing from 4.0 has to change. 4.1 adds options, events and methods for speech-to-text.

1. Install the 4.1.0 packages (`bencoding.utterance-iphone-4.1.0.zip`, `bencoding.utterance-android-4.1.0.zip`) and set `version="4.1.0"` in `tiapp.xml`.
2. Optional: replace `Ti.Android.requestPermissions()` with `requestPermissions()`, which works on both platforms, and read `event.code` instead of matching `event.message`.
3. Three things behave differently on iOS: `maxResults` now limits `words` (it did nothing), an unsupported `language` fails with `language_unsupported`, and events fire right after the call returns instead of inside it. See [speech_to_text.md](speech_to_text.md#behavior-changes-from-40).

## Upgrading from 3.3 to 4.0

Speech-to-text changes on both platforms. Text-to-speech is not affected.

1. Install the 4.0.0 packages (`bencoding.utterance-iphone-4.0.0.zip`, `bencoding.utterance-android-4.0.0.zip`) and set `version="4.0.0"` in `tiapp.xml`.
2. `startSpeechToText()` no longer opens the system's voice dialog; it listens inside the app with `SpeechRecognizer`. Show your own indicator while it listens (a button that changes state works) and call `stopRecording()` when the user is done.
3. Request `android.permission.RECORD_AUDIO` at runtime before the first call, with `Ti.Android.requestPermissions()`. Without it, `completed` reports `success: false` and `message: "Microphone permission not granted"`.
4. `promptText` has no effect anymore, and `completed` no longer includes `requestCode`.
5. Silence or an unrecognized phrase now arrives as `success: false` with `message: "Recognition error: No speech detected"`. Before, it arrived as `success: true` with `detectedInput: false`.
6. Read the transcript from `event.text` (best result, with `event.confidence`) or `event.words` (all alternatives, best first). `event.results` never existed on Android, and speech-to-text has no `error` event: errors arrive in `completed`.
7. On iOS, speech-to-text now works and follows the same API: listening starts with `startSpeechToText()`, ends with `stopRecording()`, and the default language is the system language. See [speech_to_text.md](speech_to_text.md).

## Upgrading from 3.2 to 3.3

1. Install the 3.3.0 packages (`bencoding.utterance-iphone-3.3.0.zip`, `bencoding.utterance-android-3.3.0.zip`).
2. iOS apps need Titanium SDK 13.0.0 or later, as Android apps already did. Nothing else changes.

## Upgrading from 3.1 to 3.2

Nothing that worked in 3.1 needs to change; 3.2 adds options and fixes.

1. Install the 3.2.0 packages (`bencoding.utterance-iphone-3.2.0.zip`, `bencoding.utterance-android-3.2.0.zip`) and pin `version="3.2.0"` in `tiapp.xml` if more than one version sits in `modules/`.
2. The minimum iOS deployment target is now 15.0.
3. Android ANRs: if Google Play reports `Input dispatching timed out` with `SpeechProxy.stopSpeaking` or `TextToSpeech.runAction` in the main thread, 3.2 fixes it: no engine call runs on the main thread anymore. No app changes needed.
4. Voice pickers: replace `getModernVoices()` calls made from the UI with `requestVoices()` and its `voices` event, and pass the chosen voice's `id` as `voiceId`.
5. Optionally, use `bestVoice: true` for the best installed voice of a language, and `queue: true` to chain utterances without a gap. See [text_to_speech.md](text_to_speech.md).

## 1. Upgrade checklist for 3.1

1. Install the 3.1.0 packages for iOS (`bencoding.utterance-iphone-3.1.0.zip`) and Android (`bencoding.utterance-android-3.1.0.zip`).
2. Raise the minimums to Titanium SDK 12.7.0+, iOS 11+ and Android 5.0 (API 21)+.
3. Replace 2.x helpers (e.g. `setPitch`, platform checks) with the API shown below.
4. For STT, add the microphone usage descriptions to `tiapp.xml`.
5. Remove custom TTS warm-up delays and extra reset logic; 3.1 handles both.

## 2. API by platform

Since v3.0, iOS and Android share the same API. v3.1 keeps it and simplifies the internals.

| Feature / Method                               | Availability | Notes                                                                                  |
| ---------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `createSpeech()`                               | iOS, Android | Creates a text-to-speech instance.                                                     |
| `createSpeechToText()`                         | iOS, Android | Returns a speech recognition proxy.                                                    |
| `speech.startSpeaking()`                       | iOS, Android | Accepts `text`, `voice`, `language`, `rate`, `volume` on both platforms.               |
| `speech.stopSpeaking()`                        | iOS, Android | Stops immediately; since 3.1 it resets only the flags that need it.                    |
| `speech.cancelSpeaking()`                      | iOS, Android | Cancels the current utterance and clears its state.                                    |
| `speech.isSpeaking` / `speech.isSpeaking()`    | iOS, Android | The property and the method always return the same value.                              |
| `speech.getModernVoices()`                     | iOS, Android | Returns voice metadata: name, locale, quality, whether it needs a network.             |
| `speechToText.startSpeechToText()`             | iOS, Android | Emits `started` and `completed`; failures arrive in `completed` with `success: false`. |
| Rate constants (`VERY_SLOW_SPEECH_RATE`, etc.) | iOS, Android | Sound equally fast on both platforms.                                                  |

Event names match on both platforms: `initialized`, `started`, `stopped`, `canceled`, `completed`, `error`, and since 3.2 `voices`.

## 3. Performance changes in v3.1

- Speech begins as soon as the engine emits `initialized`; the 100 ms Android warm-up delay is gone.
- `_isStopping`, `_isCanceling` and `_currentUtteranceId` reset only when needed, with about 89 % fewer atomic operations than the defensive code in 2.x.
- The deprecated `reset()` helper and the readiness checks (`isReadyForSpeech()`) were removed and folded into `startSpeaking()`.
- Fast stop/cancel/start sequences (card games, notification streams) no longer drop utterances.
- Speech recognition uses the same initialization and permission flow and reports clearer diagnostics.

## 4. Migrating from Utterance 2.x

1. Drop the iOS/Android conditionals around speaking and rate selection.
2. Move `setLocale`, `setPitch` and similar setters into the `startSpeaking` options dictionary.
3. Use the rate constants instead of raw numbers.
4. Start speaking after the `initialized` event, and remove custom warm-up timers.
5. For STT, use `createSpeechToText()` and its events; the old `startRecognition` helpers are not needed.

## 5. Testing checklist

- Call `speech.startSpeaking()` three times in quick succession (stop, then start) and check that no audio is skipped.
- Run `tests/test_fast_cancel_start.js` and `tests/test_rapid_card_speech.js`, included in the repo, to check fast sequences.
- Check what `speechToText.startSpeechToText()` does when the microphone permission is denied, on both platforms.
- Capture logs for `initialized`, `started`, `stopped`, `completed`, and `error` events on both platforms.

## 6. More resources

- [`documentation/text_to_speech.md`](text_to_speech.md): text-to-speech guide.
- [`documentation/speech_to_text.md`](speech_to_text.md): speech-to-text guide for iOS and Android.
- `examples/`: Alloy and CommonJS examples you can run.
- `tests/`: console diagnostics for catching performance regressions.

The older guides merged into this one are in the Git history.
