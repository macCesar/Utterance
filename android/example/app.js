/**
 * Utterance v3.1 - Complete Example Application
 * Demonstrates all TTS and STT features with modern JavaScript patterns
 * 
 * Features demonstrated:
 * - Cross-platform TTS with normalized speech rates
 * - Modern voice selection with quality detection
 * - Speech-to-Text with comprehensive error handling
 * - Event management and lifecycle handling
 * - Platform-specific optimizations
 * - Error recovery and fallback strategies
 */

const utterance = require('bencoding.utterance');

// =============================================================================
// 🎙️ COMPLETE VOICE INTERFACE CLASS
// =============================================================================

class UtteranceV3Demo {
  constructor() {
    console.log('🎙️ Initializing Utterance v3.1 Complete Demo');
    console.log(`📱 Platform: ${Ti.Platform.osname} ${Ti.Platform.version}`);

    // Create UI first
    this.createUI();

    // Initialize both TTS and STT
    this.initializeTTS();
    this.initializeSTT();

    // Demo state
    this.demoStep = 0;
    this.isRunning = false;
    this.isDemoInProgress = false; // Prevent concurrent demos

    // Start the interactive demo
    this.startDemo();
  }

  // =========================================================================
  // 📱 USER INTERFACE CREATION
  // =========================================================================

  createUI() {
    // Create main window
    this.window = Ti.UI.createWindow({
      title: 'Utterance v3.1 Demo',
      backgroundColor: '#f5f5f5',
      layout: 'vertical'
    });

    // Header
    const header = Ti.UI.createLabel({
      text: '🎙️ Utterance v3.1 Demo',
      font: { fontSize: 24, fontWeight: 'bold' },
      color: '#333',
      textAlign: 'center',
      top: 20,
      height: 40
    });

    // Status display
    this.statusLabel = Ti.UI.createLabel({
      text: 'Initializing...',
      font: { fontSize: 16 },
      color: '#666',
      textAlign: 'center',
      top: 10,
      height: 30
    });

    // Progress display
    this.progressLabel = Ti.UI.createLabel({
      text: 'Step 0/8',
      font: { fontSize: 14 },
      color: '#999',
      textAlign: 'center',
      top: 5,
      height: 25
    });

    // Main content area
    this.contentView = Ti.UI.createScrollView({
      top: 20,
      height: '60%',
      backgroundColor: 'white',
      borderRadius: 10,
      showVerticalScrollIndicator: true
    });

    this.contentLabel = Ti.UI.createLabel({
      text: 'Demo starting...',
      font: { fontSize: 14 },
      color: '#333',
      textAlign: 'left',
      left: 15,
      right: 15,
      top: 15,
      height: Ti.UI.SIZE
    });

    this.contentView.add(this.contentLabel);

    // Control buttons
    const buttonContainer = Ti.UI.createView({
      layout: 'horizontal',
      height: 60,
      top: 20
    });

    this.stopButton = Ti.UI.createButton({
      title: 'Stop Demo',
      backgroundColor: '#e74c3c',
      color: 'white',
      borderRadius: 5,
      width: '45%',
      left: '2.5%'
    });

    this.statusButton = Ti.UI.createButton({
      title: 'Show Status',
      backgroundColor: '#3498db',
      color: 'white',
      borderRadius: 5,
      width: '45%',
      right: '2.5%'
    });

    buttonContainer.add(this.stopButton);
    buttonContainer.add(this.statusButton);

    // Add event listeners
    this.stopButton.addEventListener('click', () => {
      this.stopDemo();
    });

    this.statusButton.addEventListener('click', () => {
      this.showStatus();
    });

    // Add everything to window
    this.window.add(header);
    this.window.add(this.statusLabel);
    this.window.add(this.progressLabel);
    this.window.add(this.contentView);
    this.window.add(buttonContainer);

    // Open window
    this.window.open();
  }

  updateUI(status, content, step = null) {
    if (this.statusLabel) {
      this.statusLabel.text = status;
    }

    if (this.progressLabel && step !== null) {
      this.progressLabel.text = `Step ${step}/8`;
    }

    if (this.contentLabel && content) {
      const timestamp = new Date().toLocaleTimeString();
      const newContent = `[${timestamp}] ${content}\n\n${this.contentLabel.text}`;
      this.contentLabel.text = newContent;
    }
  }

