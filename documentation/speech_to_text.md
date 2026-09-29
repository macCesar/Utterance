# Utterance v3.1 - Speech to Text 🎤
### Modern Voice Recognition for Titanium Android

[![Titanium](http://www-static.appcelerator.com/badges/titanium-git-badge-sq.png)](http://www.appcelerator.com/titanium/)

Utterance provides powerful Speech-to-Text capabilities for your Android Titanium projects using the native `android.speech.RecognizerIntent` API with modern ES6+ implementation patterns.

---

## 📋 Requirements v3.1
* **Titanium SDK**: 12.7.0+ (was 3.2.1+)
* **Android**: API Level 21+ / Android 5.0+ (was Android 4+)
* **iOS**: Speech-to-Text not supported (TTS only)

## ✨ What's New

### v3.1 Enhancements
- 🔄 **Faster readiness checks**: streamlined initialization mirrors the TTS improvements, reducing retries before listening starts.
- 🛡️ **Hardened permission flow**: clearer feedback paths when microphone access is denied.
- 📊 **Improved diagnostics**: consistent event payloads across the module for easier troubleshooting.

### v3.0 Foundation
- **Enhanced Compatibility**: Updated for modern Android versions and Titanium SDK 12.7.0+
- **Improved Performance**: Optimized for newer Android APIs
- **Better Error Handling**: Enhanced recognition error reporting and recovery
- **Modern JavaScript Support**: ES6+ examples and patterns
- **Standardized Events**: Consistent event system
- **Backward Compatible**: All v2.x APIs continue to work unchanged

---

## 🚀 Installation & Setup

### Import the Module

```javascript
const utterance = require('bencoding.utterance');
```

### Required Permissions

Add these permissions to your `tiapp.xml`:

```xml
<android xmlns:android="http://schemas.android.com/apk/res/android">
    <manifest>
        <!-- REQUIRED: For microphone access -->
        <uses-permission android:name="android.permission.RECORD_AUDIO"/>

        <!-- REQUIRED: For online speech recognition -->
        <uses-permission android:name="android.permission.INTERNET"/>

        <!-- OPTIONAL: For better error handling -->
        <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    </manifest>
</android>
```

---

## 🎤 Working with Speech-to-Text

### Creating a Speech-to-Text Instance

```javascript
const utterance = require('bencoding.utterance');

// Platform check (Android only)
if (Ti.Platform.osname !== 'android') {
    console.warn("Speech-to-Text is only available on Android");
    return;
}

const speechToText = utterance.createSpeechToText();

// Check device support
if (!speechToText.isSupported()) {
    console.error("Speech-to-Text not supported on this device");
    return;
}

console.log("✅ Speech-to-Text ready!");
```

---

## 📚 API Methods

### `startSpeechToText(options)`

Begin speech recognition with comprehensive configuration options.

**Parameters:**

| Parameter       | Type     | Required     | Description                                        |
| --------------- | -------- | ------------ | -------------------------------------------------- |
| `promptText`    | String   | **Required** | Text displayed on the Android recording screen     |
| `maxResults`    | Integer  | Optional     | Maximum number of recognition results (default: 1) |
| `languageModel` | Property | Optional     | Language model for recognition accuracy            |

**Language Model Options:**

- `speechToText.LANGUAGE_MODEL_WEB_SEARCH` - Optimized for web search terms
- `speechToText.LANGUAGE_MODEL_FREE_FORM` - Optimized for free-form speech

### Basic Usage

```javascript
const speechToText = utterance.createSpeechToText();

// Simple speech recognition
speechToText.startSpeechToText({
    promptText: "Speak clearly into the microphone..."
});

// Advanced configuration
speechToText.startSpeechToText({
    promptText: "Please say your command now",
    maxResults: 5,
    languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM
});
```

### `isSupported()`

Check if Speech-to-Text is supported on the current device.

```javascript
const speechToText = utterance.createSpeechToText();

if (speechToText.isSupported()) {
    console.log("✅ Speech recognition is available");
} else {
    console.log("❌ Speech recognition not available");
    // Implement alternative input method
}
```

---

## 🎵 Events System

### Event Handling

```javascript
const speechToText = utterance.createSpeechToText();

// Recognition started
speechToText.addEventListener('started', (event) => {
    console.log("🎤 Speech recognition started");
    // Update UI to show listening state
});

// Recognition completed successfully
speechToText.addEventListener('completed', (event) => {
    console.log("✅ Speech recognition completed");
    
    if (event.results && event.results.length > 0) {
        console.log("Recognition results:", event.results);
        
        // Process the first (most confident) result
        const primaryResult = event.results[0];
        console.log(`Primary result: "${primaryResult}"`);
        
        // Process all results for user selection
        event.results.forEach((result, index) => {
            console.log(`Result ${index + 1}: "${result}"`);
        });
    } else {
        console.log("No speech was recognized");
    }
});

// Recognition error
speechToText.addEventListener('error', (event) => {
    console.error("❌ Speech recognition error:", event.error);
    // Handle specific error types and provide user feedback
});
```

### Complete Event Management Example

```javascript
class SpeechRecognitionManager {
    constructor() {
        if (Ti.Platform.osname !== 'android') {
            throw new Error("Speech recognition only available on Android");
        }
        
        this.speechToText = utterance.createSpeechToText();
        this.isListening = false;
        this.setupEvents();
        this.checkSupport();
    }
    
    checkSupport() {
        if (!this.speechToText.isSupported()) {
            throw new Error("Speech recognition not supported on this device");
        }
        console.log("🎤 Speech recognition initialized successfully");
    }
    
    setupEvents() {
        this.speechToText.addEventListener('started', () => {
            this.isListening = true;
            console.log("🎤 Started listening...");
            this.onListeningStarted();
        });
        
        this.speechToText.addEventListener('completed', (event) => {
            this.isListening = false;
            console.log("✅ Recognition completed");
            this.onRecognitionCompleted(event.results || []);
        });
        
        this.speechToText.addEventListener('error', (event) => {
            this.isListening = false;
            console.error("❌ Recognition error:", event.error);
            this.onRecognitionError(event.error);
        });
    }
    
    listen(promptText = "Speak now...", options = {}) {
        if (this.isListening) {
            console.warn("Already listening, please wait...");
            return;
        }
        
        const config = {
            promptText,
            maxResults: options.maxResults || 3,
            languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
        };
        
        console.log("🎤 Starting speech recognition...");
        this.speechToText.startSpeechToText(config);
    }
    
    // Override these methods in your implementation
    onListeningStarted() {
        // Update UI to show listening indicator
        console.log("👂 Listening for speech...");
    }
    
    onRecognitionCompleted(results) {
        console.log(`🎯 Recognition results (${results.length}):`, results);
        
        if (results.length > 0) {
            const bestResult = results[0];
            console.log(`📝 Best result: "${bestResult}"`);
            
            // Process the recognition result
            this.processRecognitionResult(bestResult, results);
        } else {
            console.log("🔇 No speech was recognized");
            this.onNoSpeechRecognized();
        }
    }
    
    onRecognitionError(error) {
        console.error("💥 Recognition error:", error);
        
        // Provide user-friendly error messages
        const errorMessages = {
            'ERROR_NETWORK_TIMEOUT': 'Network timeout. Please check your internet connection.',
            'ERROR_NETWORK': 'Network error. Please check your internet connection.',
            'ERROR_AUDIO': 'Audio recording error. Please check microphone permissions.',
            'ERROR_SERVER': 'Speech recognition server error. Please try again.',
            'ERROR_CLIENT': 'Speech recognition client error. Please try again.',
            'ERROR_SPEECH_TIMEOUT': 'No speech detected. Please try speaking more clearly.',
            'ERROR_NO_MATCH': 'No speech was recognized. Please try again.',
            'ERROR_RECOGNIZER_BUSY': 'Speech recognition is busy. Please wait and try again.',
            'ERROR_INSUFFICIENT_PERMISSIONS': 'Microphone permission required for speech recognition.'
        };
        
        const userMessage = errorMessages[error] || `Speech recognition error: ${error}`;
        this.showUserError(userMessage);
    }
    
    processRecognitionResult(primaryResult, allResults) {
        // Override this method to process recognition results
        console.log("Processing result:", primaryResult);
    }
    
    onNoSpeechRecognized() {
        // Override this method to handle no speech detected
        console.log("No speech detected, please try again");
    }
    
    showUserError(message) {
        // Override this method to show user-friendly error messages
        console.error("User Error:", message);
    }
}

// Usage
const speechManager = new SpeechRecognitionManager();

// Start listening
speechManager.listen("Please say your command");

// Advanced listening with options
speechManager.listen("Speak your search query", {
    maxResults: 5,
    languageModel: speechManager.speechToText.LANGUAGE_MODEL_WEB_SEARCH
});
```

---

## 🌍 Language Support

### Language Model Selection

```javascript
const speechToText = utterance.createSpeechToText();

// For web search queries (better for short commands)
speechToText.startSpeechToText({
    promptText: "Say your search term",
    languageModel: speechToText.LANGUAGE_MODEL_WEB_SEARCH,
    maxResults: 3
});

// For free-form speech (better for natural conversation)
speechToText.startSpeechToText({
    promptText: "Speak naturally",
    languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM,
    maxResults: 5
});
```

### Multi-Language Speech Recognition

```javascript
class MultiLanguageSpeechRecognition extends SpeechRecognitionManager {
    constructor() {
        super();
        this.supportedLanguages = [
            'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR'
        ];
        this.currentLanguage = 'en-US';
    }
    
    setLanguage(languageCode) {
        if (this.supportedLanguages.includes(languageCode)) {
            this.currentLanguage = languageCode;
            console.log(`🌍 Language set to: ${languageCode}`);
        } else {
            console.warn(`⚠️ Language ${languageCode} not supported`);
        }
    }
    
    listenInLanguage(languageCode, promptText) {
        const previousLanguage = this.currentLanguage;
        this.setLanguage(languageCode);
        
        // Note: Android speech recognition uses system language settings
        // The language parameter affects the prompt and processing logic
        this.listen(promptText || `Speak in ${languageCode}`);
        
        // Restore previous language after recognition
        setTimeout(() => {
            this.setLanguage(previousLanguage);
        }, 1000);
    }
    
    processRecognitionResult(primaryResult, allResults) {
        console.log(`🌍 Processing result in ${this.currentLanguage}: "${primaryResult}"`);
        
        // Language-specific processing
        switch (this.currentLanguage) {
            case 'es-ES':
                this.processSpanishResult(primaryResult, allResults);
                break;
            case 'fr-FR':
                this.processFrenchResult(primaryResult, allResults);
                break;
            case 'de-DE':
                this.processGermanResult(primaryResult, allResults);
                break;
            default:
                this.processEnglishResult(primaryResult, allResults);
                break;
        }
    }
    
    processEnglishResult(result, allResults) {
        console.log("🇺🇸 Processing English result:", result);
        
        // English command processing
        const lowerResult = result.toLowerCase();
        
        if (lowerResult.includes('hello')) {
            this.handleGreeting('en');
        } else if (lowerResult.includes('search')) {
            this.handleSearch(result.replace(/search/gi, '').trim());
        } else if (lowerResult.includes('time')) {
            this.handleTimeRequest('en');
        }
    }
    
    processSpanishResult(result, allResults) {
        console.log("🇪🇸 Processing Spanish result:", result);
        
        const lowerResult = result.toLowerCase();
        
        if (lowerResult.includes('hola')) {
            this.handleGreeting('es');
        } else if (lowerResult.includes('buscar')) {
            this.handleSearch(result.replace(/buscar/gi, '').trim());
        } else if (lowerResult.includes('hora')) {
            this.handleTimeRequest('es');
        }
    }
    
    processFrenchResult(result, allResults) {
        console.log("🇫🇷 Processing French result:", result);
        
        const lowerResult = result.toLowerCase();
        
        if (lowerResult.includes('bonjour')) {
            this.handleGreeting('fr');
        } else if (lowerResult.includes('chercher')) {
            this.handleSearch(result.replace(/chercher/gi, '').trim());
        } else if (lowerResult.includes('heure')) {
            this.handleTimeRequest('fr');
        }
    }
    
    processGermanResult(result, allResults) {
        console.log("🇩🇪 Processing German result:", result);
        
        const lowerResult = result.toLowerCase();
        
        if (lowerResult.includes('hallo')) {
            this.handleGreeting('de');
        } else if (lowerResult.includes('suchen')) {
            this.handleSearch(result.replace(/suchen/gi, '').trim());
        } else if (lowerResult.includes('zeit')) {
            this.handleTimeRequest('de');
        }
    }
    
    handleGreeting(language) {
        const greetings = {
            'en': 'Hello! How can I help you?',
            'es': '¡Hola! ¿Cómo puedo ayudarte?',
            'fr': 'Bonjour! Comment puis-je vous aider?',
            'de': 'Hallo! Wie kann ich Ihnen helfen?'
        };
        
        console.log(`👋 Greeting in ${language}: ${greetings[language]}`);
    }
    
    handleSearch(query) {
        console.log(`🔍 Search query: "${query}"`);
        // Implement search functionality
    }
    
    handleTimeRequest(language) {
        const now = new Date();
        const timeFormats = {
            'en': now.toLocaleTimeString('en-US'),
            'es': now.toLocaleTimeString('es-ES'),
            'fr': now.toLocaleTimeString('fr-FR'),
            'de': now.toLocaleTimeString('de-DE')
        };
        
        console.log(`🕐 Current time in ${language}: ${timeFormats[language]}`);
    }
}

// Usage
const multiLangSpeech = new MultiLanguageSpeechRecognition();

// Listen in different languages
multiLangSpeech.listenInLanguage('en-US', 'Speak your command in English');
multiLangSpeech.listenInLanguage('es-ES', 'Di tu comando en español');
multiLangSpeech.listenInLanguage('fr-FR', 'Dites votre commande en français');
```

---

## 🎯 Practical Examples

### Voice Command System

```javascript
const utterance = require('bencoding.utterance');

class VoiceCommandSystem {
    constructor() {
        if (Ti.Platform.osname !== 'android') {
            throw new Error("Voice commands only available on Android");
        }
        
        this.speechToText = utterance.createSpeechToText();
        this.commands = new Map();
        this.isActive = false;
        
        this.setupCommands();
        this.setupEvents();
        this.checkSupport();
    }
    
    checkSupport() {
        if (!this.speechToText.isSupported()) {
            throw new Error("Speech recognition not supported");
        }
    }
    
    setupEvents() {
        this.speechToText.addEventListener('started', () => {
            console.log("🎤 Voice command system active");
            this.isActive = true;
        });
        
        this.speechToText.addEventListener('completed', (event) => {
            this.isActive = false;
            
            if (event.results && event.results.length > 0) {
                this.processCommand(event.results[0]);
            }
        });
        
        this.speechToText.addEventListener('error', (event) => {
            this.isActive = false;
            console.error("Voice command error:", event.error);
        });
    }
    
    setupCommands() {
        // Register voice commands
        this.registerCommand(['hello', 'hi', 'hey'], () => {
            console.log("👋 Hello command executed");
        });
        
        this.registerCommand(['time', 'what time'], () => {
            const now = new Date().toLocaleTimeString();
            console.log(`🕐 Current time: ${now}`);
        });
        
        this.registerCommand(['weather'], () => {
            console.log("🌤️ Weather command executed");
        });
        
        this.registerCommand(['open', 'launch'], (command) => {
            const app = this.extractAppName(command);
            console.log(`🚀 Opening app: ${app}`);
        });
        
        this.registerCommand(['search', 'find'], (command) => {
            const query = this.extractSearchQuery(command);
            console.log(`🔍 Searching for: ${query}`);
        });
        
        this.registerCommand(['call', 'phone'], (command) => {
            const contact = this.extractContact(command);
            console.log(`📞 Calling: ${contact}`);
        });
        
        this.registerCommand(['stop', 'exit', 'quit'], () => {
            console.log("🛑 Voice commands stopped");
            this.stop();
        });
    }
    
    registerCommand(triggers, handler) {
        triggers.forEach(trigger => {
            this.commands.set(trigger.toLowerCase(), handler);
        });
    }
    
    processCommand(recognizedText) {
        const text = recognizedText.toLowerCase();
        console.log(`🎯 Processing command: "${recognizedText}"`);
        
        // Find matching command
        for (const [trigger, handler] of this.commands) {
            if (text.includes(trigger)) {
                console.log(`✅ Command matched: ${trigger}`);
                handler(recognizedText);
                return;
            }
        }
        
        console.log("❓ No matching command found");
        this.handleUnknownCommand(recognizedText);
    }
    
    extractAppName(command) {
        // Simple extraction - in real app, use more sophisticated parsing
        const words = command.toLowerCase().split(' ');
        const openIndex = words.findIndex(word => word === 'open' || word === 'launch');
        return openIndex !== -1 && openIndex < words.length - 1 ? 
            words[openIndex + 1] : 'unknown';
    }
    
    extractSearchQuery(command) {
        const lowerCommand = command.toLowerCase();
        const searchIndex = Math.max(
            lowerCommand.indexOf('search for'),
            lowerCommand.indexOf('find'),
            lowerCommand.indexOf('search')
        );
        
        if (searchIndex !== -1) {
            const afterSearch = command.substring(searchIndex);
            return afterSearch.replace(/^(search for|search|find)\s*/i, '').trim();
        }
        
        return command;
    }
    
    extractContact(command) {
        const lowerCommand = command.toLowerCase();
        const callIndex = Math.max(
            lowerCommand.indexOf('call'),
            lowerCommand.indexOf('phone')
        );
        
        if (callIndex !== -1) {
            return command.substring(callIndex).replace(/^(call|phone)\s*/i, '').trim();
        }
        
        return 'unknown';
    }
    
    handleUnknownCommand(command) {
        console.log(`❓ Unknown command: "${command}"`);
        // Could provide suggestions or fallback actions
    }
    
    start() {
        if (this.isActive) {
            console.log("Voice commands already active");
            return;
        }
        
        this.speechToText.startSpeechToText({
            promptText: "Say a voice command...",
            maxResults: 1,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    stop() {
        this.isActive = false;
        console.log("🛑 Voice command system deactivated");
    }
    
    listCommands() {
        const commandList = Array.from(this.commands.keys());
        console.log("📋 Available commands:", commandList);
        return commandList;
    }
}

// Usage
const voiceCommands = new VoiceCommandSystem();

// Start listening for commands
voiceCommands.start();

// List available commands
voiceCommands.listCommands();
```

### Real-time Speech Transcription

```javascript
class SpeechTranscriber {
    constructor() {
        if (Ti.Platform.osname !== 'android') {
            throw new Error("Speech transcription only available on Android");
        }
        
        this.speechToText = utterance.createSpeechToText();
        this.transcription = [];
        this.isTranscribing = false;
        this.autoRestart = true;
        
        this.setupEvents();
        this.checkSupport();
    }
    
    checkSupport() {
        if (!this.speechToText.isSupported()) {
            throw new Error("Speech recognition not supported");
        }
    }
    
    setupEvents() {
        this.speechToText.addEventListener('started', () => {
            console.log("📝 Transcription started");
            this.isTranscribing = true;
            this.onTranscriptionStarted();
        });
        
        this.speechToText.addEventListener('completed', (event) => {
            this.isTranscribing = false;
            
            if (event.results && event.results.length > 0) {
                const text = event.results[0];
                this.addToTranscription(text);
                
                // Auto-restart for continuous transcription
                if (this.autoRestart) {
                    setTimeout(() => this.startListening(), 100);
                }
            } else if (this.autoRestart) {
                // Restart even if no speech detected
                setTimeout(() => this.startListening(), 500);
            }
        });
        
        this.speechToText.addEventListener('error', (event) => {
            this.isTranscribing = false;
            console.error("Transcription error:", event.error);
            
            // Auto-restart on certain errors
            if (this.autoRestart && this.shouldRestartOnError(event.error)) {
                setTimeout(() => this.startListening(), 1000);
            }
        });
    }
    
    shouldRestartOnError(error) {
        const restartableErrors = [
            'ERROR_SPEECH_TIMEOUT',
            'ERROR_NO_MATCH',
            'ERROR_NETWORK_TIMEOUT'
        ];
        
        return restartableErrors.includes(error);
    }
    
    startListening() {
        if (this.isTranscribing) {
            return;
        }
        
        this.speechToText.startSpeechToText({
            promptText: "Transcribing... Speak naturally",
            maxResults: 1,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    addToTranscription(text) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = {
            text,
            timestamp,
            id: Date.now()
        };
        
        this.transcription.push(entry);
        console.log(`📝 [${timestamp}] ${text}`);
        
        this.onTextTranscribed(entry);
    }
    
    startTranscription() {
        this.autoRestart = true;
        this.startListening();
        console.log("🎤 Continuous transcription started");
    }
    
    stopTranscription() {
        this.autoRestart = false;
        this.isTranscribing = false;
        console.log("🛑 Transcription stopped");
    }
    
    getTranscription() {
        return this.transcription;
    }
    
    getFullText() {
        return this.transcription.map(entry => entry.text).join(' ');
    }
    
    clearTranscription() {
        this.transcription = [];
        console.log("🗑️ Transcription cleared");
    }
    
    exportTranscription() {
        const fullText = this.getFullText();
        const timestamp = new Date().toISOString();
        
        return {
            text: fullText,
            entries: this.transcription,
            exported: timestamp,
            wordCount: fullText.split(' ').length
        };
    }
    
    // Override these methods in your implementation
    onTranscriptionStarted() {
        // Update UI to show transcription is active
    }
    
    onTextTranscribed(entry) {
        // Update UI with new transcribed text
        console.log("New transcription entry:", entry);
    }
}

// Usage
const transcriber = new SpeechTranscriber();

// Start continuous transcription
transcriber.startTranscription();

// Stop transcription
// transcriber.stopTranscription();

// Get current transcription
setTimeout(() => {
    const transcription = transcriber.getFullText();
    console.log("Full transcription:", transcription);
    
    // Export transcription
    const exported = transcriber.exportTranscription();
    console.log("Exported data:", exported);
}, 30000); // After 30 seconds
```

---

## 🔧 Advanced Configuration

### Network State Handling

```javascript
class NetworkAwareSpeechRecognition {
    constructor() {
        this.speechToText = utterance.createSpeechToText();
        this.networkState = this.checkNetworkState();
        this.setupNetworkMonitoring();
        this.setupEvents();
    }
    
    checkNetworkState() {
        // Check if device has internet connectivity
        return Ti.Network.online;
    }
    
    setupNetworkMonitoring() {
        Ti.Network.addEventListener('change', (e) => {
            this.networkState = e.online;
            console.log(`🌐 Network state changed: ${e.online ? 'Online' : 'Offline'}`);
            
            if (!e.online && this.isListening) {
                this.handleNetworkLoss();
            }
        });
    }
    
    setupEvents() {
        this.speechToText.addEventListener('error', (event) => {
            if (this.isNetworkError(event.error)) {
                this.handleNetworkError(event.error);
            }
        });
    }
    
    isNetworkError(error) {
        const networkErrors = [
            'ERROR_NETWORK',
            'ERROR_NETWORK_TIMEOUT', 
            'ERROR_SERVER'
        ];
        
        return networkErrors.includes(error);
    }
    
    handleNetworkError(error) {
        console.error("🌐 Network-related speech error:", error);
        
        if (!this.networkState) {
            this.showOfflineMessage();
        } else {
            this.retryWithNetworkCheck();
        }
    }
    
    handleNetworkLoss() {
        console.log("📡 Network lost during speech recognition");
        this.showOfflineMessage();
    }
    
    showOfflineMessage() {
        console.log("📵 Speech recognition requires internet connection");
        // Show user-friendly offline message
    }
    
    retryWithNetworkCheck() {
        if (this.checkNetworkState()) {
            console.log("🔄 Retrying speech recognition...");
            setTimeout(() => this.startListening(), 2000);
        } else {
            this.showOfflineMessage();
        }
    }
    
    startListening(options = {}) {
        if (!this.networkState) {
            this.showOfflineMessage();
            return;
        }
        
        // Proceed with normal speech recognition
        this.speechToText.startSpeechToText({
            promptText: options.promptText || "Speak now...",
            maxResults: options.maxResults || 3,
            languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
}

// Usage
const networkAwareSpeech = new NetworkAwareSpeechRecognition();
networkAwareSpeech.startListening();
```

### Permission Handling

```javascript
class PermissionAwareSpeechRecognition {
    constructor() {
        this.speechToText = utterance.createSpeechToText();
        this.hasPermissions = false;
        this.checkPermissions();
    }
    
    checkPermissions() {
        if (Ti.Platform.osname === 'android') {
            const hasAudioPermission = Ti.Android.hasPermission('android.permission.RECORD_AUDIO');
            
            if (!hasAudioPermission) {
                this.requestAudioPermission();
            } else {
                this.hasPermissions = true;
                console.log("✅ Audio permissions granted");
            }
        }
    }
    
    requestAudioPermission() {
        console.log("🎤 Requesting audio permission...");
        
        Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], (e) => {
            if (e.success) {
                console.log("✅ Audio permission granted");
                this.hasPermissions = true;
                this.onPermissionGranted();
            } else {
                console.error("❌ Audio permission denied");
                this.hasPermissions = false;
                this.onPermissionDenied();
            }
        });
    }
    
    startListening(options = {}) {
        if (!this.hasPermissions) {
            console.error("❌ Audio permission required for speech recognition");
            this.requestAudioPermission();
            return;
        }
        
        if (!this.speechToText.isSupported()) {
            console.error("❌ Speech recognition not supported");
            return;
        }
        
        this.speechToText.startSpeechToText({
            promptText: options.promptText || "Speak now...",
            maxResults: options.maxResults || 3,
            languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    onPermissionGranted() {
        console.log("🎉 Ready for speech recognition!");
        // You can automatically start listening here if needed
    }
    
    onPermissionDenied() {
        console.log("⚠️ Speech recognition unavailable without microphone permission");
        // Show alternative input methods
    }
}

// Usage
const permissionAwareSpeech = new PermissionAwareSpeechRecognition();
permissionAwareSpeech.startListening();
```

---

## 🚀 Performance Optimization

### Efficient Recognition Management

```javascript
class OptimizedSpeechRecognition {
    constructor() {
        this.speechToText = utterance.createSpeechToText();
        this.recognitionQueue = [];
        this.isProcessing = false;
        this.maxQueueSize = 5;
        this.cooldownPeriod = 500; // ms between recognitions
        
        this.setupEvents();
    }
    
    setupEvents() {
        this.speechToText.addEventListener('started', () => {
            this.isProcessing = true;
        });
        
        this.speechToText.addEventListener('completed', (event) => {
            this.isProcessing = false;
            this.processNext();
        });
        
        this.speechToText.addEventListener('error', (event) => {
            this.isProcessing = false;
            
            // Wait before processing next item on error
            setTimeout(() => this.processNext(), this.cooldownPeriod * 2);
        });
    }
    
    queueRecognition(options) {
        if (this.recognitionQueue.length >= this.maxQueueSize) {
            console.warn("Recognition queue full, dropping oldest request");
            this.recognitionQueue.shift();
        }
        
        this.recognitionQueue.push(options);
        
        if (!this.isProcessing) {
            this.processNext();
        }
    }
    
    processNext() {
        if (this.recognitionQueue.length === 0 || this.isProcessing) {
            return;
        }
        
        const options = this.recognitionQueue.shift();
        
        setTimeout(() => {
            if (!this.isProcessing) {
                this.speechToText.startSpeechToText(options);
            }
        }, this.cooldownPeriod);
    }
    
    listen(promptText, priority = false) {
        const options = {
            promptText: promptText || "Speak now...",
            maxResults: 3,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        };
        
        if (priority) {
            // Add to front of queue for high priority requests
            this.recognitionQueue.unshift(options);
        } else {
            this.queueRecognition(options);
        }
    }
    
    clearQueue() {
        this.recognitionQueue = [];
        console.log("🗑️ Recognition queue cleared");
    }
    
    getQueueStatus() {
        return {
            queueLength: this.recognitionQueue.length,
            isProcessing: this.isProcessing,
            maxQueueSize: this.maxQueueSize
        };
    }
}

// Usage
const optimizedSpeech = new OptimizedSpeechRecognition();

// Queue multiple recognition requests
optimizedSpeech.listen("Say command 1");
optimizedSpeech.listen("Say command 2");
optimizedSpeech.listen("Say urgent command", true); // Priority request

// Check queue status
console.log("Queue status:", optimizedSpeech.getQueueStatus());
```

---

## 🛡️ Error Handling & Recovery

### Comprehensive Error Management

```javascript
class RobustSpeechRecognition {
    constructor() {
        this.speechToText = utterance.createSpeechToText();
        this.errorCount = 0;
        this.maxRetries = 3;
        this.backoffDelay = 1000; // Start with 1 second
        this.setupEvents();
    }
    
    setupEvents() {
        this.speechToText.addEventListener('completed', (event) => {
            this.errorCount = 0; // Reset error count on success
            this.backoffDelay = 1000; // Reset backoff delay
        });
        
        this.speechToText.addEventListener('error', (event) => {
            this.handleError(event.error);
        });
    }
    
    handleError(error) {
        this.errorCount++;
        console.error(`❌ Speech recognition error (${this.errorCount}/${this.maxRetries}): ${error}`);
        
        const errorInfo = this.getErrorInfo(error);
        
        if (errorInfo.retryable && this.errorCount < this.maxRetries) {
            this.scheduleRetry(errorInfo);
        } else {
            this.handleFinalError(error, errorInfo);
        }
    }
    
    getErrorInfo(error) {
        const errorMap = {
            'ERROR_NETWORK_TIMEOUT': {
                message: 'Network timeout occurred',
                retryable: true,
                userMessage: 'Network timeout. Please check your internet connection.'
            },
            'ERROR_NETWORK': {
                message: 'Network error',
                retryable: true,
                userMessage: 'Network error. Please check your internet connection.'
            },
            'ERROR_AUDIO': {
                message: 'Audio recording error',
                retryable: false,
                userMessage: 'Microphone error. Please check microphone permissions.'
            },
            'ERROR_SERVER': {
                message: 'Server error',
                retryable: true,
                userMessage: 'Speech recognition server error. Please try again.'
            },
            'ERROR_CLIENT': {
                message: 'Client error',
                retryable: false,
                userMessage: 'Speech recognition client error.'
            },
            'ERROR_SPEECH_TIMEOUT': {
                message: 'No speech detected',
                retryable: true,
                userMessage: 'No speech detected. Please try speaking more clearly.'
            },
            'ERROR_NO_MATCH': {
                message: 'No speech recognized',
                retryable: true,
                userMessage: 'No speech was recognized. Please try again.'
            },
            'ERROR_RECOGNIZER_BUSY': {
                message: 'Recognizer busy',
                retryable: true,
                userMessage: 'Speech recognition is busy. Please wait and try again.'
            },
            'ERROR_INSUFFICIENT_PERMISSIONS': {
                message: 'Insufficient permissions',
                retryable: false,
                userMessage: 'Microphone permission required for speech recognition.'
            }
        };
        
        return errorMap[error] || {
            message: `Unknown error: ${error}`,
            retryable: false,
            userMessage: `Speech recognition error: ${error}`
        };
    }
    
    scheduleRetry(errorInfo) {
        console.log(`🔄 Retrying in ${this.backoffDelay}ms... (${errorInfo.message})`);
        
        setTimeout(() => {
            this.retryRecognition();
        }, this.backoffDelay);
        
        // Exponential backoff
        this.backoffDelay *= 2;
    }
    
    retryRecognition() {
        console.log(`🔄 Retry attempt ${this.errorCount}`);
        
        // Use the last recognition options or defaults
        this.speechToText.startSpeechToText({
            promptText: "Retrying speech recognition...",
            maxResults: 3,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    handleFinalError(error, errorInfo) {
        console.error(`💥 Final error after ${this.maxRetries} attempts: ${error}`);
        
        // Reset counters
        this.errorCount = 0;
        this.backoffDelay = 1000;
        
        // Show user-friendly error message
        this.showUserError(errorInfo.userMessage);
        
        // Implement fallback strategy
        this.implementFallback(error);
    }
    
    showUserError(message) {
        console.log(`💬 User Error: ${message}`);
        
        // In a real app, show dialog or notification
        const alertDialog = Ti.UI.createAlertDialog({
            title: 'Speech Recognition Error',
            message: message,
            ok: 'OK'
        });
        alertDialog.show();
    }
    
    implementFallback(error) {
        console.log("🔧 Implementing fallback strategy");
        
        // Implement alternative input methods
        // For example: show text input dialog, keyboard, etc.
        
        if (error === 'ERROR_INSUFFICIENT_PERMISSIONS') {
            this.requestPermissions();
        } else if (error.includes('NETWORK')) {
            this.showOfflineOptions();
        } else {
            this.showAlternativeInput();
        }
    }
    
    requestPermissions() {
        console.log("📋 Requesting microphone permissions");
        // Implement permission request logic
    }
    
    showOfflineOptions() {
        console.log("📵 Showing offline input options");
        // Implement offline input alternatives
    }
    
    showAlternativeInput() {
        console.log("⌨️ Showing alternative input methods");
        // Implement text input dialog or other alternatives
    }
    
    listen(promptText = "Speak now...", options = {}) {
        // Reset error count for new recognition session
        this.errorCount = 0;
        this.backoffDelay = 1000;
        
        const config = {
            promptText,
            maxResults: options.maxResults || 3,
            languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
        };
        
        this.speechToText.startSpeechToText(config);
    }
}

// Usage
const robustSpeech = new RobustSpeechRecognition();
robustSpeech.listen("Speak with robust error handling");
```

---

## 📊 Platform Compatibility

### Platform Requirements

| Feature                | Android 5.0+ | Android 6.0+ | Android 8.0+ | Android 10+ |
| ---------------------- | ------------ | ------------ | ------------ | ----------- |
| Basic STT              | ✅            | ✅            | ✅            | ✅           |
| Runtime Permissions    | ❌            | ✅            | ✅            | ✅           |
| Enhanced Recognition   | ❌            | ✅            | ✅            | ✅           |
| Background Recognition | ❌            | ⚠️            | ⚠️            | ❌           |

### Device Compatibility Check

```javascript
class DeviceCompatibilityChecker {
    constructor() {
        this.speechToText = utterance.createSpeechToText();
        this.deviceInfo = this.getDeviceInfo();
    }
    
    getDeviceInfo() {
        return {
            platform: Ti.Platform.osname,
            version: Ti.Platform.version,
            apiLevel: Ti.Platform.Android ? Ti.Platform.Android.API_LEVEL : null,
            model: Ti.Platform.model,
            manufacturer: Ti.Platform.manufacturer
        };
    }
    
    checkCompatibility() {
        const compatibility = {
            supported: false,
            features: {},
            warnings: [],
            recommendations: []
        };
        
        // Platform check
        if (this.deviceInfo.platform !== 'android') {
            compatibility.warnings.push('Speech-to-Text only available on Android');
            return compatibility;
        }
        
        // API Level check
        if (this.deviceInfo.apiLevel < 21) {
            compatibility.warnings.push('Android 5.0+ required for Speech-to-Text');
            return compatibility;
        }
        
        // Device support check
        if (!this.speechToText.isSupported()) {
            compatibility.warnings.push('Speech recognition not available on this device');
            return compatibility;
        }
        
        compatibility.supported = true;
        
        // Feature availability
        compatibility.features = {
            basicRecognition: true,
            runtimePermissions: this.deviceInfo.apiLevel >= 23,
            enhancedRecognition: this.deviceInfo.apiLevel >= 23,
            backgroundRecognition: this.deviceInfo.apiLevel >= 23 && this.deviceInfo.apiLevel < 29
        };
        
        // Recommendations
        if (this.deviceInfo.apiLevel < 26) {
            compatibility.recommendations.push('Consider updating to Android 8.0+ for better performance');
        }
        
        if (!compatibility.features.runtimePermissions) {
            compatibility.recommendations.push('Runtime permission handling not available');
        }
        
        return compatibility;
    }
    
    printCompatibilityReport() {
        const compatibility = this.checkCompatibility();
        
        console.log("📋 Device Compatibility Report");
        console.log("=" .repeat(50));
        console.log(`Device: ${this.deviceInfo.manufacturer} ${this.deviceInfo.model}`);
        console.log(`Platform: ${this.deviceInfo.platform} ${this.deviceInfo.version}`);
        console.log(`API Level: ${this.deviceInfo.apiLevel}`);
        console.log(`Supported: ${compatibility.supported ? '✅' : '❌'}`);
        
        if (compatibility.features) {
            console.log("\n🎯 Feature Support:");
            Object.entries(compatibility.features).forEach(([feature, supported]) => {
                console.log(`  ${feature}: ${supported ? '✅' : '❌'}`);
            });
        }
        
        if (compatibility.warnings.length > 0) {
            console.log("\n⚠️ Warnings:");
            compatibility.warnings.forEach(warning => {
                console.log(`  - ${warning}`);
            });
        }
        
        if (compatibility.recommendations.length > 0) {
            console.log("\n💡 Recommendations:");
            compatibility.recommendations.forEach(rec => {
                console.log(`  - ${rec}`);
            });
        }
        
        return compatibility;
    }
}

// Usage
const compatibilityChecker = new DeviceCompatibilityChecker();
const compatibility = compatibilityChecker.printCompatibilityReport();

if (compatibility.supported) {
    console.log("🎉 Device ready for Speech-to-Text!");
} else {
    console.log("❌ Speech-to-Text not available on this device");
}
```

---

## 📄 Best Practices Summary

### ✅ Do's

1. **Always Check Support**: Use `isSupport()` before attempting recognition
2. **Handle Permissions**: Request microphone permissions properly on Android 6.0+
3. **Implement Error Handling**: Provide graceful fallbacks for recognition errors
4. **Check Network State**: Speech recognition requires internet connectivity
5. **Use Appropriate Language Models**: Choose between `WEB_SEARCH` and `FREE_FORM`
6. **Provide Clear Prompts**: Use descriptive prompt text to guide users

```javascript
// ✅ Good practice
const speechToText = utterance.createSpeechToText();

if (speechToText.isSupport()) {
    speechToText.addEventListener('error', (event) => {
        console.error("Handled error:", event.error);
        // Implement fallback
    });
    
    speechToText.startSpeechToText({
        promptText: "Please speak your command clearly",
        maxResults: 3,
        languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM
    });
}
```

### ❌ Don'ts

1. **Don't Ignore Platform Limitations**: Speech-to-Text is Android-only
2. **Don't Skip Error Handling**: Always implement proper error recovery
3. **Don't Assume Permissions**: Check and request permissions as needed
4. **Don't Overload Recognition**: Allow cooldown periods between recognitions
5. **Don't Ignore Network State**: Handle offline scenarios gracefully

```javascript
// ❌ Bad practice
speechToText.startSpeechToText({
    promptText: "Speak"  // Too brief, no error handling
});

// ✅ Good practice
if (Ti.Platform.osname === 'android' && speechToText.isSupport()) {
    speechToText.startSpeechToText({
        promptText: "Please speak your command clearly into the microphone",
        maxResults: 3,
        languageModel: speechToText.LANGUAGE_MODEL_FREE_FORM
    });
}
```

---

## 🔗 Integration with Text-to-Speech

### Complete Voice Interface

```javascript
const utterance = require('bencoding.utterance');

class CompleteVoiceInterface {
    constructor() {
        // Initialize both TTS and STT
        this.speech = utterance.createSpeech();
        this.speechToText = Ti.Platform.osname === 'android' ? 
            utterance.createSpeechToText() : null;
        
        this.setupTTS();
        this.setupSTT();
    }
    
    setupTTS() {
        this.speech.addEventListener('completed', () => {
            console.log("🗣️ TTS completed, ready for next input");
        });
    }
    
    setupSTT() {
        if (!this.speechToText || !this.speechToText.isSupported()) {
            console.warn("Speech-to-Text not available");
            return;
        }
        
        this.speechToText.addEventListener('completed', (event) => {
            if (event.results && event.results.length > 0) {
                this.processVoiceInput(event.results[0]);
            }
        });
    }
    
    speak(text, rate = null) {
        this.speech.startSpeaking({
            text,
            rate: rate || this.speech.DEFAULT_SPEECH_RATE
        });
    }
    
    listen(promptText = "Listening...") {
        if (!this.speechToText) {
            this.speak("Speech recognition not available on this platform");
            return;
        }
        
        this.speechToText.startSpeechToText({
            promptText,
            maxResults: 3,
            languageModel: this.speechToText.LANGUAGE_MODEL_FREE_FORM
        });
    }
    
    processVoiceInput(input) {
        console.log(`🎤 Voice input: "${input}"`);
        
        // Echo the input back
        this.speak(`You said: ${input}`);
        
        // Process commands
        const lowerInput = input.toLowerCase();
        
        if (lowerInput.includes('hello')) {
            setTimeout(() => {
                this.speak("Hello! How can I help you today?");
            }, 2000);
        } else if (lowerInput.includes('time')) {
            setTimeout(() => {
                const now = new Date().toLocaleTimeString();
                this.speak(`The current time is ${now}`);
            }, 2000);
        }
    }
    
    startConversation() {
        this.speak("Voice interface ready. Say hello to begin.");
        setTimeout(() => {
            this.listen("Say hello or ask for the time");
        }, 3000);
    }
}

// Usage
const voiceInterface = new CompleteVoiceInterface();
voiceInterface.startConversation();
```

---

## 📄 License

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

---

*🎤 Bringing modern voice recognition to Titanium Android developers*
