# 🎙️ Utterance v3.0
### Modern Text-to-Speech & Speech-to-Text for Titanium

[![Titanium](http://www-static.appcelerator.com/badges/titanium-git-badge-sq.png)](http://www.appcelerator.com/titanium/) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey.svg)](https://github.com/m1ga/Utterance)

**Utterance v3.0** brings native Text-to-Speech and Speech-to-Text capabilities to your Titanium applications with a completely modernized API, enhanced performance, and cross-platform consistency.

---

## 🚀 What's New in v3.0

### ⚠️ **BREAKING CHANGES** - This is a major version upgrade
- **iOS 11+** required (dropped iOS 7-10 support)
- **Android 5.0+ (API 21+)** required (dropped Android 4.x support)
- **Titanium SDK 12.7.0+** required (dropped older SDK versions)
- **Modern APIs**: Complete rewrite with enhanced voice control and quality detection
- **Cross-Platform Rate Normalization**: Consistent speech rates across iOS and Android
- **Performance Optimizations**: Removed legacy workarounds for faster execution

### ✨ **New Modern Features**
- 🎯 **Cross-Platform Speech Rate Consistency**: Same rate values work identically on iOS and Android
- 🗣️ **Advanced Voice Selection**: Access detailed voice information with quality indicators
- 🌍 **Enhanced Language Support**: Better language detection and availability checking
- ⚡ **Automatic TTS Warm-up**: Prevents first speech loss on Android devices
- 🔄 **Standardized Events**: Unified event system across platforms
- 📱 **Modern Device Support**: Optimized for latest iOS and Android versions
- 🎵 **Perceptual Rate Equivalence**: Speech rates sound equally fast/slow on both platforms
- 🔗 **Unified API**: Consistent method and property names across iOS and Android
- ✅ **Fixed API Inconsistencies**: Both `isSpeaking` property and `isSpeaking()` method work on both platforms

---

## 📋 Requirements

| Platform         | Minimum Version | Recommended     |
| ---------------- | --------------- | --------------- |
| **Titanium SDK** | 12.7.0+         | Latest          |
| **iOS**          | 11.0+           | 15.0+           |
| **Android**      | 5.0+ (API 21+)  | 10.0+ (API 29+) |
| **Xcode**        | 13.0+           | Latest          |
| **Android SDK**  | Target API 33+  | Latest          |

---

## 📦 Installation

### Download Pre-compiled Module
- [📱 iOS Distribution](https://github.com/m1ga/Utterance/tree/master/ios/dist)
- [🤖 Android Distribution](https://github.com/m1ga/Utterance/tree/master/android/dist)

### Setup Instructions
1. Download the latest release for your target platform(s)
2. Install the module in your Titanium project
3. Add to your `tiapp.xml`:

```xml
<modules>
    <module platform="iphone">bencoding.utterance</module>
    <module platform="android">bencoding.utterance</module>
</modules>
```

4. **Configure Permissions** in your `tiapp.xml`:

**For Text-to-Speech (TTS) - No special permissions required:**

**For Speech-to-Text (STT) - Microphone permissions required:**
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

1. Import in your JavaScript:

```javascript
const utterance = require('bencoding.utterance');
```

---

## 🎯 Quick Start

### 🗣️ Text-to-Speech (Cross-Platform)

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// Simple speech with modern API
speech.startSpeaking({
    text: "Hello! This is Utterance v3.0 with cross-platform consistency!"
});

// Advanced configuration with standardized rates
speech.startSpeaking({
    text: "This speech uses perceptually equivalent rates across platforms",
    rate: speech.SLOW_SPEECH_RATE,  // Sounds equally slow on iOS and Android
    voice: "en-US"
});
```

### 🎤 Speech-to-Text (Android Only)

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

---

## 🎛️ Core Features

### 🎯 Cross-Platform Speech Rate Normalization

**NEW in v3.0**: Solves the long-standing cross-platform speech rate inconsistency!

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

### 🗣️ Advanced Voice Selection (v3.0+)

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

### 🎤 Enhanced Speech-to-Text (Android)

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

---

## 📚 API Reference

### Text-to-Speech Methods

| Method                     | Platform      | Description                                                |
| -------------------------- | ------------- | ---------------------------------------------------------- |
| `startSpeaking(options)`   | iOS, Android  | Begin speech synthesis                                     |
| `pauseSpeaking(boundary?)` | iOS, Android* | Pause current speech                                       |
| `continueSpeaking()`       | iOS, Android* | Resume paused speech                                       |
| `stopSpeaking(boundary?)`  | iOS, Android  | Stop current speech                                        |
| `isSpeaking`               | iOS, Android  | **Property**: Check if currently speaking (v3.0 unified) ✅ |
| `isSpeaking()`             | iOS, Android  | **Method**: Check if currently speaking (v3.0 unified) ✅   |
| `isSupported()`            | iOS, Android  | Check platform support (v3.0 unified) ✅                    |
| `getModernVoices()`        | iOS, Android  | Get detailed voice information (v3.0+)                     |
| `getVoices()`              | iOS, Android  | Get basic voice list (legacy)                              |

*\*Android provides compatibility events but doesn't actually pause/resume*

#### 🔗 **v3.0 API Unification Success: Complete Cross-Platform Consistency** ✅

**Problem Solved**: Previous versions had frustrating inconsistencies that required platform-specific code:

**Before v3.0** (inconsistent - required platform detection):
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

**v3.0 Solution** - Complete unification achieved:
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

**Developer Benefits**:
- 🚫 **No more platform detection code needed**
- ✅ **Write once, works everywhere**
- 🎯 **Choose your preferred style**: property or method
- 🔄 **Backward compatibility**: existing code continues working
- 📝 **Cleaner, more maintainable code**

---

## 🎵 Events Reference

### Text-to-Speech Events

| Event       | Platform      | Description                  |
| ----------- | ------------- | ---------------------------- |
| `started`   | iOS, Android  | Speech synthesis has started |
| `completed` | iOS, Android  | Speech synthesis completed   |
| `paused`    | iOS, Android* | Speech synthesis paused      |
| `continued` | iOS, Android* | Speech synthesis resumed     |
| `canceled`  | iOS, Android  | Speech synthesis canceled    |

### Speech-to-Text Events (Android Only)

| Event       | Description                       |
| ----------- | --------------------------------- |
| `started`   | Speech recognition has started    |
| `completed` | Speech recognition completed      |
| `error`     | Speech recognition error occurred |

---

## 💡 Practical Examples

### Complete Voice Control Application

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

### Multi-Language Support Example

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

---

## 🔧 Advanced Configuration

### Cross-Platform Unified API Examples

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

### Migration from v2.x - Before vs After

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

---

## 🔗 Migration from v2.x

### API Unification Checklist ✅

If you're upgrading from Utterance v2.x, here's what's been fixed and unified:

#### ✅ **Fixed: `isSpeaking` Inconsistency**
- **Before**: Android = method only, iOS = property only
- **After**: Both platforms support both property AND method
- **Action**: Choose your preferred style and use consistently

```javascript
// Both now work on both platforms:
if (speech.isSpeaking) { /* property */ }
if (speech.isSpeaking()) { /* method */ }
```

#### ✅ **Fixed: `isSupported` Missing on Platforms**  
- **Before**: Inconsistent availability
- **After**: Available as method on both platforms
- **Action**: Use `speech.isSupported()` everywhere

#### ✅ **Enhanced: Cross-Platform Rate Constants**
- **Before**: Different rate values needed per platform
- **After**: Same rate constants work identically
- **Action**: Replace manual rate calculations with unified constants

```javascript
// Before v3.0 (manual platform adjustment)
const rate = Ti.Platform.osname === 'android' ? 0.6 : 0.45;

// v3.0+ (unified constant)
const rate = speech.SLOW_SPEECH_RATE;
```

### Quick Migration Steps

1. ✅ **Remove Platform Detection Code**:
   ```javascript
   // Remove these platform checks:
   // if (Ti.Platform.osname === 'android') { ... }
   ```

2. ✅ **Standardize `isSpeaking` Usage**:
   ```javascript
   // Choose one style and use everywhere:
   if (speech.isSpeaking) { ... }     // Property (recommended)
   // OR
   if (speech.isSpeaking()) { ... }   // Method (also works)
   ```

3. ✅ **Use Unified Rate Constants**:
   ```javascript
   // Replace manual rates with constants:
   speech.startSpeaking({
       text: "Hello",
       rate: speech.SLOW_SPEECH_RATE  // Works identically on both platforms
   });
   ```

4. ✅ **Verify `isSupported()` Usage**:
   ```javascript
   // This now works everywhere:
   if (speech.isSupported()) { ... }
   ```

---

## 🔐 **Important Permission Note**

**Text-to-Speech (TTS)** = Text → Voice = **NO microphone permissions needed**
**Speech-to-Text (STT)** = Voice → Text = **Microphone permissions required**

If you're only using TTS features, you don't need any special permissions!

---

## 📄 License

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

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

---

## 📞 Support

- **Documentation**: [Complete API Documentation](documentation/)
- **Examples**: [Practical Examples](example/)
- **Issues**: [GitHub Issues](https://github.com/m1ga/Utterance/issues)
- **Discussions**: [GitHub Discussions](https://github.com/m1ga/Utterance/discussions)

---

*Built with ❤️ for the Titanium community*