  showStatus() {
    // ✅ CORREGIDO: Método faltante que causaba el error
    const status = {
      platform: Ti.Platform.osname,
      ttsSupported: this.speech ? this.speech.isSupported() : false,
      sttSupported: this.speechToText ? this.speechToText.isSupported() : false,
      voiceCount: this.bestVoices ? Object.keys(this.bestVoices).length : 0,
      isSpeaking: this.speech ? this.speech.isSpeaking : false,
      isRunning: this.isRunning,
      currentStep: this.demoStep
    };

    const statusText = `Platform: ${status.platform}
TTS Supported: ${status.ttsSupported}
STT Supported: ${status.sttSupported}
Voices Available: ${status.voiceCount}
Currently Speaking: ${status.isSpeaking}
Demo Running: ${status.isRunning}
Current Step: ${status.currentStep}`;

    const dialog = Ti.UI.createAlertDialog({
      title: 'Demo Status',
      message: statusText,
      buttonNames: ['OK']
    });
    dialog.show();
  }

  // ✅ CORREGIDO: Añadir método getStatus que faltaba
  getStatus() {
    return {
      platform: Ti.Platform.osname,
      ttsSupported: this.speech ? this.speech.isSupported() : false,
      sttSupported: this.speechToText ? this.speechToText.isSupported() : false,
      voiceCount: this.bestVoices ? Object.keys(this.bestVoices).length : 0,
      isSpeaking: this.speech ? this.speech.isSpeaking : false,
      isRunning: this.isRunning,
      currentStep: this.demoStep
    };
  }

  // =========================================================================
  // 🗣️ TEXT-TO-SPEECH INITIALIZATION
  // =========================================================================

  initializeTTS() {
    console.log('🔧 Initializing Text-to-Speech...');

    this.speech = utterance.createSpeech();

    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported on this device');
      return;
    }

    console.log('✅ TTS supported and ready');

    // Setup TTS event listeners
    this.speech.addEventListener('started', this.onTTSStarted.bind(this));
    this.speech.addEventListener('completed', this.onTTSCompleted.bind(this));
    this.speech.addEventListener('paused', this.onTTSPaused.bind(this));
    this.speech.addEventListener('continued', this.onTTSContinued.bind(this));
    this.speech.addEventListener('canceled', this.onTTSCanceled.bind(this));
    this.speech.addEventListener('error', this.onTTSError.bind(this));

