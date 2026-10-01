# Changelog

All notable changes to Utterance are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Both platforms: `taskHint`, `contextualStrings`, `onDevice` (`true`, `false` or `'prefer'`), `punctuation`, `partialResults` and `audioLevelInterval` options for `startSpeechToText()`, and `segments` and `alternatives` to add detail to `completed`. An option a platform has no equivalent for is ignored there.
- Both platforms: `partial`, `speechstart`, `speechend`, `audiolevel` and `canceled` events, and `cancelRecording()`, which drops a session without firing `completed`.
- Both platforms: `requestPermissions()` and `getPermissionStatus()`, `isAvailable()`, `supportsOnDevice()`, and `requestSupportedLanguages()` with its `languages` event.
- Both platforms: `transcribeFile()`, and `appendAudio()` with `audioSource: 'buffer'`, to transcribe audio that does not come from the microphone. Android needs Android 13 for them and converts the audio to 16 kHz mono.
- Both platforms: failures in `completed` carry a stable `code` (`no_speech`, `permission_denied`, `network`, `language_unsupported`, and more, with constants such as `ERROR_NO_SPEECH`) and the platform's `nativeCode`. `started` and `completed` carry `language` and `source`.
- iOS: `metadata` and `voiceAnalytics` in `completed`, `customLanguageModel` and `prepareCustomLanguageModel()` (iOS 17), `getState()`, and the `audioduration` and `availability` events.
- Android: `detectLanguage`, `allowedLanguages`, `switchLanguages`, `maxLanguageSwitches`, `languageSwitchInitialDuration`, `maskOffensiveWords`, `segmentedSession`, `minimumLength` and `biasDeviceContext` options, `downloadLanguage()`, and the `segmentresult`, `languagedetected` and `download` events.
- The demo apps use the new API in the Listen tab: `requestPermissions()`, live text in grey, a command acted on as soon as a partial contains it, an orb that follows `audiolevel`, the languages that work without the network, an Options card and error text chosen by `code`.
- The demo apps follow the system's light or dark mode: their colors are semantic names defined in a new `semantic.colors.json` next to `app.js` (copy both to `Resources`). On Android the action bar with the app name no longer shows, because the app draws its own header. The README has screenshots of both tabs.

### Changed
- iOS: `maxResults` limits `words` and `languageModel` selects the task hint. Before, iOS ignored both.
- iOS: an unsupported `language` fails with `language_unsupported`. Before, the recognizer was created with no locale and failed later.
- iOS: events fire right after the call that causes them returns, not inside it, as on Android. A call that answers at once, such as `requestPermissions()` with the permissions already granted, used to fire before the caller could wait for the event.
- iOS: a failure closes the microphone and the recognition task before `completed` fires, so a handler that starts a new session finds the module idle.
- Android: results that arrive from a recognizer that was already replaced or canceled are ignored.

### Fixed
- Documentation: the minimum Android version is 7.0 (API 24), the minimum of Titanium SDK 13.4.1. The README and the guides said 5.0 (API 21).
- iOS: calling `startSpeechToText()` while the permission prompt was open started two sessions.
- iOS: a failure after the task started (for example the audio engine failing to start) left the recognition task running.
- iOS: `isAvailable()` and `supportsOnDevice()` return booleans.

