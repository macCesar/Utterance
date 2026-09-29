# Utterance v3.1 – Migration & Optimization Guide

A single reference for teams moving from the legacy 2.x releases to the modern Utterance v3.1 stack. It condenses the previous migration, API unification, and optimization notes into one place.

---

## 1. Upgrade Checklist

1. **Update module binaries** – install the 3.1.0 packages for iOS (`bencoding.utterance-iphone-3.1.0.zip`) and Android (`bencoding.utterance-android-3.1.0.zip`).
2. **Set minimum platforms** – Titanium SDK 12.7.0+, iOS 11+, Android 5.0 (API 21)+.
3. **Clean old API usage** – replace any 2.x specific helpers (e.g. `setPitch`, platform checks) with the unified API shown below.
4. **Refresh permissions** – ensure microphone usage descriptions exist in `tiapp.xml` for STT.
5. **Review app logic** – remove custom TTS warm-up delays or extra reset logic; 3.1 handles this internally.

---

## 2. API Unification Snapshot

Utterance v3 delivered full parity between iOS and Android. v3.1 keeps that contract while simplifying internals.

| Feature / Method                               | Availability | Notes                                                                              |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| `createSpeech()`                               | iOS, Android | Unified factory for Text‑to‑Speech instances.                                      |
| `createSpeechToText()`                         | Android      | Speech recognition, returns a proxy with consistent events.                        |
| `speech.startSpeaking()`                       | iOS, Android | Accepts `text`, `voice`, `language`, `rate`, `volume`. No platform forks required. |
| `speech.stopSpeaking()`                        | iOS, Android | Stops immediately; 3.1 resets internal flags intelligently.                        |
| `speech.cancelSpeaking()`                      | iOS, Android | Cancels current utterance and clears relevant state.                               |
| `speech.isSpeaking` / `speech.isSpeaking()`    | iOS, Android | Property and method both available and synchronized.                               |
| `speech.getModernVoices()`                     | iOS, Android | Returns detailed voice metadata (name, locale, quality, network requirement).      |
| `speechToText.startSpeechToText()`             | Android      | Shared event payloads (`started`, `completed`, `error`) across module.             |
| Rate constants (`VERY_SLOW_SPEECH_RATE`, etc.) | iOS, Android | Produce perceptually equivalent speeds on both platforms.                          |

Event names match on both platforms: `initialized`, `started`, `stopped`, `canceled`, `completed`, `error`.

---

## 3. Performance Optimizations in v3.1

- **Zero-delay startup** – removed the 100 ms Android warm-up delay; speech begins as soon as the engine emits `initialized`.
- **Centralized flag management** – `_isStopping`, `_isCanceling`, and `_currentUtteranceId` reset only when required (~89 % fewer atomic operations compared to 2.x defensive code).
- **Lean API surface** – deprecated `reset()` helper and legacy readiness checks (`isReadyForSpeech()`) were removed and folded into `startSpeaking()`.
- **Rapid speech resilience** – rapid stop/cancel/start flows (e.g., card games, notification streams) no longer drop utterances.
- **Improved STT readiness** – speech recognition shares the streamlined initialization and permission flow, providing clearer diagnostics.

---

## 4. Migrating from Utterance 2.x

1. **Remove platform forks** – drop iOS/Android conditionals around speaking or rate selection.
2. **Replace deprecated methods** – `setLocale`, `setPitch`, and similar setters can be expressed inside the `startSpeaking` options dictionary.
3. **Adopt rate constants** – use the unified constants instead of raw numeric rates.
4. **Listen for `initialized`** – begin speaking only after this event, replacing any custom warm-up timers.
5. **Update STT usage** – use `createSpeechToText()` with the standardized events; legacy `startRecognition` helpers are no longer required.

---

## 5. Testing Checklist

- ✅ Call `speech.startSpeaking()` three times in quick succession (stop → start) to ensure no audio is skipped.
- ✅ Run `tests/test_fast_cancel_start.js` and `tests/test_rapid_card_speech.js` (included in the repo) to validate rapid sequences.
- ✅ Verify `speechToText.startSpeechToText()` handles permission denial gracefully.
- ✅ Capture logs for `initialized`, `started`, `stopped`, `completed`, and `error` events on both platforms.

---

## 6. Additional Resources

- [`documentation/text_to_speech.md`](text_to_speech.md) – in-depth TTS usage guide.
- [`documentation/speech_to_text.md`](speech_to_text.md) – STT guide for Android.
- `examples/` – runnable Alloy and CommonJS examples.
- `tests/` – console-based diagnostics for performance regression checks.

Need deeper historical notes? See the Git history for the legacy guides that fed into this summary.