    // Get voice information
    this.loadVoiceInformation();
  }

  loadVoiceInformation() {
    try {
      const voices = this.speech.getModernVoices();
      console.log(`🎵 Found ${voices.length} voices available`);

      // Analyze voice quality distribution
      const qualityStats = this.analyzeVoiceQuality(voices);
      console.log('📊 Voice Quality Distribution:', qualityStats);

      // Find best voices for different languages
      this.bestVoices = this.findBestVoices(voices);
      console.log('🏆 Best voices selected:', Object.keys(this.bestVoices));

    } catch (error) {
      console.warn('⚠️ Modern voice APIs not available, using basic voices');
      this.bestVoices = { 'en': null };
    }
  }

  analyzeVoiceQuality(voices) {
    const stats = { total: voices.length, byQuality: {}, byLanguage: {} };

    voices.forEach(voice => {
      // Quality analysis
      const quality = voice.quality || 200;
      const qualityTier = quality > 400 ? 'Premium' : quality > 300 ? 'Enhanced' : 'Standard';
      stats.byQuality[qualityTier] = (stats.byQuality[qualityTier] || 0) + 1;

      // Language analysis
      const language = (voice.language || voice.locale || 'unknown').split('-')[0];
      stats.byLanguage[language] = (stats.byLanguage[language] || 0) + 1;
    });

    return stats;
  }

  findBestVoices(voices) {
    const bestVoices = {};
    const languages = ['en', 'es', 'fr', 'de', 'it', 'pt'];

    languages.forEach(lang => {
      const langVoices = voices.filter(voice => {
        const voiceLang = (voice.language || voice.locale || '').toLowerCase();
        return voiceLang.includes(lang);
      });

      if (langVoices.length > 0) {
        // Prefer high quality, local voices
        const bestVoice = langVoices
          .sort((a, b) => {
            const qualityDiff = (b.quality || 0) - (a.quality || 0);
            const networkPref = (a.isNetworkConnectionRequired ? 1 : 0) - (b.isNetworkConnectionRequired ? 1 : 0);
            return qualityDiff || networkPref;
          })[0];

        bestVoices[lang] = bestVoice;
      }
    });

    return bestVoices;
  }

  // =========================================================================
  // 🎤 SPEECH-TO-TEXT INITIALIZATION
  // =========================================================================

  initializeSTT() {
    console.log('🔧 Initializing Speech-to-Text...');

    // STT only available on Android
    if (Ti.Platform.osname !== 'android') {
      console.log('ℹ️ STT only available on Android platform');
      this.speechToText = null;
      return;
    }

    this.speechToText = utterance.createSpeechToText();

    if (!this.speechToText.isSupported()) {
      console.error('❌ STT not supported on this device');
      this.speechToText = null;
      return;
    }

    console.log('✅ STT supported and ready');

    // Setup STT event listeners
    this.speechToText.addEventListener('started', this.onSTTStarted.bind(this));
    this.speechToText.addEventListener('completed', this.onSTTCompleted.bind(this));
    this.speechToText.addEventListener('error', this.onSTTError.bind(this));
  }

  // =========================================================================
  // 🎯 EVENT HANDLERS
  // =========================================================================

  onTTSStarted(e) {
    console.log('🎤 TTS Started');
    this.updateUI('🎤 Speaking...', 'TTS Started');
  }

  onTTSCompleted(e) {
    console.log('✅ TTS Completed');
    this.updateUI('✅ Speech completed', 'TTS Completed');
    this.continueDemo();
  }

  onTTSPaused(e) {
    console.log('⏸️ TTS Paused');
    this.updateUI('⏸️ Speech paused', 'TTS Paused');
  }

  onTTSContinued(e) {
    console.log('▶️ TTS Continued');
    this.updateUI('▶️ Speech continued', 'TTS Continued');
  }

  onTTSCanceled(e) {
    console.log('❌ TTS Canceled');
    this.updateUI('❌ Speech canceled', 'TTS Canceled');
  }

  onTTSError(e) {
    console.error('💥 TTS Error:', e.error);
    this.updateUI('💥 Speech error occurred', `TTS Error: ${e.error}`);
    this.handleTTSError(e.error);
  }

  onSTTStarted(e) {
    console.log('🎤 STT Started - Listening...');
    this.updateUI('🎤 Listening for speech...', 'STT Started - Listening');
  }

  onSTTCompleted(e) {
    console.log('✅ STT Completed');
    console.log('🔍 STT Event structure:', JSON.stringify(e, null, 2)); // DEBUG: Ver estructura completa

    // ✅ CORREGIDO: Los datos están en e.words[0], no en e.results[0]
    let recognizedText = null;

    if (e.words && e.words.length > 0) {
      recognizedText = e.words[0]; // ✅ AQUÍ estaban los datos!
      console.log('📝 Recognized (words array):', recognizedText);
    } else if (e.results && e.results.length > 0) {
      recognizedText = e.results[0];
      console.log('📝 Recognized (results array):', recognizedText);
    } else if (e.result) {
      recognizedText = e.result;
      console.log('📝 Recognized (result property):', recognizedText);
    } else if (e.text) {
      recognizedText = e.text;
      console.log('📝 Recognized (text property):', recognizedText);
    } else {
      console.log('🔍 Available properties in event:', Object.keys(e));
      console.log('🔇 No speech detected - checking all possible properties...');

      // Buscar cualquier propiedad que contenga texto (excluyendo 'type')
      for (const key in e) {
        if (key !== 'type' && typeof e[key] === 'string' && e[key].length > 0) {
          console.log(`🔍 Found text in property '${key}':`, e[key]);
          recognizedText = e[key];
          break;
        }
      }
    }

    if (recognizedText && recognizedText.trim().length > 0) {
      this.updateUI('📝 Speech recognized', `Recognized: "${recognizedText}"`);
      this.processVoiceCommand(recognizedText);
    } else {
      console.log('🔇 No speech detected after checking all properties');
      this.updateUI('🔇 No speech detected', 'No speech was detected');
      this.speak('No speech was detected. Please try again.');

      // En modo demo, continuar automáticamente después de un error
      if (this.demoStep >= 6) {
        setTimeout(() => {
          if (this.isRunning) {
            this.listen('Try saying: hello, time, or stop');
          }
        }, 3000);
      }
    }
  }

  onSTTError(e) {
    console.error('💥 STT Error:', e.error);
    this.updateUI('💥 Speech recognition error', `STT Error: ${e.error}`);
    this.handleSTTError(e.error);
  }

  // =========================================================================
  // 🎙️ CORE TTS METHODS
  // =========================================================================

  // ✅ NUEVO: Sistema inteligente de detección de idiomas
  normalizeLanguageCode(language) {
    if (!language) return 'en';

    // Normalizar formato: convertir ambos formatos a minúsculas
    let normalized = language.toLowerCase().trim();

    // Convertir formato iOS (es-ES) a Android (es_ES) si es necesario
    if (Ti.Platform.osname === 'android') {
      normalized = normalized.replace(/-/g, '_');
    } else {
      normalized = normalized.replace(/_/g, '-');
    }

    return normalized;
  }

  // ✅ NUEVO: Buscar idioma compatible disponible
  findCompatibleLanguage(requestedLanguage) {
    const normalizedRequest = this.normalizeLanguageCode(requestedLanguage);
    const baseLanguage = normalizedRequest.split(/[-_]/)[0]; // 'es' de 'es-ES' o 'es_ES'

    try {
      // Obtener idiomas disponibles
      const availableLanguages = this.speech.getModernLanguages ?
        this.speech.getModernLanguages() : [];

      console.log(`🔍 Looking for language: ${requestedLanguage} (normalized: ${normalizedRequest}, base: ${baseLanguage})`);
      console.log(`📋 Available languages: ${availableLanguages.slice(0, 10).join(', ')}...`);

      // 1. Intentar coincidencia exacta
      const exactMatch = availableLanguages.find(lang =>
        lang.toLowerCase() === normalizedRequest
      );
      if (exactMatch) {
        console.log(`✅ Exact match found: ${exactMatch}`);
        return exactMatch;
      }

      // 2. Intentar coincidencia por código base (es, en, fr, etc.)
      const baseMatch = availableLanguages.find(lang =>
        lang.toLowerCase().startsWith(baseLanguage + (Ti.Platform.osname === 'android' ? '_' : '-'))
      );
      if (baseMatch) {
        console.log(`✅ Base language match found: ${baseMatch} for ${baseLanguage}`);
        return baseMatch;
      }

      // 3. Buscar cualquier variante que contenga el código base
      const anyMatch = availableLanguages.find(lang =>
        lang.toLowerCase().includes(baseLanguage)
      );
      if (anyMatch) {
        console.log(`✅ Compatible variant found: ${anyMatch} for ${baseLanguage}`);
        return anyMatch;
      }

      console.log(`⚠️ No compatible language found for ${requestedLanguage}, using default`);
      return null;

    } catch (error) {
      console.warn(`⚠️ Error finding compatible language: ${error.message}`);
      return null;
    }
  }

  speak(text, options = {}) {
    if (!this.speech || !this.speech.isSupported()) {
      console.error('❌ TTS not available');
      return;
    }

    // ✅ MEJORADO: Sistema inteligente de idiomas
    const requestedLanguage = options.language || 'en';
    const compatibleLanguage = this.findCompatibleLanguage(requestedLanguage);

    // Build speech configuration with INTELLIGENT language selection
    const config = {
      text,
      rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
      ...options
    };

    // ✅ CRÍTICO: Usar idioma compatible encontrado
    if (compatibleLanguage) {
      if (Ti.Platform.osname === 'android') {
        config.language = compatibleLanguage; // Android usa 'language'
      } else {
        config.voice = compatibleLanguage;    // iOS usa 'voice'
      }
      console.log(`🎯 Using compatible language: ${compatibleLanguage} for requested: ${requestedLanguage}`);
    } else {
      // Fallback al idioma base sin especificar región
      const baseLanguage = requestedLanguage.split(/[-_]/)[0];
      if (Ti.Platform.osname === 'android') {
        config.language = baseLanguage;
      } else {
        config.voice = baseLanguage;
      }
      console.log(`🔄 Fallback to base language: ${baseLanguage}`);
    }

    // Use best available voice for specified language if available
    if (this.bestVoices && this.bestVoices[requestedLanguage.split(/[-_]/)[0]]) {
      const langCode = requestedLanguage.split(/[-_]/)[0]; // 'en' from 'en-US'
      config.voice = this.bestVoices[langCode].name;
      console.log(`🎯 Using best voice: ${config.voice} for ${langCode}`);
    }

    // Platform-specific options
    if (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad') {
      if (options.volume !== undefined) config.volume = options.volume;
      if (options.preUtteranceDelay !== undefined) config.preUtteranceDelay = options.preUtteranceDelay;
      if (options.postUtteranceDelay !== undefined) config.postUtteranceDelay = options.postUtteranceDelay;
    } else if (Ti.Platform.osname === 'android') {
      if (options.pitch !== undefined) config.pitch = options.pitch;
    }

    console.log(`🗣️ Speaking: "${text}"`);
    console.log(`🔧 TTS Config:`, config);
    this.speech.startSpeaking(config);
  }

  demonstrateSpeechRates() {
    console.log('🎵 Demonstrating cross-platform speech rates...');

    if (this.isDemoInProgress) {
      console.log('⚠️ Demo already in progress, skipping...');
      this.continueDemo();
      return;
    }

    this.isDemoInProgress = true;

    const rateTests = [
      { text: 'This is very slow speech for accessibility', rate: this.speech.VERY_SLOW_SPEECH_RATE, name: 'Very Slow' },
      { text: 'This is slow speech for careful listening', rate: this.speech.SLOW_SPEECH_RATE, name: 'Slow' },
      { text: 'This is normal speech at default speed', rate: this.speech.DEFAULT_SPEECH_RATE, name: 'Default' },
      { text: 'This is fast speech for efficient reading', rate: this.speech.FAST_SPEECH_RATE, name: 'Fast' },
      { text: 'This is very fast speech for quick consumption', rate: this.speech.VERY_FAST_SPEECH_RATE, name: 'Very Fast' }
    ];

    let currentTest = 0;

    const runNextTest = () => {
      if (currentTest >= rateTests.length) {
        console.log('✅ Speech rate demonstration completed');
        this.isDemoInProgress = false;
        this.continueDemo();
        return;
      }

      const test = rateTests[currentTest];
      console.log(`🎯 Testing ${test.name} rate (${test.rate})`);

      // ✅ CORREGIDO: Usar el método speak() que ya fuerza inglés
      this.speak(test.text, {
        rate: test.rate,
        language: 'en-US' // ← FORZAR INGLÉS EXPLÍCITAMENTE
      });

      currentTest++;
    };

    // Use a temporary event handler for this demo
    const tempHandler = (e) => {
      runNextTest();
    };

    this.speech.addEventListener('completed', tempHandler);

    // Start the first test
    runNextTest();

    // Clean up after all tests complete (with safety timeout)
    const cleanup = () => {
      this.speech.removeEventListener('completed', tempHandler);
    };

    setTimeout(cleanup, rateTests.length * 5000); // 5 seconds per test max
  }

  demonstrateVoiceSelection() {
    console.log('🌍 Demonstrating multi-language voice selection...');

    if (this.isDemoInProgress) {
      console.log('⚠️ Demo already in progress, skipping...');
      this.continueDemo();
      return;
    }

    this.isDemoInProgress = true;

    // ✅ MEJORADO: Usar códigos base más flexibles
    const languageTests = [
      { text: 'Hello! This is English with high quality voice.', language: 'en' }, // ← Código base flexible
      { text: '¡Hola! Este es español con voz de alta calidad.', language: 'es' }, // ← Sin especificar región
      { text: 'Bonjour! Ceci est français avec une voix de haute qualité.', language: 'fr' },
      { text: 'Hallo! Das ist Deutsch mit hochwertiger Stimme.', language: 'de' }
    ];

    let currentTest = 0;

    const runNextVoiceTest = () => {
      if (currentTest >= languageTests.length) {
        console.log('✅ Voice selection demonstration completed');
        this.isDemoInProgress = false;

        // ✅ CORREGIDO: Restaurar voz a inglés después de la demo
        setTimeout(() => {
          this.speak('Voice selection demonstration completed. Returning to English.', { language: 'en' });
          // ✅ CRÍTICO: Esperar más tiempo antes de continuar para evitar overlap
          setTimeout(() => this.continueDemo(), 3000);
        }, 1000);
        return;
      }

      const test = languageTests[currentTest];
      console.log(`🌍 Testing ${test.language} voice`);

      this.speak(test.text, {
        language: test.language,
        rate: this.speech.DEFAULT_SPEECH_RATE
      });

      currentTest++;
    };

    // Use a temporary event handler for this demo
    const tempVoiceHandler = (e) => {
      runNextVoiceTest();
    };

    this.speech.addEventListener('completed', tempVoiceHandler);

    // Start the first test
    runNextVoiceTest();

    // Clean up after all tests complete (with safety timeout)
    const cleanup = () => {
      this.speech.removeEventListener('completed', tempVoiceHandler);
    };

    setTimeout(cleanup, languageTests.length * 8000); // 8 seconds per test max
  }

  // =========================================================================
  // 🎤 CORE STT METHODS
  // =========================================================================

  listen(promptText = 'Speak now...', options = {}) {
    if (!this.speechToText) {
      console.log('ℹ️ Speech recognition not available on this platform');
      this.speak('Speech recognition is only available on Android devices.');
      return;
    }

    const config = {
      promptText,
      maxResults: options.maxResults || 5,
      languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
    };

    console.log(`🎤 Starting speech recognition: "${promptText}"`);
    console.log('🔧 STT Config:', config);

    try {
      this.speechToText.startSpeechToText(config);
    } catch (error) {
      console.error('💥 Error starting STT:', error);
      this.speak('Error starting speech recognition. Please try again.');
    }
  }

  processVoiceCommand(recognizedText) {
    const command = recognizedText.toLowerCase().trim();
    console.log(`🎯 Processing voice command: "${recognizedText}"`);
    console.log(`🎯 Normalized command: "${command}"`);

    // ✅ MEJORADO: Comandos de voz con idiomas base flexibles
    if (command.includes('hello') || command.includes('hi')) {
      this.speak('Hello! How can I help you today?', { language: 'en' });
    } else if (command.includes('time')) {
      const now = new Date().toLocaleTimeString();
      this.speak(`The current time is ${now}`, { language: 'en' });
    } else if (command.includes('date')) {
      const today = new Date().toLocaleDateString();
      this.speak(`Today's date is ${today}`, { language: 'en' });
    } else if (command.includes('slow')) {
      this.speak('This is slow speech', { rate: this.speech.SLOW_SPEECH_RATE, language: 'en' });
    } else if (command.includes('fast')) {
      this.speak('This is fast speech', { rate: this.speech.FAST_SPEECH_RATE, language: 'en' });
    } else if (command.includes('spanish') || command.includes('español')) {
      this.speak('Hola, esto es español', { language: 'es' }); // ← Código base flexible
    } else if (command.includes('french') || command.includes('français')) {
      this.speak('Bonjour, ceci est français', { language: 'fr' }); // ← Código base flexible
    } else if (command.includes('german') || command.includes('deutsch')) {
      this.speak('Hallo, das ist Deutsch', { language: 'de' }); // ← AÑADIDO: Comando alemán
    } else if (command.includes('stop') || command.includes('quit') || command.includes('exit')) {
      this.speak('Goodbye! Demo stopping.', { language: 'en' });
      setTimeout(() => this.stopDemo(), 2000);
      return;
    } else {
      this.speak(`You said: ${recognizedText}. Try saying hello, time, date, slow, fast, spanish, french, german, or stop.`, { language: 'en' });
    }

    // ✅ CORREGIDO: Esperar MUCHO más tiempo antes de reactivar STT
    if (this.demoStep >= 7 && this.isRunning) {
      setTimeout(() => {
        if (this.isRunning && !this.isDemoInProgress) {
          this.listen('Say another command or stop to end');
        }
      }, 6000);
    }
  }

  // =========================================================================
  // 🛡️ ERROR HANDLING
  // =========================================================================

  handleTTSError(error) {
    console.error('🚨 TTS Error occurred:', error);

    const errorMessages = {
      'AVSpeechSynthesizerErrorVoiceUnavailable': 'Selected voice is not available',
      'AVSpeechSynthesizerErrorAudioUnavailable': 'Audio system is not available',
      'SYNTHESIS_FAILED': 'Speech synthesis failed',
      'NETWORK_ERROR': 'Network error occurred'
    };

    const userMessage = errorMessages[error] || `Speech error: ${error}`;
    console.log(`💬 User-friendly error: ${userMessage}`);

    // Implement error recovery
    switch (error) {
      case 'AVSpeechSynthesizerErrorVoiceUnavailable':
        console.log('🔄 Falling back to default voice...');
        // Continue with default voice
        this.continueDemo();
        break;
      default:
        console.log('🔄 Continuing demo after error...');
        setTimeout(() => this.continueDemo(), 2000);
    }
  }

  handleSTTError(error) {
    console.error('🚨 STT Error occurred:', error);

    const errorMessages = {
      'ERROR_NETWORK_TIMEOUT': 'Network timeout. Please check your connection.',
      'ERROR_NETWORK': 'Network error. Please check your connection.',
      'ERROR_AUDIO': 'Audio recording error. Check microphone permissions.',
      'ERROR_SERVER': 'Speech recognition server error.',
      'ERROR_CLIENT': 'Speech recognition client error.',
      'ERROR_SPEECH_TIMEOUT': 'No speech detected. Please speak more clearly.',
      'ERROR_NO_MATCH': 'No speech was recognized. Please try again.',
      'ERROR_RECOGNIZER_BUSY': 'Speech recognition is busy. Please wait.',
      'ERROR_INSUFFICIENT_PERMISSIONS': 'Microphone permission required.'
    };

    const userMessage = errorMessages[error] || `Speech recognition error: ${error}`;
    this.speak(userMessage);
  }

  // =========================================================================
  // 🎮 DEMO CONTROL
  // =========================================================================

  startDemo() {
    console.log('🎬 Starting Utterance v3.1 Interactive Demo');
    this.updateUI('🎬 Starting demo...', 'Utterance v3.1 Interactive Demo Started', 0);
    this.isRunning = true;
    this.demoStep = 0;
    this.runDemoStep();
  }

  continueDemo() {
    if (!this.isRunning || this.isDemoInProgress) return;

    // ✅ CORREGIDO: Aumentar delay para evitar overlap con STT
    setTimeout(() => {
      this.demoStep++;
      this.runDemoStep();
    }, 3000); // ← AUMENTADO DE 2000 a 3000ms
  }

  runDemoStep() {
    if (!this.isRunning) return;

    switch (this.demoStep) {
      case 0:
        this.updateUI('🎙️ Welcome message', 'Playing welcome message', 0);
        this.speak('Welcome to Utterance version 3.0! This demo will show you all the new features.', { language: 'en-US' });
        break;

      case 1:
        this.updateUI('🎵 Rate demo intro', 'Introducing speech rate demonstration', 1);
        this.speak('First, let me demonstrate cross-platform speech rate consistency.', { language: 'en-US' });
        break;

      case 2:
        this.updateUI('🎵 Testing speech rates', 'Demonstrating different speech rates', 2);
        this.demonstrateSpeechRates();
        break;

      case 3:
        this.updateUI('🌍 Voice demo intro', 'Introducing voice selection', 3);
        this.speak('Now I will demonstrate multi-language voice selection with quality detection.', { language: 'en-US' });
        break;

      case 4:
        this.updateUI('🌍 Testing voices', 'Demonstrating multi-language voices', 4);
        this.demonstrateVoiceSelection();
        break;

      case 5:
        if (this.speechToText) {
          this.updateUI('🎤 STT intro', 'Introducing speech recognition', 5);
          this.speak('Now let\'s test speech recognition. I will listen for your voice commands.', { language: 'en-US' });
        } else {
          this.updateUI('ℹ️ STT not available', 'Speech recognition not available on this platform', 5);
          this.speak('Speech recognition is not available on this platform. Only Android supports speech to text.', { language: 'en-US' });
          this.demoStep = 7; // Skip STT demo
        }
        break;

      case 6:
        if (this.speechToText) {
          this.updateUI('🎤 Listening...', 'Ready for voice commands', 6);
          // ✅ CRÍTICO: Esperar MÁS tiempo antes de activar STT para evitar overlap
          setTimeout(() => {
            if (this.isRunning && !this.isDemoInProgress) { // ← Verificar que no esté en otra demo
              this.listen('Say a voice command like: hello, time, date, slow, fast, spanish, french, or stop');
            }
          }, 2500); // ← AUMENTADO a 2500ms
        } else {
          this.continueDemo();
        }
        break;

      case 7:
        this.updateUI('✅ Demo completed', 'All demonstrations finished', 7);
        this.speak('Demo completed! You can continue experimenting with voice commands, or say stop to end.', { language: 'en-US' });
        break;

      case 8:
        if (this.speechToText) {
          this.updateUI('🎤 Ready for commands', 'Waiting for voice commands', 8);
          // ✅ CRÍTICO: Esperar MÁS tiempo antes de activar STT
          setTimeout(() => {
            if (this.isRunning && !this.isDemoInProgress) {
              this.listen('Say another command or stop to end the demo');
            }
          }, 2500); // ← AUMENTADO a 2500ms
        } else {
          this.updateUI('👋 Demo ending', 'Thank you for trying the demo', 8);
          this.speak('Thank you for trying Utterance v3.1!', { language: 'en-US' });
          setTimeout(() => this.stopDemo(), 3000);
        }
        break;

      default:
        if (this.speechToText && this.demoStep > 8) {
          // ✅ CORREGIDO: Evitar múltiples listeners simultáneos
          if (!this.isDemoInProgress) {
            this.updateUI('🎤 Listening...', 'Waiting for voice commands');
            // ✅ CRÍTICO: Esperar antes de activar STT
            setTimeout(() => {
              if (this.isRunning && !this.isDemoInProgress) {
                this.listen('Say a command or stop to end');
              }
            }, 2500); // ← AUMENTADO a 2500ms
          }
        } else {
          this.stopDemo();
        }
    }
  }

  stopDemo() {
    console.log('🛑 Stopping demo');
    this.updateUI('🛑 Demo stopped', 'Demo has been stopped');
    this.isRunning = false;
    this.isDemoInProgress = false;

    // v3.0 Unified API: Use isSpeaking as property (now consistent across platforms)
    if (this.speech && this.speech.isSpeaking) {
      this.speech.stopSpeaking();
    }

    console.log('✅ Utterance v3.1 Demo completed successfully!');

    // Show final dialog
    setTimeout(() => {
      const dialog = Ti.UI.createAlertDialog({
        title: 'Demo Completed',
        message: 'Utterance v3.1 demo has finished successfully!',
        buttonNames: ['Close App', 'Restart Demo']
      });

      dialog.addEventListener('click', (e) => {
        if (e.index === 0) {
          // Close app
          if (this.window) {
            this.window.close();
          }
        } else {
          // Restart demo
          this.startDemo();
        }
      });

      dialog.show();
    }, 2000);
  }

  cleanup() {
    console.log('🧹 Cleaning up Utterance demo...');
    this.stopDemo();

    // Remove event listeners and cleanup
    if (this.speech) {
      this.speech.removeEventListener('started', this.onTTSStarted);
      this.speech.removeEventListener('completed', this.onTTSCompleted);
      this.speech.removeEventListener('error', this.onTTSError);
    }

    if (this.speechToText) {
      this.speechToText.removeEventListener('started', this.onSTTStarted);
      this.speechToText.removeEventListener('completed', this.onSTTCompleted);
      this.speechToText.removeEventListener('error', this.onSTTError);
    }

    if (this.window) {
      this.window.close();
    }
  }
}

// =============================================================================
// 🚀 APPLICATION STARTUP
// =============================================================================

// Create and start the demo
const demo = new UtteranceV3Demo();

// Handle app lifecycle
Ti.App.addEventListener('pause', () => {
  console.log('📱 App paused, cleaning up...');
  demo.cleanup();
});

Ti.App.addEventListener('resume', () => {
  console.log('📱 App resumed');
});

// Export for external use
module.exports = UtteranceV3Demo;
