/**
 * 🎙️ Voice Explorer - Complete Voice Testing Example
 * Demonstrates how to discover and use specific voices on both platforms
 */

const utterance = require('bencoding.utterance');

class VoiceExplorer {
  constructor() {
    console.log('🎙️ Starting Voice Explorer...');
    this.speech = utterance.createSpeech();

    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported on this device');
      return;
    }

    this.createUI();
    this.loadVoices();
  }

  createUI() {
    this.window = Ti.UI.createWindow({
      title: 'Voice Explorer',
      backgroundColor: '#f5f5f5',
      layout: 'vertical'
    });

    // Header
    const header = Ti.UI.createLabel({
      text: '🎙️ Voice Explorer & Tester',
      font: { fontSize: 20, fontWeight: 'bold' },
      color: '#333',
      textAlign: 'center',
      top: 20,
      height: 40
    });

    // Voice info display
    this.voiceInfoLabel = Ti.UI.createLabel({
      text: 'Loading voices...',
      font: { fontSize: 12 },
      color: '#666',
      textAlign: 'left',
      top: 10,
      left: 15,
      right: 15,
      height: Ti.UI.SIZE
    });

    // Scrollable voice list
    this.scrollView = Ti.UI.createScrollView({
      top: 20,
      height: '60%',
      showVerticalScrollIndicator: true
    });

    // Control buttons
    const buttonContainer = Ti.UI.createView({
      layout: 'horizontal',
      height: 60,
      top: 20
    });

    const testAllButton = Ti.UI.createButton({
      title: 'Test All Voices',
      backgroundColor: '#e74c3c',
      color: 'white',
      borderRadius: 5,
      width: '45%',
      left: '2.5%'
    });

    const analyzeButton = Ti.UI.createButton({
      title: 'Analyze Voices',
      backgroundColor: '#3498db',
      color: 'white',
      borderRadius: 5,
      width: '45%',
      right: '2.5%'
    });

    testAllButton.addEventListener('click', () => this.testAllVoices());
    analyzeButton.addEventListener('click', () => this.analyzeVoices());

    buttonContainer.add(testAllButton);
    buttonContainer.add(analyzeButton);

    this.window.add(header);
    this.window.add(this.voiceInfoLabel);
    this.window.add(this.scrollView);
    this.window.add(buttonContainer);

    this.window.open();
  }

  loadVoices() {
    console.log('📋 Loading available voices...');

    // ✅ ANDROID FIX: Esperar a que TTS esté listo antes de obtener voces
    if (Ti.Platform.osname === 'android') {
      // Esperar un poco más para Android
      setTimeout(() => {
        this.loadVoicesWithRetry();
      }, 2000);
    } else {
      this.loadVoicesWithRetry();
    }
  }

  // ✅ NUEVO: Método con reintentos para Android
  loadVoicesWithRetry() {
    let retryCount = 0;
    const maxRetries = 5;

    const attemptLoad = () => {
      try {
        // ✅ ANDROID FIX: Verificar que TTS esté listo
        if (Ti.Platform.osname === 'android' && this.speech.isTTSReady && !this.speech.isTTSReady()) {
          console.log(`⏳ TTS not ready yet, retry ${retryCount + 1}/${maxRetries}`);
          retryCount++;
          if (retryCount < maxRetries) {
            setTimeout(attemptLoad, 1000);
            return;
          }
        }

        // ✅ MÉTODO MODERNO (v3.0+): Información detallada
        this.modernVoices = this.speech.getModernVoices();
        console.log(`🎵 Modern API: Found ${this.modernVoices.length} voices`);

        if (this.modernVoices.length > 0) {
          this.displayModernVoices();
        } else {
          console.warn('⚠️ Modern voice API returned empty, trying legacy');
          this.loadLegacyVoices();
        }
      } catch (error) {
        console.warn('⚠️ Modern voice API not available, using legacy');
        this.loadLegacyVoices();
      }
    };

    attemptLoad();
  }

  loadLegacyVoices() {
    try {
      // ✅ MÉTODO LEGACY: Lista básica  
      this.legacyVoices = this.speech.getVoices();
      console.log(`🎵 Legacy API: Found ${this.legacyVoices.length} voices`);
      this.displayLegacyVoices();
    } catch (error) {
      console.error('❌ No voice APIs available');
      this.voiceInfoLabel.text = 'No voice information available on this device';
    }
  }

  displayModernVoices() {
    const containerView = Ti.UI.createView({
      layout: 'vertical',
      height: Ti.UI.SIZE,
      top: 10
    });

    // Platform info
    const platformInfo = `Platform: ${Ti.Platform.osname}\nTotal Voices: ${this.modernVoices.length}`;
    this.voiceInfoLabel.text = platformInfo;

    // Group voices by language
    const voicesByLanguage = this.groupVoicesByLanguage(this.modernVoices);

    Object.keys(voicesByLanguage).forEach((language, index) => {
      const voices = voicesByLanguage[language];

      // Language header
      const langHeader = Ti.UI.createLabel({
        text: `🌍 ${language.toUpperCase()} (${voices.length} voices)`,
        font: { fontSize: 16, fontWeight: 'bold' },
        color: '#2c3e50',
        textAlign: 'left',
        top: index === 0 ? 10 : 20,
        left: 15,
        right: 15,
        height: 30
      });
      containerView.add(langHeader);

      // Voice buttons for this language
      voices.forEach((voice, voiceIndex) => {
        const button = this.createVoiceButton(voice, voiceIndex);
        containerView.add(button);
      });
    });

    this.scrollView.add(containerView);
  }

  displayLegacyVoices() {
    const containerView = Ti.UI.createView({
      layout: 'vertical',
      height: Ti.UI.SIZE,
      top: 10
    });

    this.voiceInfoLabel.text = `Platform: ${Ti.Platform.osname}\nLegacy Voices: ${this.legacyVoices.length}`;

    this.legacyVoices.forEach((voice, index) => {
      const button = Ti.UI.createButton({
        title: `🎤 ${voice}`,
        backgroundColor: '#95a5a6',
        color: 'white',
        borderRadius: 5,
        top: 10,
        left: 15,
        right: 15,
        height: 50
      });

      button.addEventListener('click', () => {
        this.testVoice(voice, `Hello! This is voice ${voice}`);
      });

      containerView.add(button);
    });

    this.scrollView.add(containerView);
  }

  createVoiceButton(voice, index) {
    // Extract voice information
    const name = voice.name || 'Unknown';
    const language = voice.language || voice.locale || 'Unknown';
    const quality = voice.quality || 'Unknown';
    const network = voice.isNetworkConnectionRequired ? '🌐' : '📱';

    // Color based on quality
    let backgroundColor = '#95a5a6'; // Default gray
    if (quality > 400) backgroundColor = '#27ae60'; // High quality - green
    else if (quality > 300) backgroundColor = '#f39c12'; // Medium - orange
    else if (quality > 200) backgroundColor = '#3498db'; // Basic - blue

    const button = Ti.UI.createButton({
      title: `${network} ${name}\n${language} | Quality: ${quality}`,
      backgroundColor: backgroundColor,
      color: 'white',
      borderRadius: 5,
      font: { fontSize: 12 },
      textAlign: 'left',
      top: 5,
      left: 15,
      right: 15,
      height: 60
    });

    button.addEventListener('click', () => {
      this.testSpecificVoice(voice);
    });

    return button;
  }

  groupVoicesByLanguage(voices) {
    const grouped = {};

    voices.forEach(voice => {
      const language = voice.language || voice.locale || 'unknown';
      const langCode = language.split('-')[0].split('_')[0]; // Get base language

      if (!grouped[langCode]) {
        grouped[langCode] = [];
      }
      grouped[langCode].push(voice);
    });

    return grouped;
  }

  testSpecificVoice(voice) {
    const name = voice.name || voice.language || voice.locale;
    const language = voice.language || voice.locale;

    console.log(`🎤 Testing voice: ${name}`);
    console.log(`🌍 Voice language: ${language}`);

    // Create test text based on language
    const testTexts = {
      'en': 'Hello! This is an English voice test. How does this sound?',
      'es': '¡Hola! Esta es una prueba de voz en español. ¿Cómo suena esto?',
      'fr': 'Bonjour! Ceci est un test de voix française. Comment cela sonne-t-il?',
      'de': 'Hallo! Dies ist ein deutscher Sprachtest. Wie klingt das?',
      'it': 'Ciao! Questo è un test vocale italiano. Come suona?',
      'pt': 'Olá! Este é um teste de voz portuguesa. Como isso soa?'
    };

    const langCode = language ? language.split('-')[0].split('_')[0] : 'en';
    const testText = testTexts[langCode] || `Testing voice: ${name}. This is a voice quality test.`;

    // ✅ iOS FIX: Usar parámetro correcto según plataforma
    const speechConfig = {
      text: testText,
      rate: this.speech.DEFAULT_SPEECH_RATE
    };

    if (Ti.Platform.osname === 'android') {
      // ✅ ANDROID: Usar 'language' y aplicar normalización automática
      speechConfig.language = language || name;
      console.log(`🤖 Android: Using language parameter: ${speechConfig.language}`);
    } else {
      // ✅ iOS: Usar 'voice' y aplicar normalización automática  
      speechConfig.voice = language || name;
      console.log(`🍎 iOS: Using voice parameter: ${speechConfig.voice}`);
    }

    console.log(`🎤 Speech config:`, speechConfig);
    this.speech.startSpeaking(speechConfig);
  }

  testVoice(voiceName, text) {
    console.log(`🎤 Testing legacy voice: ${voiceName}`);

    // ✅ LEGACY FIX: Usar parámetro correcto según plataforma
    const speechConfig = {
      text: text,
      rate: this.speech.DEFAULT_SPEECH_RATE
    };

    if (Ti.Platform.osname === 'android') {
      speechConfig.language = voiceName;
      console.log(`🤖 Android legacy: Using language parameter: ${speechConfig.language}`);
    } else {
      speechConfig.voice = voiceName;
      console.log(`🍎 iOS legacy: Using voice parameter: ${speechConfig.voice}`);
    }

    this.speech.startSpeaking(speechConfig);
  }

  testAllVoices() {
    console.log('🎵 Testing all voices sequentially...');

    const voices = this.modernVoices || this.legacyVoices || [];
    if (voices.length === 0) {
      console.log('❌ No voices available to test');

      // ✅ ANDROID DEBUG: Intentar obtener voces de nuevo
      if (Ti.Platform.osname === 'android') {
        console.log('🔄 Retrying voice detection for Android...');
        setTimeout(() => {
          try {
            const retryVoices = this.speech.getModernVoices();
            console.log(`🔄 Retry found ${retryVoices.length} voices`);
            if (retryVoices.length > 0) {
              this.modernVoices = retryVoices;
              this.displayModernVoices();
            }
          } catch (e) {
            console.error('🔄 Retry failed:', e.message);
          }
        }, 2000);
      }
      return;
    }

    let currentIndex = 0;

    const testNext = () => {
      if (currentIndex >= voices.length) {
        console.log('✅ All voices tested!');
        return;
      }

      const voice = voices[currentIndex];
      const name = voice.name || voice.language || voice;
      const language = voice.language || voice.locale;

      console.log(`Testing voice ${currentIndex + 1}/${voices.length}: ${name}`);

      // ✅ PLATFORM-SPECIFIC CONFIG
      const speechConfig = {
        text: `Voice number ${currentIndex + 1}. This is ${name}.`,
        rate: this.speech.FAST_SPEECH_RATE
      };

      if (Ti.Platform.osname === 'android') {
        speechConfig.language = language || name;
      } else {
        speechConfig.voice = language || name;
      }

      this.speech.startSpeaking(speechConfig);
      currentIndex++;
    };

    // Setup event listener for sequential testing
    const completedHandler = () => {
      setTimeout(testNext, 500); // Small delay between voices
    };

    this.speech.addEventListener('completed', completedHandler);

    // Start testing
    testNext();

    // Cleanup after all tests (timeout safety)
    setTimeout(() => {
      this.speech.removeEventListener('completed', completedHandler);
    }, voices.length * 5000); // 5 seconds max per voice
  }

  analyzeVoices() {
    console.log('📊 Analyzing voice characteristics...');

    const voices = this.modernVoices || [];
    if (voices.length === 0) {
      console.log('No detailed voice data available for analysis');
      return;
    }

    const analysis = this.performVoiceAnalysis(voices);
    this.displayAnalysis(analysis);
  }

  performVoiceAnalysis(voices) {
    const analysis = {
      total: voices.length,
      byLanguage: {},
      byQuality: {},
      networkVoices: 0,
      localVoices: 0,
      uniqueLanguages: new Set()
    };

    voices.forEach(voice => {
      // Language analysis
      const language = voice.language || voice.locale || 'unknown';
      const langCode = language.split('-')[0].split('_')[0];

      analysis.byLanguage[langCode] = (analysis.byLanguage[langCode] || 0) + 1;
      analysis.uniqueLanguages.add(langCode);

      // Quality analysis
      const quality = voice.quality || 0;
      let qualityTier = 'Unknown';
      if (quality > 400) qualityTier = 'Premium';
      else if (quality > 300) qualityTier = 'Enhanced';
      else if (quality > 200) qualityTier = 'Standard';
      else if (quality > 0) qualityTier = 'Basic';

      analysis.byQuality[qualityTier] = (analysis.byQuality[qualityTier] || 0) + 1;

      // Network vs Local
      if (voice.isNetworkConnectionRequired) {
        analysis.networkVoices++;
      } else {
        analysis.localVoices++;
      }
    });

    return analysis;
  }

  displayAnalysis(analysis) {
    const analysisText = `
📊 VOICE ANALYSIS REPORT

🎵 Total Voices: ${analysis.total}
🌍 Languages: ${analysis.uniqueLanguages.size} (${Array.from(analysis.uniqueLanguages).join(', ')})

📱 Local Voices: ${analysis.localVoices}
🌐 Network Voices: ${analysis.networkVoices}

🏆 QUALITY DISTRIBUTION:
${Object.entries(analysis.byQuality).map(([quality, count]) =>
      `   ${quality}: ${count} voices`).join('\n')}

🌍 LANGUAGE DISTRIBUTION:
${Object.entries(analysis.byLanguage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([lang, count]) => `   ${lang}: ${count} voices`).join('\n')}
    `.trim();

    console.log(analysisText);

    // Show in dialog
    const dialog = Ti.UI.createAlertDialog({
      title: 'Voice Analysis',
      message: analysisText,
      buttonNames: ['OK']
    });
    dialog.show();
  }
}

// Start the Voice Explorer
const explorer = new VoiceExplorer();

module.exports = VoiceExplorer;