### Testing
- iOS: an iPad (9th generation) with iOS 27, speaking Spanish and English. Tried: permissions already granted, `getPermissionStatus()`, `isAvailable()`, `supportsOnDevice()`, `getNativeAudioFormat()`, `requestSupportedLanguages()` (62 languages in 404 ms), `cancelRecording()` while idle, mid-sentence and before `started`, a session after a cancel, `transcribeFile()` with a file, a relative path and a blob in wav, m4a and mp3, `appendAudio()` with a buffer, `partial`, `audiolevel`, `audioduration`, `speechstart`, `speechend`, `no_speech`, `language_unsupported`, `invalid_file`, `onDevice: true`, `segments`, `metadata`, `voiceAnalytics`, `punctuation` and `contextualStrings` (the speech "el chonchito" came back as "El chanchito" without the option and "El chonchito" with it), and the demo apps' Listen tab. Starting a session blocks the main thread for about 130 ms (303 ms the first time). Not tried: `customLanguageModel`, `prepareCustomLanguageModel()`, the `availability` event, interruptions such as a call, the permission prompt itself, `alternatives` with content, `getState()` during a session, `onDevice: 'prefer'` and `taskHint`.
- iOS: `speechstart` and `speechend` come from the module. The system documents callbacks for them, but on the iPad neither was called, so `speechstart` fires with the first recognized text and `speechend` when the module ends the audio.
- Android: an OPPO CPH2639 with Android 16 and the Google recognizer, speaking Spanish and English. Tried: `requestPermissions()`, `getPermissionStatus()`, `requestSupportedLanguages()` (31 languages), `cancelRecording()` while idle, mid-sentence and before `started`, a session after a cancel, `transcribeFile()` with a file, a relative path and a blob in wav, m4a (22.05 kHz) and mp3, `appendAudio()` with a buffer, `partial`, `audiolevel`, `speechstart`, `speechend`, `no_speech`, `invalid_file`, `onDevice: true` (it reports `language_unsupported` and `language_unavailable`, because no local model is installed for `es-MX` or `en-US`) and `onDevice: 'prefer'` falling back to the network. The recognizer accepted `contextualStrings`, `punctuation`, `segments`, `alternatives`, `segmentedSession`, `minimumLength`, `detectLanguage`, `switchLanguages`, `maskOffensiveWords` and `biasDeviceContext` and showed no effect from any of them (the log shows the extras reaching it). Audio sent through `transcribeFile()` or `appendAudio()` got an empty final result, so `completed` uses the last `partial` text and `confidence` is 0. Not tried: `downloadLanguage()`, an on-device session with an installed model, Android 12 and earlier, other recognizers.
- Not tried on either platform: the changes on Android 12 and earlier (`onDevice` as a preference, `requestSupportedLanguages()` reporting `checked: false`).

## [4.0.0] - 2026-09-30

### Added
- iOS: speech-to-text is supported and documented. `startSpeechToText()` listens live from the microphone through `SFSpeechRecognizer`, and `stopRecording()` ends the audio.
- Android: `stopRecording()`, a `language` option (for example `es-MX`), and `text` and `confidence` fields in `completed`. `started` fires when the microphone is open.
- iOS: a session now ends by itself after a pause, as on Android. Before, it listened until `stopRecording()` was called.
- Both platforms: new `silenceTimeout` (seconds of silence after speech) and `noSpeechTimeout` (seconds to wait for speech) options; 0 turns either one off. iOS defaults to 2 and 6 seconds. On Android, without the options the recognizer decides. With them, the module passes the silence length to the recognizer as a hint and also ends the session itself, so a shorter value always applies.
- Both platforms: `completed` delivers `{ success, text, confidence, words, wordCount, detectedInput }`, or `{ success: false, message, detectedInput: false, wordCount: 0, words: [] }` on failure. `words` lists the alternative transcriptions, best first, and `wordCount` counts them.
- `CHANGELOG.md`, which replaces the "What's new" section of the README.

### Changed
- Android, breaking: `startSpeechToText()` listens inside the app with `SpeechRecognizer` instead of opening the system's voice dialog, so the app shows its own indicator. `promptText` has no effect and `completed` no longer includes `requestCode`.
- Android, breaking: the app must have `android.permission.RECORD_AUDIO` granted before the first call (`Ti.Android.requestPermissions()`). Without it, `completed` reports `success: false` and `message: "Microphone permission not granted"`.
- Android, breaking: silence or an unrecognized phrase reports `success: false` with `message: "Recognition error: No speech detected"`, like iOS. Before, the dialog returned `success: true` with `detectedInput: false`.
- Android: `isSupported()` asks `SpeechRecognizer.isRecognitionAvailable()`, and the module declares `<queries>` for `android.speech.RecognitionService`, which Android 11 and later need to find the recognizer.
- iOS: the default language is the system language when `SFSpeechRecognizer` supports it (same region first, then any region of that language), and `en-US` otherwise. Before it was always `en-US`. The `language` option still overrides it.
- Example apps: `android/example/app.js` and `ios/example/app.js` (identical) were rewritten as a demo with a Speak tab and a Listen tab. The Speak tab lists only the languages that have an installed voice.

