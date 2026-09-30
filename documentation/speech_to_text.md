# Utterance v4.0: Speech to Text
### Voice recognition for Titanium iOS and Android apps

Utterance listens to the microphone inside the app and delivers the transcript in an event. It uses `SFSpeechRecognizer` on iOS and `android.speech.SpeechRecognizer` on Android. Neither platform opens a system dialog, so the app shows its own indicator while it listens. The examples use ES6+.

## Requirements (v4.0)
* Titanium SDK 13.0.0+ (the minimum in `android/manifest` and `ios/manifest`)
* iOS 15.0+ (the module's deployment target)
* Android 5.0+ / API level 21+

## What's new

### v4.0
- iOS: speech-to-text is supported and documented. The default language is the system language.
- Android: `startSpeechToText()` listens inside the app instead of opening the system's voice dialog, needs `RECORD_AUDIO` granted at runtime, and has a new `stopRecording()`.
- Both platforms: the same `completed` payload, with `text`, `confidence`, `words`, `wordCount` and `detectedInput`. Failures arrive in `completed` with `success: false`.
- This guide was rewritten: it described an `error` event and a `results` field that the module never had. See the [changelog](../CHANGELOG.md) and the [migration guide](MIGRATION_GUIDE.md) for the full list.

### v3.1
- Faster readiness checks: initialization follows the same path as TTS, so fewer retries happen before listening starts.
- Clearer feedback when the user denies microphone access.
- Event payloads have the same shape across the module, which makes troubleshooting easier.

### v3.0
- Updated for current Android versions and Titanium SDK 12.7.0+, using newer Android APIs.
- Better reporting of and recovery from recognition errors.
- ES6+ examples.
- A consistent event system.
- All v2.x APIs work unchanged.

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

iOS asks for the microphone and speech recognition permissions the first time `startSpeechToText()` runs. Android does not: the app must have `RECORD_AUDIO` granted before the first call, or `completed` reports `success: false` with `message: "Microphone permission not granted"`.

```javascript
function ensureMicrophone(callback) {
  if (Ti.Platform.osname !== 'android' || Ti.Android.hasPermission('android.permission.RECORD_AUDIO')) {
    callback(true);
    return;
  }
  Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], (e) => callback(e.success));
}
```

## Working with speech-to-text

### Creating an instance

```javascript
const speechToText = utterance.createSpeechToText();

if (!speechToText.isSupported()) {
  console.warn("Speech-to-Text not supported on this device");
  // Offer another way to type or choose
}
```

## API methods

### `startSpeechToText(options?)`

Starts listening. The `started` event fires when the microphone is open and `completed` fires once, when recognition ends. The session ends by itself after a pause; `silenceTimeout` and `noSpeechTimeout` adjust how long. Calling it while it is already listening does nothing.

| Option          | Platform     | Description                                                                              |
| --------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `language`      | iOS, Android | BCP 47 tag such as `es-MX`. Default: the system language on iOS (when `SFSpeechRecognizer` supports it, otherwise `en-US`) and the device language on Android |
| `languageModel` | Android      | `speechToText.LANGUAGE_MODEL_FREE_FORM` (default) or `speechToText.LANGUAGE_MODEL_WEB_SEARCH`, passed to the recognizer |
| `maxResults`    | Android      | How many alternative transcriptions to ask for (default 10)                              |
| `silenceTimeout` | iOS, Android | Seconds of silence after speech before the session ends. Default on iOS: 2. On Android the recognizer decides unless you set it. 0 turns it off |
| `noSpeechTimeout` | iOS, Android | Seconds to wait for speech to start before ending with `No speech detected`. Default on iOS: 6. On Android the recognizer decides unless you set it. 0 turns it off |
| `promptText`    | none         | No effect. Older versions showed it in the system dialog, which no longer opens          |

For short commands such as "next card", `silenceTimeout: 1` ends the session about a second after the user stops talking. Keep `noSpeechTimeout` at 5 or more: people need a moment to start talking after the tap, and on an iPad a value of 3 cut sentences that had just begun.

### `stopRecording()`

Ends the audio. Recognition does not stop at once: `completed` arrives a moment later with the transcript of everything said so far. Call it from a "done" button, or after your own timeout.

### `isSupported()`

Whether the platform has speech recognition. On Android it asks `SpeechRecognizer.isRecognitionAvailable()`.

## Events

### `started`

Fires when the microphone is open. Use it to change the button or show a level indicator.

### `completed`

Fires once per session, with a transcript or a failure.

| Field           | Type    | Description                                                                              |
| --------------- | ------- | ---------------------------------------------------------------------------------------- |
| `success`       | Boolean | `true` when recognition ran to the end; `false` on failure                               |
| `text`          | String  | The best transcription, or an empty string                                               |
| `words`         | Array   | The alternative transcriptions, best first                                               |
| `wordCount`     | Integer | How many entries `words` has (not how many words `text` has)                             |
| `detectedInput` | Boolean | Whether anything was recognized                                                          |
| `confidence`    | Number  | iOS: the average over the segments of the best transcription. Android: the recognizer's score for it. On one device the Google recognizer returned the same value (0.948) for every Spanish result, so do not rely on it there |
| `message`       | String  | Only with `success: false`                                                               |

On failure the payload is `{ success: false, message, detectedInput: false, wordCount: 0, words: [] }`. There is no separate `error` event.

```javascript
speechToText.addEventListener('started', () => {
  console.log("Listening...");
});

speechToText.addEventListener('completed', (event) => {
  if (!event.success) {
    console.warn(event.message);
    return;
  }
  console.log("Best:", event.text, event.confidence);
  console.log("Alternatives:", event.words);
});
```

### Failure messages

| Message                                                   | Platform     | Cause                                                              |
| --------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `Speech recognition is not supported on this device`      | iOS, Android | No recognizer available                                            |
| `Microphone permission not granted`                       | Android      | `RECORD_AUDIO` is not granted; request it before the first call    |
| `Speech recognition permission denied`                    | iOS          | The user denied the microphone or speech recognition permission    |
| `No audio input available`                                | iOS          | No microphone (a Simulator without one) or another app holds it    |
| `Recognition error: No speech detected`                   | iOS, Android | The user said nothing, or nothing could be matched                 |
| `Recognition error: Network error`                        | Android      | The recognizer could not reach its server                          |
| `Recognition error: Audio recording error`                | Android      | The microphone failed                                              |
| `Recognition error: Recognizer busy`                      | Android      | Another session is still running                                   |
| `Recognition error: Error code N`                         | Android      | Any other `SpeechRecognizer` error code                            |
| `Speech recognizer became unavailable`                    | iOS          | The recognizer went away while listening                           |
| `Audio session error: …`, `Audio engine start error: …`   | iOS          | The audio session or engine could not start                        |
| `Audio engine has no input node`, `Unable to create recognition request` | iOS | Internal setup failed                                     |
| `Unable to start speech recognition: …`                   | Android      | `SpeechRecognizer` threw while starting                            |

## Language support

Pass `language` to listen in a specific language. Without it, iOS uses the system language when `SFSpeechRecognizer` supports it (same region first, then any region of that language) and `en-US` otherwise; Android leaves the choice to the recognizer, which uses the device language.

```javascript
speechToText.startSpeechToText({ language: "es-MX" });
```

On Android, `languageModel` helps the recognizer with short phrases (`LANGUAGE_MODEL_WEB_SEARCH`) or with free speech (`LANGUAGE_MODEL_FREE_FORM`). Which languages work depends on the recognizer installed on the device.

## Practical examples

### Voice commands with a push-to-talk button

A button starts listening and changes while the microphone is open. The alternatives in `words` make matching more forgiving, because the command is sometimes not the first guess.

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

    this.speechToText.addEventListener('completed', (event) => {
      this.listening = false;
      this.button.title = 'Speak';
      if (!event.success || !event.detectedInput) {
        return;
      }
      const heard = event.words.map((text) => text.toLowerCase().trim());
      const match = heard.find((text) => COMMANDS[text]);
      if (match) {
        this.onCommand(COMMANDS[match]);
      }
    });

    this.button.addEventListener('click', () => this.toggle());
  }

  toggle() {
    if (this.listening) {
      this.speechToText.stopRecording();
      return;
    }
    ensureMicrophone((granted) => {
      if (granted) {
        this.speechToText.startSpeechToText({ language: 'es-MX' });
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
    speechToText.startSpeechToText({ language: 'es-MX' });
  }
}));
stopButton.addEventListener('click', () => speechToText.stopRecording());
```

Each session ends with one `completed`. To keep dictating, start another session from the next tap.

## Platform differences

| Topic                   | iOS                                                                        | Android                                                        |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Recognizer              | `SFSpeechRecognizer`                                                       | `SpeechRecognizer`, the recognizer installed on the device     |
| Permissions             | Asked on the first call                                                    | Must be granted before the first call                          |
| End of speech           | The module ends the session after `silenceTimeout` seconds of silence (default 2) | The recognizer decides, and the module ends it earlier if you set `silenceTimeout` |
| Punctuation             | None: the module does not set `addsPunctuation`                            | Up to the recognizer                                           |
| Audio leaves the device | Possible: the module does not set `requiresOnDeviceRecognition`            | Up to the recognizer                                           |
| `languageModel`, `maxResults` | Ignored                                                              | Passed to the recognizer                                       |

## Best practices

### Do
- End every session with `stopRecording()` or let it finish; `completed` always follows.
- Show that the microphone is open from `started` to `completed`.
- Start listening after the text-to-speech `completed` event, so the recognizer does not hear the app's own voice.
- Check `success` and `detectedInput` before using `text`.
- Ask for the microphone permission from a user action, such as the button that starts listening.

### Don't
- Don't restart listening in a loop without a visible indicator and a way to stop it: it keeps the microphone open and drains the battery.
- Don't assume `words` has more than one entry.
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
