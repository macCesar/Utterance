# Utterance v3.2
### Text-to-speech and speech-to-text for Titanium

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey.svg)](https://github.com/macCesar/Utterance)

Utterance v3.2 keeps text-to-speech off Android's main thread and adds voice selection: list the installed voices, pick one, or let the module choose the best one for a language.

## What's new

### v3.2.0: Android ANR fix and voice selection
- Android: `startSpeaking()`, `stopSpeaking()`, `cancelSpeaking()`, `preloadVoiceData()`, `setEngine()` and the initial voice setup run on a background thread. Android's `TextToSpeech` blocks while it connects to the engine, and on the main thread that wait was reported as `Input dispatching timed out`.
- Android: `isSpeaking` reads a flag instead of asking the engine. Only the last utterance queued moves it, so a finished earlier one cannot turn it off.
- `requestVoices()` delivers the installed voices in a `voices` event, with the same shape on both platforms: `{ id, name, language, quality }`. Android skips voices that need a network or are not downloaded; iOS skips novelty voices.
- New `startSpeaking()` options: `voiceId` (an `id` from the `voices` event; falls back to `voice` if that voice is gone), `bestVoice` (highest-quality installed voice for `voice`, same region first) and `queue` (add the text after the one being spoken instead of cutting it off; `completed` fires once, when the queue ends).
- iOS: `voice: 'es_MX'` is accepted as `es-MX`, and out-of-range `rate`, `pitchMultiplier` and `volume` values are now rejected; before, the range check always passed.
- The iOS deployment target is 15.0, the minimum of Titanium SDK 13.4.1 and of current Xcode.

### v3.1: performance and reliability
- Speech starts as soon as the engine is initialized; the 100 ms warm-up is gone.
- Flags are reset in one place, which cuts about 89 % of the atomic operations per utterance.
- Removed the unused `reset()` method and the old readiness checks.
- Fast sequences, such as reading cards one after another, no longer drop utterances, because cancellation takes fewer steps.

### v3.0: rewrite
#### Breaking changes
- Requires iOS 11+, Android 5.0 (API 21)+ and Titanium SDK 12.7.0+. iOS 7–10, Android 4.x and older SDKs are no longer supported.
- The module was rewritten with more voice control and voice quality detection. Old workarounds were removed to make it faster.

#### Features
- The same `rate` value sounds equally fast or slow on iOS and Android.
- Voice information includes a quality value.
- Better language detection and availability checks.
- An automatic warm-up keeps Android from losing the first utterance.
- Method, property and event names are the same on both platforms.
- `isSpeaking` works as a property and as `isSpeaking()` on both platforms.
- Built for current iOS and Android versions.

## Requirements

| Platform     | Minimum                             | Recommended     |
| ------------ | ----------------------------------- | --------------- |
| Titanium SDK | 12.0.0+ (iOS), 13.0.0+ (Android)    | Latest          |
| iOS          | 15.0+                               | Latest          |
| Android      | 5.0+ (API 21+)                      | 10.0+ (API 29+) |
| Xcode        | 13.0+                               | Latest          |
| Android SDK  | Target API 33+                      | Latest          |

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
const speech = utterance.createSpeech();

// Simple speech with modern API
speech.startSpeaking({
    text: "Hello! This is Utterance v3.2 with cross-platform consistency!"
});

// Advanced configuration with standardized rates
speech.startSpeaking({
    text: "This speech uses perceptually equivalent rates across platforms",
    rate: speech.SLOW_SPEECH_RATE,  // Sounds equally slow on iOS and Android
    voice: "en-US"
});
```

### Speech-to-text (Android only)

```javascript
const speechToText = utterance.createSpeechToText();

// Check device support
if (!speechToText.isSupported()) {
    console.warn("Speech-to-Text not supported on this device");
    return;
}

// Start recognition with event handling
speechToText.addEventListener('completed', (event) => {
    console.log("Recognition results:", event.results);
});

speechToText.startSpeechToText({
    promptText: "Speak clearly into the microphone...",
    maxResults: 5,
    languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM
});
```

## Features

### Speech rate on both platforms

Since v3.0, each rate constant sounds about as fast on iOS as on Android, although the underlying values differ.

```javascript
const speech = utterance.createSpeech();

// These constants sound perceptually equivalent across platforms
const rateConstants = {
    VERY_SLOW: speech.VERY_SLOW_SPEECH_RATE,    // iOS: 0.25, Android: 0.4
    SLOW: speech.SLOW_SPEECH_RATE,              // iOS: 0.35, Android: 0.6
    NORMAL: speech.DEFAULT_SPEECH_RATE,         // iOS: 0.5,  Android: 1.0
    FAST: speech.FAST_SPEECH_RATE,              // iOS: 0.55, Android: 1.3
    VERY_FAST: speech.VERY_FAST_SPEECH_RATE     // iOS: 0.65, Android: 1.6
};

// Use the same rate value on both platforms for consistent user experience
speech.startSpeaking({
    text: "This sounds the same speed everywhere!",
    rate: rateConstants.SLOW
});
```

### Voice selection (v3.0+)

```javascript
const speech = utterance.createSpeech();

// Get detailed voice information
const voices = speech.getModernVoices();

// Filter high-quality Spanish voices
const spanishVoices = voices.filter(voice => {
    const lang = voice.language || voice.locale || '';
    return lang.toLowerCase().includes('es') && voice.quality > 300;
});

if (spanishVoices.length > 0) {
    speech.startSpeaking({
        text: "¡Hola! Este es un ejemplo en español con voces de alta calidad.",
        voice: spanishVoices[0].name,
        rate: speech.DEFAULT_SPEECH_RATE
    });
}
```

### Speech-to-text events (Android)

```javascript
const speechToText = utterance.createSpeechToText();

// Comprehensive event handling
speechToText.addEventListener('started', () => {
    console.log("Speech recognition started");
});

speechToText.addEventListener('completed', (event) => {
    if (event.results && event.results.length > 0) {
        console.log("Recognition successful:", event.results[0]);
    }
});

speechToText.addEventListener('error', (event) => {
    console.error("Recognition error:", event.error);
});

// Start recognition with advanced options
speechToText.startSpeechToText({
    promptText: "Por favor, habla ahora...",
    maxResults: 3,
    languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM
});
```

## API reference

### Text-to-Speech Methods

| Method                     | Platform      | Description                                              |
| -------------------------- | ------------- | -------------------------------------------------------- |
| `startSpeaking(options)`   | iOS, Android  | Start speaking                                           |
| `pauseSpeaking(boundary?)` | iOS, Android* | Pause the current speech                                 |
| `continueSpeaking()`       | iOS, Android* | Resume paused speech                                     |
| `stopSpeaking(boundary?)`  | iOS, Android  | Stop the current speech                                  |
| `isSpeaking`               | iOS, Android  | Property: whether speech is in progress (both since v3.0) |
| `isSpeaking()`             | iOS, Android  | Method: whether speech is in progress (both since v3.0)  |
| `isSupported()`            | iOS, Android  | Whether the platform supports TTS (both since v3.0)      |
| `getModernVoices()`        | iOS, Android  | Detailed voice information (v3.0+)                       |
| `requestVoices()`          | iOS, Android  | Installed voices, delivered in a `voices` event (v3.2.0) |
| `getVoices()`              | iOS, Android  | Basic voice list (legacy)                                |

*\*Android sends the events but does not pause or resume the speech.*

`startSpeaking()` options added in v3.2.0: `voiceId`, `bestVoice` and `queue`. See [What's new](#whats-new).

*On Android, `getModernVoices()`, `getModernLanguages()`, `isLanguageAvailable()`, `isNetworkRequired()`, `getEngineInfo()` and `getDiagnostics()` return data from the engine, so they wait for it while it connects. Call them after the `initialized` event, not from a click handler.*

#### Same API on both platforms since v3.0

Before v3.0, `isSpeaking` was a method on Android and a property on iOS, so code had to check the platform:
```javascript
// ❌ OLD: Had to write platform-specific code
if (Ti.Platform.osname === 'android') {
    if (speech.isSpeaking()) { /* Android: method only */ }
    if (speech.isSupported()) { /* Android: had this method */ }
} else if (Ti.Platform.osname === 'iphone') {
    if (speech.isSpeaking) { /* iOS: property only */ }
    if (speech.isSupported()) { /* iOS: had this method */ }
}
```

Since v3.0, the same code runs on both:
```javascript
// ✅ NEW: Same code works perfectly on both platforms!
if (speech.isSpeaking) {        // Property: works everywhere
    console.log("Speaking via property");
}

if (speech.isSpeaking()) {      // Method: now works everywhere  
    console.log("Speaking via method");
}

if (speech.isSupported()) {     // Method: confirmed working everywhere
    console.log("TTS is supported");
}
```

Use the property or the method, whichever you prefer. Existing code keeps working.

## Events

### Text-to-speech events

| Event       | Platform      | Description                  |
| ----------- | ------------- | ---------------------------- |
| `started`   | iOS, Android  | Speech synthesis has started |
| `completed` | iOS, Android  | Speech synthesis completed; with `queue: true`, once the whole queue ends |
| `voices`    | iOS, Android  | Reply to `requestVoices()`: `{ voices: [{ id, name, language, quality }] }` |
| `paused`    | iOS, Android* | Speech synthesis paused      |
| `continued` | iOS, Android* | Speech synthesis resumed     |
| `canceled`  | iOS, Android  | Speech synthesis canceled    |

### Speech-to-text events (Android only)

| Event       | Description                       |
| ----------- | --------------------------------- |
| `started`   | Speech recognition has started    |
| `completed` | Speech recognition completed      |
| `error`     | Speech recognition error occurred |

## Examples

### Voice control app

```javascript
const utterance = require('bencoding.utterance');

class VoiceController {
    constructor() {
        this.speech = utterance.createSpeech();
        this.speechToText = Ti.Platform.osname === 'android' ? 
            utterance.createSpeechToText() : null;
        
        this.setupTTS();
        this.setupSTT();
    }
    
    setupTTS() {
        // Setup TTS events
        this.speech.addEventListener('completed', () => {
            console.log("Speech completed");
        });
        
        this.speech.addEventListener('error', (event) => {
            console.error("TTS Error:", event.error);
        });
    }
    
    setupSTT() {
        if (!this.speechToText || !this.speechToText.isSupported()) {
            console.warn("Speech-to-Text not available");
            return;
        }
        
        this.speechToText.addEventListener('completed', (event) => {
            if (event.results && event.results.length > 0) {
                this.processSpeechResult(event.results[0]);
            }
        });
        
        this.speechToText.addEventListener('error', (event) => {
            console.error("STT Error:", event.error);
        });
    }
    
    speak(text, options = {}) {
        const config = {
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        };
        
        // Use high-quality voice if available
        try {
            const voices = this.speech.getModernVoices();
            const preferredVoice = voices.find(voice => 
                voice.quality > 300 && 
                (voice.language || '').includes(options.language || 'en')
            );
            
            if (preferredVoice) {
                config.voice = preferredVoice.name;
            }
        } catch (e) {
            // Fallback to default voice
        }
        
        this.speech.startSpeaking(config);
    }
    
    listen(promptText = "Speak now...") {
        if (!this.speechToText) {
            this.speak("Speech recognition not available on this platform");
            return;
        }
        
        this.speechToText.startSpeechToText({
            promptText,
            maxResults: 5,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    processSpeechResult(result) {
        console.log("Recognized speech:", result);
        
        // Example command processing
        const lowerResult = result.toLowerCase();
        
        if (lowerResult.includes('hello')) {
            this.speak("Hello! How can I help you?");
        } else if (lowerResult.includes('time')) {
            const now = new Date().toLocaleTimeString();
            this.speak(`The current time is ${now}`);
        } else {
            this.speak(`You said: ${result}`);
        }
    }
}

// Usage
const voiceController = new VoiceController();

// Speak with different rates
voiceController.speak("This is normal speed");
voiceController.speak("This is slow speech", { 
    rate: voiceController.speech.SLOW_SPEECH_RATE 
});
voiceController.speak("This is fast speech", { 
    rate: voiceController.speech.FAST_SPEECH_RATE 
});

// Start listening (Android only)
voiceController.listen("Say something...");
```

### Several languages

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

class MultiLanguageExample {
    constructor() {
        this.availableLanguages = this.getAvailableLanguages();
    }
    
    getAvailableLanguages() {
        try {
            const voices = speech.getModernVoices();
            const languages = new Set();
            
            voices.forEach(voice => {
                const lang = voice.language || voice.locale || '';
                if (lang) {
                    languages.add(lang.split('-')[0]); // Get language code
                }
            });
            
            return Array.from(languages);
        } catch (e) {
            // Fallback for older devices
            return ['en', 'es', 'fr', 'de']; // Common languages
        }
    }
    
    speakInLanguage(text, language = 'en') {
        try {
            const voices = speech.getModernVoices();
            const languageVoices = voices.filter(voice => {
                const voiceLang = voice.language || voice.locale || '';
                return voiceLang.toLowerCase().includes(language.toLowerCase());
            });
            
            // Prefer high-quality voices
            const highQualityVoice = languageVoices.find(voice => voice.quality > 300);
            const selectedVoice = highQualityVoice || languageVoices[0];
            
            if (selectedVoice) {
                speech.startSpeaking({
                    text,
                    voice: selectedVoice.name,
                    rate: speech.DEFAULT_SPEECH_RATE
                });
            } else {
                // Fallback to default voice
                speech.startSpeaking({ text });
            }
        } catch (e) {
            // Use legacy API
            speech.startSpeaking({ text, voice: language });
        }
    }
}

// Usage
const multiLang = new MultiLanguageExample();

multiLang.speakInLanguage("Hello, how are you today?", "en");
multiLang.speakInLanguage("Hola, ¿cómo estás hoy?", "es");
multiLang.speakInLanguage("Bonjour, comment allez-vous aujourd'hui?", "fr");
```

## Advanced configuration

### Unified API

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// ✅ v3.0: Unified API - no platform detection needed!
class UnifiedVoiceManager {
    constructor() {
        this.speech = utterance.createSpeech();
        this.initialize();
    }
    
    initialize() {
        // Works on both platforms without conditions
        if (!this.speech.isSupported()) {
            console.error("TTS not supported");
            return;
        }
        
        console.log("✅ TTS supported and ready");
        this.setupEventHandlers();
    }
    
    speak(text, options = {}) {
        // Check speaking state using unified API
        if (this.speech.isSpeaking) {  // Property form
            console.log("Already speaking, stopping first...");
            this.speech.stopSpeaking();
        }
        
        // Alternative: use method form
        if (this.speech.isSpeaking()) {  // Method form
            console.log("Still speaking via method check");
        }
        
        // Start speaking with cross-platform rates
        this.speech.startSpeaking({
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        });
    }
    
    getStatus() {
        return {
            supported: this.speech.isSupported(),           // Method
            speaking_property: this.speech.isSpeaking,      // Property  
            speaking_method: this.speech.isSpeaking(),      // Method
            platform: Ti.Platform.osname
        };
    }
}

// Usage - same code works on iOS and Android!
const voiceManager = new UnifiedVoiceManager();
voiceManager.speak("Hello from unified API!");

console.log("Status:", voiceManager.getStatus());
```

### Before and after v3.0

```javascript
// ❌ BEFORE v3.0 (platform-specific nightmare)
class OldVoiceManager {
    isSpeaking() {
        if (Ti.Platform.osname === 'android') {
            return this.speech.isSpeaking();  // Method on Android
        } else {
            return this.speech.isSpeaking;    // Property on iOS  
        }
    }
    
    isSupported() {
        if (Ti.Platform.osname === 'android') {
            return this.speech.isSupported(); // Android had this
        } else {
            return this.speech.isSupported(); // iOS had this too
        }
    }
}

// ✅ AFTER v3.0 (unified bliss)
class NewVoiceManager {
    isSpeaking() {
        return this.speech.isSpeaking;  // Works everywhere as property
        // OR: return this.speech.isSpeaking(); // Works everywhere as method
    }
    
    isSupported() {
        return this.speech.isSupported(); // Works everywhere
    }
}
```

## Migrating from v2.x

### API changes

#### `isSpeaking`
In v2.x, `isSpeaking` was a method on Android and a property on iOS. Both forms now work on both platforms; pick one and use it everywhere.

```javascript
// Both now work on both platforms:
if (speech.isSpeaking) { /* property */ }
if (speech.isSpeaking()) { /* method */ }
```

#### `isSupported()`
Its availability varied by platform. It is now a method on both: use `speech.isSupported()`.

#### Rate constants
v2.x needed a different rate value per platform. The rate constants sound the same on both, so replace hand-tuned rates with them.

```javascript
// Before v3.0 (manual platform adjustment)
const rate = Ti.Platform.osname === 'android' ? 0.6 : 0.45;

// v3.0+ (unified constant)
const rate = speech.SLOW_SPEECH_RATE;
```

### Steps

1. Remove platform checks:
   ```javascript
   // Remove these platform checks:
   // if (Ti.Platform.osname === 'android') { ... }
   ```

2. Use one form of `isSpeaking`:
   ```javascript
   // Choose one style and use everywhere:
   if (speech.isSpeaking) { ... }     // Property (recommended)
   // OR
   if (speech.isSpeaking()) { ... }   // Method (also works)
   ```

3. Use the rate constants:
   ```javascript
   // Replace manual rates with constants:
   speech.startSpeaking({
       text: "Hello",
       rate: speech.SLOW_SPEECH_RATE  // Works identically on both platforms
   });
   ```

4. Check `isSupported()` calls:
   ```javascript
   // This now works everywhere:
   if (speech.isSupported()) { ... }
   ```

## Permissions

Text-to-speech needs no permissions. Speech-to-text needs the microphone permissions shown under [Setup](#setup).

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