### Fixed
- iOS: `stopRecording()` canceled the recognition task, so `completed` arrived with an empty `text`, followed by a second `completed` with `Recognition request was canceled`, so the transcript was lost. It now ends the audio and waits for the final result.
- iOS: after a listening session, text-to-speech stayed silent. The module switched the app's audio session to the Record category, which does not play sound, and never switched it back. It now restores the previous category when the session ends.
- iOS: `stopRecording()` left the microphone tap installed, so a second `startSpeechToText()` raised `nullptr == Tap()` and the app showed an error screen.
- iOS: without an audio input (a Simulator without a microphone, or a microphone another app holds) `startSpeechToText()` raised an exception. `completed` now reports `success: false` and `message: "No audio input available"`.
- Documentation: the event tables did not list `stopped`, which `stopSpeaking()` fires on both platforms. `completed` never carried `results` on Android; it carries `words`. Speech-to-text has no `error` event: errors arrive in `completed` with `success: false`. The README, the guides and the examples said otherwise and are corrected. `documentation/speech_to_text.md` was rewritten.

### Testing
- iOS: one iPad (9th generation), speaking Spanish (`es-MX`). The automatic end after a pause and text-to-speech playing after a listening session were verified there; the 6 second no-speech timeout and a custom `silenceTimeout` were not. Not tested: other devices or languages, on-device recognition, and accuracy against other engines. The module does not set `requiresOnDeviceRecognition` or `addsPunctuation`, so the text has no punctuation and the audio may go to Apple's servers.
- Android: one OPPO CPH2639 (Android 16) with the Google recognizer, speaking Spanish (`es-MX`) and English (`en-US`). Verified: no system dialog, the runtime permission flow, `started` and `completed` with `text` and `words`, silence reported as `No speech detected`, and `stopRecording()` ending a session early. The `confidence` value was constant (0.948) for Spanish results. Not tested: the `silenceTimeout` and `noSpeechTimeout` options, other devices, recognizers, or offline packs.
- Example apps: checked on the iPad and the OPPO, and on an iOS 27 Simulator for the layout only (with simulated events). The list of installed languages was not checked on screen.

## [3.3.0] - 2026-09-29
- iOS now requires Titanium SDK 13.0.0, like Android. SDK 12.x lets an app target iOS 13, but the module is built for iOS 15.0, which SDK 13.x already requires.
- No API changes.

## [3.2.0] - 2026-09-29
- Android: `startSpeaking()`, `stopSpeaking()`, `cancelSpeaking()`, `preloadVoiceData()`, `setEngine()` and the initial voice setup run on a background thread. Android's `TextToSpeech` blocks while it connects to the engine, and on the main thread that wait was reported as `Input dispatching timed out`.
- Android: `isSpeaking` reads a flag instead of asking the engine. Only the last utterance queued moves it, so a finished earlier one cannot turn it off.
- `requestVoices()` delivers the installed voices in a `voices` event, with the same shape on both platforms: `{ id, name, language, quality }`. Android skips voices that need a network or are not downloaded; iOS skips novelty voices.
- New `startSpeaking()` options: `voiceId` (an `id` from the `voices` event; falls back to `voice` if that voice is gone), `bestVoice` (highest-quality installed voice for `voice`, same region first) and `queue` (add the text after the one being spoken instead of cutting it off; `completed` fires once, when the queue ends).
- iOS: `voice: 'es_MX'` is accepted as `es-MX`, and out-of-range `rate`, `pitchMultiplier` and `volume` values are now rejected; before, the range check always passed.
- The iOS deployment target is 15.0, the minimum of Titanium SDK 13.4.1 and of current Xcode.

## [3.1.0]
- Speech starts as soon as the engine is initialized; the 100 ms warm-up is gone.
- Flags are reset in one place, which cuts about 89 % of the atomic operations per utterance.
- Removed the unused `reset()` method and the old readiness checks.
- Fast sequences, such as reading cards one after another, no longer drop utterances, because cancellation takes fewer steps.

## [3.0.0]
### Breaking changes
- Requires iOS 11+, Android 5.0 (API 21)+ and Titanium SDK 12.7.0+. iOS 7 to 10, Android 4.x and older SDKs are no longer supported.
- The module was rewritten with more voice control and voice quality detection. Old workarounds were removed to make it faster.

### Features
- The same `rate` value sounds equally fast or slow on iOS and Android.
- Voice information includes a quality value.
- Better language detection and availability checks.
- An automatic warm-up keeps Android from losing the first utterance.
- Method, property and event names are the same on both platforms.
- `isSpeaking` works as a property and as `isSpeaking()` on both platforms.
- Built for current iOS and Android versions.

[Unreleased]: https://github.com/macCesar/Utterance/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/macCesar/Utterance/compare/v3.3.0...v4.0.0
[3.3.0]: https://github.com/macCesar/Utterance/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/macCesar/Utterance/releases/tag/v3.2.0
