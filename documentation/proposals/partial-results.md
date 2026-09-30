# Proposal: partial results for speech-to-text

Proposal, nothing implemented yet. Written on 2026-09-30 for a later session.

## Problem

`startSpeechToText()` delivers the transcript once, in `completed`, after the session ends. For voice commands such as "siguiente carta" or "pausa", the app reacts only after the user stops talking and the module waits out the pause.

On an iPad (9th generation), sessions with a short command lasted 4.5 to 5.1 s from `started` to `completed` with the default `silenceTimeout` of 2 s, and 2.7 to 3.5 s with `silenceTimeout: 1`. The app acted only after `completed`. A shorter `silenceTimeout` also cuts sentences that have pauses in them, so the wait cannot shrink to zero that way.

## What already exists

- iOS sets `shouldReportPartialResults = YES` and receives a result every 0.2 to 0.5 s while the user talks (seen in the iPad log of 2026-09-30: "Ya", "Ya no", "Ya no me", and so on). The module uses them only to restart the silence timer and does not pass them on.
- Android asks for partial results (`EXTRA_PARTIAL_RESULTS`) and receives `onPartialResults`. The module also uses them only for the silence timer. Whether the Google recognizer on the test phone (OPPO CPH2639) sends useful text in them was not checked.
- Partial text changes while the recognizer corrects itself: the iPad log went from "Scribd" to "escribís" to "escribiste". A command must be matched on whole phrases, not on single words.

## Proposed API

A new event, `partial`, on both platforms:

```javascript
speechToText.addEventListener('partial', (event) => {
  console.log(event.text) // the best transcription so far
})
```

- The payload is `{ text }`. It fires zero or more times between `started` and `completed`.
- The module fires it only when the app has a listener, so apps that do not use it pay nothing.
- `completed` still fires once at the end, with the final transcript.
- iOS: fire it in the recognition result handler for results that are not final and have text.
- Android: fire it in `onPartialResults`, with the first alternative.

## Example app change

In the Listen tab, match the commands ("next card", "pause", "repeat" and their Spanish forms) on each partial, light the tile at once, and end the session with `stopRecording()`.

## Open questions

- Whether the session needs a way to discard its result, for an app that has already acted on a partial and does not want `completed` to repeat the command. Today it would call `stopRecording()` and ignore the `completed` that follows.
- Whether Android should also pass the alternatives, as `completed` does with `words`.

## Not in scope

Listening all the time. It keeps the microphone open, drains the battery, and needs a visible indicator. A push-to-talk button with partial matching covers the same use.

## How to verify

- A real iOS device with a microphone (the iOS Simulator has none) and an Android device.
- Log the time of each `partial` against the time the user finishes a phrase. The goal is a reaction within a fraction of a second of the last word.
- Check that `completed` still arrives once, with the full text, after the app calls `stopRecording()` from a `partial` handler.
- Update `README.md`, `documentation/speech_to_text.md`, `CHANGELOG.md` and both `example/app.js` files in the same change.
