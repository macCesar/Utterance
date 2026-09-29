# Utterance v3.3: text to speech

Utterance speaks text in Titanium apps with AVSpeechSynthesizer on iOS and TextToSpeech on Android, using the same API and rate values on both.

## Requirements (v3.3)
* Titanium SDK 13.0.0+ (the minimum in each module's `manifest`)
* iOS 15.0+ (was 11.0+; current Xcode no longer builds for older targets)
* Android 5.0+ (API level 21+)

## What's new

### v3.3
- iOS now requires Titanium SDK 13.0.0, like Android. No API changes.

### v3.2
- No TTS calls on Android's main thread. Speaking, stopping, canceling, preloading, changing engine and the initial voice setup run on a background thread. Android's `TextToSpeech` waits on an internal lock while it connects to the engine; on the main thread that wait was reported by Google Play as an ANR (`Input dispatching timed out`).
- On Android, `isSpeaking` reads a flag instead of asking the engine. Only the last queued utterance moves the flag, so it answers immediately and an earlier utterance finishing cannot turn it off.
- `requestVoices()` delivers the installed voices asynchronously in a `voices` event, with the same shape on both platforms. See [Installed voices](#installed-voices-requestvoices-v32).
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

## Installation and setup

```javascript
const utterance = require('bencoding.utterance');
```

### Permissions

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

## Cross-platform rate normalization

Since v3.0 the same rate value gives the same perceived speed on iOS and Android, so you no longer pass a different value per platform.

### Rate standardization

The default constants aim for the same perceived speed on both platforms rather than an exact mathematical mapping between the two engines. Constants based on that mapping are also available.

#### Why perceived speed

1. `SLOW_SPEECH_RATE` sounds equally slow on both platforms.
2. The engines are different (AVSpeechSynthesizer on iOS, android.speech.tts.TextToSpeech on Android), and each defines its rate range its own way.

#### Available Rate Constants

Perceptual constants (recommended):
```javascript
const speech = utterance.createSpeech();

// These sound perceptually equivalent across platforms
speech.VERY_SLOW_SPEECH_RATE  // iOS: 0.3,  Android: 0.4  - Very slow (accessibility)
speech.SLOW_SPEECH_RATE       // iOS: 0.45, Android: 0.6  - Slow (careful listening)
speech.DEFAULT_SPEECH_RATE    // iOS: 0.5,  Android: 1.0  - Normal speed
speech.FAST_SPEECH_RATE       // iOS: 0.75, Android: 1.3  - Fast (efficient reading)
speech.VERY_FAST_SPEECH_RATE  // iOS: 0.9,  Android: 1.6  - Very fast (quick consumption)
```

Mathematical constants (advanced):
```javascript
// For applications requiring exact mathematical precision
// Formula: android = 0.1 + (ios × 2.9) | ios = (android - 0.1) ÷ 2.9
speech.MATH_VERY_SLOW_SPEECH_RATE  // iOS: 0.125, Android: 0.475
speech.MATH_SLOW_SPEECH_RATE       // iOS: 0.25,  Android: 0.825
speech.MATH_FAST_SPEECH_RATE       // iOS: 0.625, Android: 1.875
speech.MATH_VERY_FAST_SPEECH_RATE  // iOS: 0.75,  Android: 2.275
```

## Quick start

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// 🎉 Same rate value works identically on both platforms!
speech.startSpeaking({
    text: "This sounds the same speed everywhere!",
    rate: speech.SLOW_SPEECH_RATE  // Consistent across iOS & Android
});

// Advanced: Use mathematical constants for precision applications
speech.startSpeaking({
    text: "This uses exact mathematical mapping",
    rate: speech.MATH_SLOW_SPEECH_RATE
});
```

## The speech proxy

### Creating a speech instance

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// Modern v3.0 approach with cross-platform constants
speech.startSpeaking({
    text: "Hello world with modern APIs!",
    rate: speech.DEFAULT_SPEECH_RATE  // Works consistently everywhere
});
```

## API methods

### `startSpeaking(options)`

Starts speaking the given text.

Parameters:

| Parameter            | Type   | Platform     | Description                                      |
| -------------------- | ------ | ------------ | ------------------------------------------------ |
| `text`               | String | **Required** | The text to be spoken                            |
| `voice`              | String | Optional     | Voice identifier or language code                |
| `rate`               | Float  | Optional     | Speech rate (0-1). Use constants for consistency |
| `volume`             | Float  | iOS only     | Volume level (0-1). Default: 1.0                 |
| `preUtteranceDelay`  | Float  | iOS only     | Delay before speaking (seconds)                  |
| `postUtteranceDelay` | Float  | iOS only     | Delay after speaking (seconds)                   |
| `pitch`              | Float  | Android only | Speech pitch. Default: 1.0                       |
| `voiceId`            | String | Optional     | A voice `id` from the `voices` event (v3.2). If that voice is no longer installed, `voice` is used instead |
| `bestVoice`          | Boolean| Optional     | When no `voiceId` applies, use the highest-quality installed voice for `voice`, same region first (v3.2). Default: `false` |
| `queue`              | Boolean| Optional     | Speak after the current utterance instead of cutting it off (v3.2). `completed` fires once, when the queue ends. Default: `false` |

### Basic usage

```javascript
const speech = utterance.createSpeech();

// Simple speech
speech.startSpeaking({
    text: "Hello world! This demonstrates modern cross-platform speech synthesis."
});

// Check if already speaking
if (speech.isSpeaking()) {
    console.log("Already speaking, please wait...");
} else {
    speech.startSpeaking({
        text: "Ready to speak now!"
    });
}
```

### Rates and platform options

```javascript
// Cross-platform optimized rates (perceptual equivalence)
speech.startSpeaking({
    text: "This is spoken at normal speed",
    rate: speech.DEFAULT_SPEECH_RATE
});

// Using standardized slow rate (sounds equally slow on iOS/Android)
speech.startSpeaking({
    text: "This is spoken slowly for accessibility",
    rate: speech.SLOW_SPEECH_RATE
});

// Platform-specific options
if (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad') {
    speech.startSpeaking({
        text: "iOS-specific features",
        volume: 0.8,                    // Volume control
        preUtteranceDelay: 0.1,         // Delay before
        postUtteranceDelay: 0.2,        // Delay after
        rate: speech.FAST_SPEECH_RATE
    });
} else if (Ti.Platform.osname === 'android') {
    speech.startSpeaking({
        text: "Android-specific features",
        pitch: 1.1,                     // Pitch control
        rate: speech.DEFAULT_SPEECH_RATE
    });
}
```

## Voice selection (v3.0+)

### Modern voice APIs

```javascript
const speech = utterance.createSpeech();

// Get detailed voice information (v3.0+)
try {
    const voices = speech.getModernVoices();
    
    console.log(`Available voices: ${voices.length}`);
    
    voices.forEach(voice => {
        if (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad') {
            console.log(`Voice: ${voice.name}`);
            console.log(`Language: ${voice.language}`);
            console.log(`Quality: ${voice.quality}`);
            console.log(`Gender: ${voice.gender || 'Unknown'}`);
            console.log(`Network Required: ${voice.isNetworkConnectionRequired}`);
        } else {
            console.log(`Voice: ${voice.name}`);
            console.log(`Locale: ${voice.locale}`);
            console.log(`Quality: ${voice.quality}`);
        }
        console.log('---');
    });
} catch (error) {
    console.warn("Modern voice APIs not available, using legacy API");
    const voices = speech.getVoices();
    console.log("Basic voices:", voices);
}
```

### Installed voices: `requestVoices()` (v3.2)

`requestVoices()` returns immediately and delivers the list in a `voices` event. Use it to build a voice picker: on Android, `getModernVoices()` waits for the engine on the calling thread, and called from a tap while the engine is connecting it can freeze the app.

Every voice has the same shape on both platforms:

| Property   | Type   | Description |
| ---------- | ------ | ----------- |
| `id`       | String | Pass it as `voiceId` to `startSpeaking()`. iOS: the voice identifier. Android: the voice name |
| `name`     | String | Display name on iOS (`Paulina`, `Juan`). Empty on Android, where engines only expose internal names |
| `language` | String | BCP-47 tag, e.g. `es-MX`, `en-US` |
| `quality`  | String | `default`, `enhanced` or `premium` |

Only voices usable offline are listed: Android skips voices that need a network connection or are not downloaded, and iOS skips novelty voices (iOS 17+). Apps cannot download voices; on iOS users add them in **Settings › Accessibility › Spoken Content › Voices**.

```javascript
const speech = utterance.createSpeech();

function onVoices({ voices }) {
    speech.removeEventListener('voices', onVoices);

    const spanish = voices.filter(voice => voice.language.startsWith('es'));
    spanish.forEach(voice => console.log(`${voice.name || voice.id} · ${voice.language} · ${voice.quality}`));

    // Later, speak with the one the user picked. If it was uninstalled in the
    // meantime, the best installed es-MX voice speaks instead.
    speech.startSpeaking({
        text: 'El Gallo',
        voiceId: spanish.length ? spanish[0].id : '',
        voice: 'es_MX',
        bestVoice: true
    });
}

speech.addEventListener('voices', onVoices);
speech.requestVoices();
```

### Best installed voice: `bestVoice` (v3.2)

Without a `voiceId`, iOS speaks with the default voice for the language, and it keeps using the compact voice even when a better one is installed. `bestVoice: true` picks the installed voice with the highest quality for `voice`, preferring the same region (`es-MX` before `es-ES`). The result is cached per language for the life of the app.

```javascript
speech.startSpeaking({ text: 'La Dama', voice: 'es_MX', bestVoice: true });
```

### Queued utterances: `queue` (v3.2)

By default every `startSpeaking()` cuts off what is playing. With `queue: true` the text is spoken right after it, each part with its own voice and rate, and `completed` fires once, after the last one. Useful to say two sentences in two languages without a gap:

```javascript
speech.startSpeaking({ text: 'El Gallo', voice: 'es_MX' });
speech.startSpeaking({ text: 'Winning table, number 3', voice: 'en_US', queue: true });

speech.addEventListener('completed', () => {
    // Both parts have been spoken.
});
```

### Voice selection helper

```javascript
class SmartVoiceSelector {
    constructor() {
        this.speech = utterance.createSpeech();
        this.cachedVoices = null;
    }
    
    getVoices() {
        if (!this.cachedVoices) {
            try {
                this.cachedVoices = this.speech.getModernVoices();
            } catch (error) {
                this.cachedVoices = this.speech.getVoices().map(name => ({ name }));
            }
        }
        return this.cachedVoices;
    }
    
    findBestVoice(language = 'en', preferredGender = null) {
        const voices = this.getVoices();
        
        // Filter by language
        const languageVoices = voices.filter(voice => {
            const voiceLang = voice.language || voice.locale || voice.name;
            return voiceLang.toLowerCase().includes(language.toLowerCase());
        });
        
        if (languageVoices.length === 0) {
            return null; // No voices for this language
        }
        
        // Prefer high-quality voices
        const highQualityVoices = languageVoices.filter(voice => 
            (voice.quality || 0) > 300
        );
        
        const candidateVoices = highQualityVoices.length > 0 ? 
            highQualityVoices : languageVoices;
        
        // Filter by gender if specified
        if (preferredGender) {
            const genderVoices = candidateVoices.filter(voice => 
                (voice.gender || '').toLowerCase() === preferredGender.toLowerCase()
            );
            
            if (genderVoices.length > 0) {
                return genderVoices[0];
            }
        }
        
        return candidateVoices[0];
    }
    
    speakWithBestVoice(text, language = 'en', options = {}) {
        const bestVoice = this.findBestVoice(language, options.gender);
        
        const speechConfig = {
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        };
        
        if (bestVoice) {
            speechConfig.voice = bestVoice.name;
            console.log(`Using voice: ${bestVoice.name} (Quality: ${bestVoice.quality || 'Unknown'})`);
        }
        
        this.speech.startSpeaking(speechConfig);
    }
}

// Usage
const voiceSelector = new SmartVoiceSelector();

// Speak with best English voice
voiceSelector.speakWithBestVoice("Hello, this uses the best available English voice!");

// Speak with best Spanish female voice
voiceSelector.speakWithBestVoice(
    "Hola, esta es la mejor voz femenina en español disponible",
    'es',
    { 
        gender: 'female',
        rate: voiceSelector.speech.SLOW_SPEECH_RATE 
    }
);
```

## Control methods

### Speech control

```javascript
const speech = utterance.createSpeech();

// Start speaking
speech.startSpeaking({
    text: "This is a long text that can be paused and resumed...",
    rate: speech.DEFAULT_SPEECH_RATE
});

// Pause speech (immediate or at word boundary)
speech.pauseSpeaking(); // Immediate pause
// or
speech.pauseSpeaking('word'); // Pause at next word boundary (iOS)

// Resume paused speech
speech.continueSpeaking();

// Stop speech completely
speech.stopSpeaking(); // Immediate stop
// or  
speech.stopSpeaking('sentence'); // Stop at next sentence boundary (iOS)

// Check speaking status
if (speech.isSpeaking()) {
    console.log("Currently speaking");
}

// Check platform support
if (speech.isSupported()) {
    console.log("Text-to-Speech is supported");
}
```

### Android-specific options

```javascript
const speech = utterance.createSpeech();

if (Ti.Platform.osname === 'android') {
    // Enhanced Android speech synthesis
    speech.startSpeaking({
        text: "Android-specific features available",
        pitch: 1.1,                     // Pitch control
        rate: speech.DEFAULT_SPEECH_RATE
    });
}
```

## Events

### Listening for events

```javascript
const speech = utterance.createSpeech();

// Speech started
speech.addEventListener('started', (event) => {
    console.log("Speech synthesis started");
});

// Speech completed (with queue: true, once the whole queue ends)
speech.addEventListener('completed', (event) => {
    console.log("Speech synthesis completed");
});

// Reply to requestVoices() (v3.2)
speech.addEventListener('voices', (event) => {
    console.log(`Installed voices: ${event.voices.length}`);
});

// Speech paused (iOS and Android compatibility events)
speech.addEventListener('paused', (event) => {
    console.log("Speech synthesis paused");
});

// Speech resumed (iOS and Android compatibility events)
speech.addEventListener('continued', (event) => {
    console.log("Speech synthesis resumed");
});

// Speech canceled
speech.addEventListener('canceled', (event) => {
    console.log("Speech synthesis canceled");
});

// Error handling
speech.addEventListener('error', (event) => {
    console.error("TTS Error:", event.error);
});
```

### Event manager example

```javascript
class SpeechManager {
    constructor() {
        this.speech = utterance.createSpeech();
        this.isReady = false;
        this.setupEvents();
        this.initialize();
    }
    
    setupEvents() {
        this.speech.addEventListener('started', () => {
            console.log("🎤 Speech started");
            this.onSpeechStarted();
        });
        
        this.speech.addEventListener('completed', () => {
            console.log("✅ Speech completed");
            this.onSpeechCompleted();
        });
        
        this.speech.addEventListener('paused', () => {
            console.log("⏸️ Speech paused");
            this.onSpeechPaused();
        });
        
        this.speech.addEventListener('continued', () => {
            console.log("▶️ Speech continued");
            this.onSpeechContinued();
        });
        
        this.speech.addEventListener('canceled', () => {
            console.log("❌ Speech canceled");
            this.onSpeechCanceled();
        });
        
        this.speech.addEventListener('error', (event) => {
            console.error("❌ Speech error:", event.error);
            this.onSpeechError(event);
        });
    }
    
    initialize() {
        // Initialize speech system
        this.isReady = true;
        console.log("🚀 TTS initialized and ready");
    }
    
    speak(text, options = {}) {
        if (!this.isReady) {
            console.warn("TTS not ready yet, queuing speech...");
            setTimeout(() => this.speak(text, options), 100);
            return;
        }
        
        this.speech.startSpeaking({
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        });
    }
    
    // Event handlers (override in subclasses)
    onSpeechStarted() { /* Override me */ }
    onSpeechCompleted() { /* Override me */ }
    onSpeechPaused() { /* Override me */ }
    onSpeechContinued() { /* Override me */ }
    onSpeechCanceled() { /* Override me */ }
    onSpeechError(event) { /* Override me */ }
}

// Usage
const speechManager = new SpeechManager();

speechManager.speak("This speech is managed with complete event handling!");
```

## Multiple languages

### Language detection and voice selection

```javascript
const utterance = require('bencoding.utterance');

class MultiLanguageTTS {
    constructor() {
        this.speech = utterance.createSpeech();
        this.languageMap = this.buildLanguageMap();
    }
    
    buildLanguageMap() {
        const map = new Map();
        
        try {
            const voices = this.speech.getModernVoices();
            
            voices.forEach(voice => {
                const lang = (voice.language || voice.locale || '').toLowerCase();
                if (lang) {
                    const languageCode = lang.split('-')[0];
                    
                    if (!map.has(languageCode)) {
                        map.set(languageCode, []);
                    }
                    
                    map.get(languageCode).push(voice);
                }
            });
            
            // Sort by quality within each language
            map.forEach((voices, lang) => {
                voices.sort((a, b) => (b.quality || 0) - (a.quality || 0));
            });
            
        } catch (error) {
            console.warn("Using fallback language support");
            // Fallback language mapping
            map.set('en', [{ name: 'en-US' }]);
            map.set('es', [{ name: 'es-ES' }]);
            map.set('fr', [{ name: 'fr-FR' }]);
            map.set('de', [{ name: 'de-DE' }]);
        }
        
        return map;
    }
    
    detectLanguage(text) {
        // Simple language detection based on common words
        const languagePatterns = {
            'es': /\b(hola|gracias|por favor|adiós|sí|no|donde|como|que|el|la|de|en|un|es|se|no|te|lo|le|da|su|por|son|con|para|una|tienen|él|sobre|todo|pero|más|hasta|muy|ser|hacer|poder|decir|ir|tener|estar|ver|dar|saber|querer|llegar|pasar|deber|poner|parecer|quedar|seguir|encontrar|llamar|venir|sentir|salir|entrar|trabajar|escribir|perder|producir|existir|ocurrir|recibir|cambiar|necesitar|creer|conocer|conseguir|empezar|buscar|mantener|hablar|realizar|formar|volver|obtener|permitir|ofrecer|tratar|suponer|lograr|explicar|dirigir|continuar|servir|crear|considerar|morir|resultar|establecer|convertir|llevar|nacer|acabar|presentar|aparecer|constituir|abrir|esperar|cumplir|desarrollar|vivir|incluir|tirar|utilizar|observar|comprar|mostrar|aplicar|presentar|ayudar|representar|corresponder|recordar|estudiar|aceptar|descubrir|caer|determinar|comenzar|participar|levantar|acercarse|partir|descubrir|elegir|aprender|entender|construir|ganar|adelante|vender|abandonar|decidir|proponer|imaginar|conseguir|guardar|descender|señalar|escuchar)/gi,
            'fr': /\b(bonjour|merci|s'il vous plaît|au revoir|oui|non|où|comment|que|le|la|de|en|un|est|se|ne|te|lo|lui|da|son|par|sont|avec|pour|une|ont|il|sur|tout|mais|plus|jusqu|très|être|faire|pouvoir|dire|aller|avoir|voir|donner|savoir|vouloir|arriver|passer|devoir|mettre|paraître|rester|suivre|trouver|appeler|venir|sentir|sortir|entrer|travailler|écrire|perdre|produire|exister|se passer|recevoir|changer|avoir besoin|croire|connaître|obtenir|commencer|suchen|maintenir|parler|réaliser|former|retourner|obtenir|permettre|offrir|traiter|supposer|réussir|expliquer|diriger|continuer|servir|créer|considérer|mourir|résulter|établir|convertir|porter|naître|finir|présenter|apparaître|darstellen|ouvrir|attendre|accomplir|développer|vivre|inclure|tirer|utiliser|observer|acheter|montrer|appliquer|présenter|aider|représenter|correspondre|se rappeler|étudier|accepter|découvrir|tomber|bestimmen|commencer|participer|lever|s'approcher|partir|découvrir|choisir|apprendre|comprendre|construire|gagner|en avant|vendre|abandonner|décider|proposer|imaginer|obtenir|garder|descendre|signaler|écouter)/gi,
            'de': /\b(hallo|danke|bitte|auf wiedersehen|ja|nein|wo|wie|was|der|die|das|von|in|ein|ist|sich|ne|du|es|ihm|da|sein|mit|für|eine|haben|er|auf|alles|aber|mehr|bis|sehr|sein|machen|können|sagen|gehen|haben|sehen|geben|wissen|wollen|kommen|gehen|müssen|setzen|scheinen|bleiben|folgen|finden|rufen|kommen|fühlen|ausgehen|eingeben|arbeiten|schreiben|verlieren|produzieren|exisitieren|passieren|erhalten|ändern|brauchen|glauben|kennen|bekommen|anfangen|suchen|behalten|sprechen|realisieren|bilden|zurückkehren|erhalten|erlauben|anbieten|behandeln|annehmen|erreichen|erklären|leiten|fortsetzen|dienen|erstellen|betrachten|sterben|resultieren|etablieren|umwandeln|tragen|geboren werden|beenden|präsentieren|erscheinen|darstellen|öffnen|warten|erfüllen|entwickeln|leben|einschließen|ziehen|benutzen|beobachten|kaufen|zeigen|anwenden|präsentieren|helfen|vertreten|entsprechen|erinnern|studieren|akzeptieren|entdecken|fallen|bestimmen|beginnen|teilnehmen|heben|sich nähern|abreisen|entdecken|wählen|lernen|verstehen|bauen|gewinnen|vorwärts|verkaufen|verlassen|entscheiden|vorschlagen|sich vorstellen|bekommen|behalten|absteigen|zeigen|hören)/gi
        };
        
        let bestMatch = 'en';
        let bestScore = 0;
        
        Object.keys(languagePatterns).forEach(lang => {
            const matches = text.match(languagePatterns[lang]);
            const score = matches ? matches.length : 0;
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = lang;
            }
        });
        
        return bestMatch;
    }
    
    speakWithAutoLanguage(text, options = {}) {
        const detectedLang = options.language || this.detectLanguage(text);
        console.log(`Detected language: ${detectedLang}`);
        
        const voicesForLang = this.languageMap.get(detectedLang);
        let selectedVoice = null;
        
        if (voicesForLang && voicesForLang.length > 0) {
            // Select best voice for the language
            selectedVoice = voicesForLang[0]; // Already sorted by quality
            console.log(`Selected voice: ${selectedVoice.name} (Quality: ${selectedVoice.quality || 'Unknown'})`);
        }
        
        const speechConfig = {
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        };
        
        if (selectedVoice) {
            speechConfig.voice = selectedVoice.name;
        }
        
        this.speech.startSpeaking(speechConfig);
    }
    
    getAvailableLanguages() {
        return Array.from(this.languageMap.keys());
    }
    
    getVoicesForLanguage(language) {
        return this.languageMap.get(language) || [];
    }
}

// Usage Examples
const multiLangTTS = new MultiLanguageTTS();

// Auto-detect language and speak
multiLangTTS.speakWithAutoLanguage("Hello, this should be detected as English");
multiLangTTS.speakWithAutoLanguage("Hola, esto debería detectarse como español");
multiLangTTS.speakWithAutoLanguage("Bonjour, ceci devrait être détecté comme français");

// Explicitly specify language
multiLangTTS.speakWithAutoLanguage(
    "This is explicitly English", 
    { language: 'en', rate: multiLangTTS.speech.SLOW_SPEECH_RATE }
);

// List available languages
console.log("Available languages:", multiLangTTS.getAvailableLanguages());

// Get voices for specific language
const spanishVoices = multiLangTTS.getVoicesForLanguage('es');
console.log("Spanish voices:", spanishVoices.map(v => v.name));
```

## Platform compatibility and migration

### Platform-specific options

```javascript
const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// Universal configuration that works on both platforms
const universalConfig = {
    text: "This configuration works perfectly on both iOS and Android",
    rate: speech.DEFAULT_SPEECH_RATE  // Consistent across platforms
};

// Platform-specific enhancements
if (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad') {
    // iOS-specific features
    universalConfig.volume = 0.9;
    universalConfig.preUtteranceDelay = 0.1;
    universalConfig.postUtteranceDelay = 0.2;
} else if (Ti.Platform.osname === 'android') {
    // Android-specific features
    universalConfig.pitch = 1.0;
}

speech.startSpeaking(universalConfig);
```

### Migrating from v2.x to v3.0

```javascript
// OLD v2.x approach (platform inconsistent)
function speakOldWay(text, speed) {
    let rate;
    
    if (speed === 'slow') {
        rate = Ti.Platform.osname === 'iphone' ? 0.3 : 0.6;
    } else if (speed === 'fast') {
        rate = Ti.Platform.osname === 'iphone' ? 0.8 : 1.5;
    } else {
        rate = Ti.Platform.osname === 'iphone' ? 0.5 : 1.0;
    }
    
    speech.startSpeaking({ text, rate });
}

// NEW v3.0 approach (cross-platform consistent)
function speakNewWay(text, speed) {
    let rate;
    
    switch (speed) {
        case 'slow': 
            rate = speech.SLOW_SPEECH_RATE; 
            break;
        case 'fast': 
            rate = speech.FAST_SPEECH_RATE; 
            break;
        default: 
            rate = speech.DEFAULT_SPEECH_RATE; 
            break;
    }
    
    speech.startSpeaking({ text, rate });
}

// Usage (both sound the same across platforms now!)
speakNewWay("This speech sounds consistently slow on both platforms", 'slow');
speakNewWay("This speech sounds consistently fast on both platforms", 'fast');
```

## Speech rate constants

### Cross-platform constants (recommended)

```javascript
const speech = utterance.createSpeech();

// Perceptual Equivalence - Sounds the same across platforms
const rates = {
    verySlowRate: speech.VERY_SLOW_SPEECH_RATE,    // Accessibility speed
    slowRate: speech.SLOW_SPEECH_RATE,             // Careful listening
    normalRate: speech.DEFAULT_SPEECH_RATE,        // Standard speed
    fastRate: speech.FAST_SPEECH_RATE,             // Efficient reading
    veryFastRate: speech.VERY_FAST_SPEECH_RATE     // Quick consumption
};

// Mathematical Equivalence - Exact mathematical mapping
const mathRates = {
    mathVerySlowRate: speech.MATH_VERY_SLOW_SPEECH_RATE,
    mathSlowRate: speech.MATH_SLOW_SPEECH_RATE,
    mathFastRate: speech.MATH_FAST_SPEECH_RATE,
    mathVeryFastRate: speech.MATH_VERY_FAST_SPEECH_RATE
};

// Legacy Constants (still available)
const legacyRates = {
    minRate: speech.MIN_SPEECH_RATE,               // Platform minimum
    maxRate: speech.MAX_SPEECH_RATE                // Platform maximum
};
```

### Comparing rates

```javascript
const speech = utterance.createSpeech();

// Demonstrate different rate constants
const rateDemo = [
    { text: "This is very slow speech for accessibility", rate: speech.VERY_SLOW_SPEECH_RATE },
    { text: "This is slow speech for careful listening", rate: speech.SLOW_SPEECH_RATE },
    { text: "This is normal speech at default speed", rate: speech.DEFAULT_SPEECH_RATE },
    { text: "This is fast speech for efficient reading", rate: speech.FAST_SPEECH_RATE },
    { text: "This is very fast speech for quick consumption", rate: speech.VERY_FAST_SPEECH_RATE }
];

// Play each demo with a delay
rateDemo.forEach((demo, index) => {
    setTimeout(() => {
        console.log(`Playing rate demo ${index + 1}: ${demo.rate}`);
        speech.startSpeaking(demo);
    }, index * 3000); // 3 second delay between each
});
```

## Performance

### TTS warm-up on Android

```javascript
const utterance = require('bencoding.utterance');

class OptimizedSpeechManager {
    constructor() {
        this.speech = utterance.createSpeech();
        this.isOptimized = false;
        this.initializePerformance();
    }
    
    initializePerformance() {
        // Modern TTS initialization (no warm-up needed)
        console.log("✅ TTS performance ready!");
        this.isOptimized = true;
    }
    
    speak(text, options = {}) {
        this.speech.startSpeaking({
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        });
    }
}

// Usage
const optimizedSpeech = new OptimizedSpeechManager();

// This will wait for optimization before speaking
optimizedSpeech.speak("This speech is optimized for best performance!");
```

### Voice caching

```javascript
class CachedVoiceManager {
    constructor() {
        this.speech = utterance.createSpeech();
        this.voiceCache = new Map();
        this.modernVoicesCache = null;
        this.initializeVoiceCache();
    }
    
    initializeVoiceCache() {
        try {
            this.modernVoicesCache = this.speech.getModernVoices();
            
            // Group voices by language for quick lookup
            this.modernVoicesCache.forEach(voice => {
                const lang = (voice.language || voice.locale || '').toLowerCase();
                const langCode = lang.split('-')[0];
                
                if (!this.voiceCache.has(langCode)) {
                    this.voiceCache.set(langCode, []);
                }
                
                this.voiceCache.get(langCode).push(voice);
            });
            
            // Sort by quality within each language
            this.voiceCache.forEach(voices => {
                voices.sort((a, b) => (b.quality || 0) - (a.quality || 0));
            });
            
            console.log(`🗣️ Cached ${this.modernVoicesCache.length} voices for ${this.voiceCache.size} languages`);
            
        } catch (error) {
            console.warn("Using basic voice caching");
            this.voiceCache.set('en', [{ name: 'default' }]);
        }
    }
    
    getBestVoice(language = 'en', minQuality = 200) {
        const langVoices = this.voiceCache.get(language) || [];
        
        const qualityVoices = langVoices.filter(voice => 
            (voice.quality || 0) >= minQuality
        );
        
        return qualityVoices.length > 0 ? qualityVoices[0] : langVoices[0];
    }
    
    speakWithCachedVoice(text, language = 'en', options = {}) {
        const bestVoice = this.getBestVoice(language, options.minQuality);
        
        const config = {
            text,
            rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
            ...options
        };
        
        if (bestVoice) {
            config.voice = bestVoice.name;
            console.log(`🎤 Using cached voice: ${bestVoice.name} (Quality: ${bestVoice.quality || 'Unknown'})`);
        }
        
        this.speech.startSpeaking(config);
    }
}

// Usage
const cachedVoiceManager = new CachedVoiceManager();

// Fast voice selection using cache
cachedVoiceManager.speakWithCachedVoice("Fast cached voice selection!", 'en');
cachedVoiceManager.speakWithCachedVoice("Selección rápida de voz en caché!", 'es');
```

## Error handling and fallbacks

```javascript
const utterance = require('bencoding.utterance');

class RobustTTSManager {
    constructor() {
        this.speech = utterance.createSpeech();
        this.setupErrorHandling();
        this.fallbackOptions = {
            rate: 0.5,
            maxRetries: 3,
            retryDelay: 1000
        };
    }
    
    setupErrorHandling() {
        this.speech.addEventListener('error', (event) => {
            console.error("TTS Error:", event.error);
            this.handleTTSError(event);
        });
    }
    
    handleTTSError(event) {
        // Implement error recovery strategies
        console.log("🔄 Attempting TTS error recovery...");
        
        // You can implement specific error handling here
        setTimeout(() => {
            this.speakWithFallback("Error recovered. TTS is ready again.");
        }, 1000);
    }
    
    async speakWithFallback(text, options = {}, retryCount = 0) {
        try {
            // Check if TTS is supported
            if (!this.speech.isSupported()) {
                throw new Error("TTS not supported on this device");
            }
            
            // Check if already speaking (avoid conflicts)
            if (this.speech.isSpeaking()) {
                console.log("🔄 Speech in progress, waiting...");
                await this.waitForSpeechEnd();
            }
            
            // Prepare speech configuration
            const config = {
                text,
                rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
                ...options
            };
            
            // Try modern voice selection first
            try {
                const voices = this.speech.getModernVoices();
                if (voices && voices.length > 0 && options.language) {
                    const voice = voices.find(v => 
                        (v.language || v.locale || '').includes(options.language)
                    );
                    if (voice) {
                        config.voice = voice.name;
                    }
                }
            } catch (voiceError) {
                console.warn("Modern voice selection failed, using default");
            }
            
            this.speech.startSpeaking(config);
            
        } catch (error) {
            console.error(`TTS Error (attempt ${retryCount + 1}):`, error.message);
            
            if (retryCount < this.fallbackOptions.maxRetries) {
                console.log(`🔄 Retrying in ${this.fallbackOptions.retryDelay}ms...`);
                
                setTimeout(() => {
                    this.speakWithFallback(text, options, retryCount + 1);
                }, this.fallbackOptions.retryDelay);
            } else {
                console.error("❌ All TTS retry attempts failed");
                this.onTTSFailure(text, error);
            }
        }
    }
    
    waitForSpeechEnd(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkSpeechEnd = () => {
                if (!this.speech.isSpeaking()) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error("Speech timeout"));
                } else {
                    setTimeout(checkSpeechEnd, 100);
                }
            };
            
            checkSpeechEnd();
        });
    }
    
    onTTSFailure(text, error) {
        // Fallback strategy - could be visual feedback, logging, etc.
        console.log("💬 TTS Failed, showing text visually:", text);
        
        // You could show a dialog, notification, or other visual feedback
        const alertDialog = Ti.UI.createAlertDialog({
            title: 'Speech Not Available',
            message: text,
            ok: 'OK'
        });
        alertDialog.show();
    }
    
    quickSpeak(text) {
        // Simple speak method with automatic fallback
        this.speakWithFallback(text, { rate: this.speech.DEFAULT_SPEECH_RATE });
    }
}

// Usage
const robustTTS = new RobustTTSManager();

// Robust speech with automatic error handling and retries
robustTTS.speakWithFallback("This speech has robust error handling and automatic fallbacks!");

// Quick speech for simple use cases
robustTTS.quickSpeak("Quick and safe speech!");
```

## Best practices

### Do

1. Use the cross-platform constants (`speech.SLOW_SPEECH_RATE` and the rest) so rates match on both platforms.
2. Create the instance early. The Android engine warms up on its own when `createSpeech()` connects; create one instance at startup and reuse it.
3. Check `speech.isSpeaking()` before starting new speech.
4. Cache voice selection results instead of repeating the lookup.
5. Handle errors and provide a fallback.
6. Use `requestVoices()` for voice pickers. It answers with an event and never blocks the UI (v3.2).

```javascript
// ✅ Good practice
const speech = utterance.createSpeech();

if (!speech.isSpeaking()) {
    speech.startSpeaking({
        text: "Using best practices!",
        rate: speech.DEFAULT_SPEECH_RATE  // Cross-platform constant
    });
}
```

### Don't

1. Don't calculate rates per platform with manual `if (iOS)` checks.
2. Don't create multiple instances; reuse one.
3. Don't ignore error events.
4. Don't block the UI; use events instead of blocking operations.
5. Don't call `getModernVoices()` from a tap on Android. It waits for the engine on the calling thread; use `requestVoices()` instead.

```javascript
// ❌ Bad practice
if (Ti.Platform.osname === 'iphone') {
    rate = 0.5;
} else {
    rate = 1.0;
}

// ✅ Good practice  
rate = speech.DEFAULT_SPEECH_RATE;
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
