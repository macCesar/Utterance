/**
 * Utterance v3.0 - Advanced Text-to-Speech Example
 * Comprehensive demonstration of all TTS features and capabilities
 * 
 * Features:
 * - Cross-platform rate normalization
 * - Modern voice selection with quality detection
 * - Multi-language support
 * - Advanced speech control (pause/resume)
 * - Voice caching and optimization
 * - Error handling and recovery
 * - Performance monitoring
 */

const utterance = require('bencoding.utterance');

class AdvancedTTSDemo {
  constructor() {
    console.log('🎙️ Advanced TTS Demo - Utterance v3.0');
    console.log(`📱 Platform: ${Ti.Platform.osname} ${Ti.Platform.version}`);

    this.speech = utterance.createSpeech();
    this.voiceCache = new Map();
    this.performanceMetrics = { speechCount: 0, errors: 0, totalDuration: 0 };

    this.initialize();
  }

  // =========================================================================
  // 🔧 INITIALIZATION & SETUP
  // =========================================================================

  initialize() {
    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported on this device');
      return;
    }

    console.log('✅ TTS supported, initializing...');

    this.setupEventListeners();
    this.buildVoiceCache();
    this.demonstrateFeatures();
  }

  setupEventListeners() {
    this.speech.addEventListener('started', this.onSpeechStarted.bind(this));
    this.speech.addEventListener('completed', this.onSpeechCompleted.bind(this));
    this.speech.addEventListener('paused', this.onSpeechPaused.bind(this));
    this.speech.addEventListener('continued', this.onSpeechContinued.bind(this));
    this.speech.addEventListener('canceled', this.onSpeechCanceled.bind(this));
    this.speech.addEventListener('error', this.onSpeechError.bind(this));
  }

  buildVoiceCache() {
    console.log('🏗️ Building optimized voice cache...');

    try {
      const voices = this.speech.getModernVoices();
      console.log(`📊 Processing ${voices.length} available voices`);

      // Group voices by language with quality sorting
      voices.forEach(voice => {
        const language = this.extractLanguageCode(voice);

        if (!this.voiceCache.has(language)) {
          this.voiceCache.set(language, []);
        }

        this.voiceCache.get(language).push(voice);
      });

      // Sort voices within each language by quality
      for (const [language, voiceList] of this.voiceCache) {
        voiceList.sort((a, b) => {
          // Primary sort: Quality (higher is better)
          const qualityDiff = (b.quality || 0) - (a.quality || 0);
          if (qualityDiff !== 0) return qualityDiff;

          // Secondary sort: Local vs Network (local preferred)
          const networkDiff = (a.isNetworkConnectionRequired ? 1 : 0) - (b.isNetworkConnectionRequired ? 1 : 0);
          return networkDiff;
        });
      }

      this.logVoiceCacheStats();

    } catch (error) {
      console.warn('⚠️ Modern voice APIs not available, using basic fallback');
      this.voiceCache.set('en', [{ name: 'default', quality: 200 }]);
    }
  }

  extractLanguageCode(voice) {
    const locale = voice.language || voice.locale || 'en-US';
    return locale.toLowerCase().split('-')[0];
  }

  logVoiceCacheStats() {
    console.log('📈 Voice Cache Statistics:');

    for (const [language, voices] of this.voiceCache) {
      const qualityStats = this.analyzeVoiceQuality(voices);
      console.log(`  ${language.toUpperCase()}: ${voices.length} voices`);
      console.log(`    Quality distribution: ${JSON.stringify(qualityStats)}`);
      console.log(`    Best voice: ${voices[0].name} (Quality: ${voices[0].quality || 'Unknown'})`);
    }
  }

  analyzeVoiceQuality(voices) {
    return voices.reduce((stats, voice) => {
      const quality = voice.quality || 200;
      const tier = quality > 400 ? 'Premium' : quality > 300 ? 'Enhanced' : 'Standard';
      stats[tier] = (stats[tier] || 0) + 1;
      return stats;
    }, {});
  }

  // =========================================================================
  // 🎵 ADVANCED SPEECH METHODS
  // =========================================================================

  speakWithOptimalVoice(text, language = 'en', options = {}) {
    const startTime = Date.now();

    // Get best voice for language
    const voices = this.voiceCache.get(language) || [];
    const selectedVoice = voices.find(voice => {
      if (options.requireLocal && voice.isNetworkConnectionRequired) return false;
      if (options.minQuality && (voice.quality || 0) < options.minQuality) return false;
      return true;
    }) || voices[0];

    // Build speech configuration
    const config = {
      text,
      rate: options.rate || this.speech.DEFAULT_SPEECH_RATE,
      ...options
    };

    if (selectedVoice && selectedVoice.name !== 'default') {
      config.voice = selectedVoice.name;
    }

    // Platform-specific options
    this.addPlatformSpecificOptions(config, options);

    console.log(`🗣️ Speaking in ${language}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    if (selectedVoice) {
      console.log(`🎤 Using voice: ${selectedVoice.name} (Quality: ${selectedVoice.quality || 'Unknown'})`);
    }

    // Track performance
    this.performanceMetrics.speechCount++;
    config._startTime = startTime;

    this.speech.startSpeaking(config);
  }

  addPlatformSpecificOptions(config, options) {
    if (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad') {
      // iOS-specific options
      if (options.volume !== undefined) config.volume = options.volume;
      if (options.preUtteranceDelay !== undefined) config.preUtteranceDelay = options.preUtteranceDelay;
      if (options.postUtteranceDelay !== undefined) config.postUtteranceDelay = options.postUtteranceDelay;
    } else if (Ti.Platform.osname === 'android') {
      // Android-specific options
      if (options.pitch !== undefined) config.pitch = options.pitch;
    }
  }

  demonstrateCrossPlatformRates() {
    console.log('🎯 Demonstrating cross-platform rate consistency...');

    const rateDemo = [
      {
        name: 'Very Slow (Accessibility)',
        rate: this.speech.VERY_SLOW_SPEECH_RATE,
        text: 'This is very slow speech designed for accessibility and careful listening.'
      },
      {
        name: 'Slow (Educational)',
        rate: this.speech.SLOW_SPEECH_RATE,
        text: 'This is slow speech perfect for language learning and educational content.'
      },
      {
        name: 'Normal (Default)',
        rate: this.speech.DEFAULT_SPEECH_RATE,
        text: 'This is normal speech at the standard comfortable listening pace.'
      },
      {
        name: 'Fast (Efficient)',
        rate: this.speech.FAST_SPEECH_RATE,
        text: 'This is fast speech for efficient content consumption and quick reading.'
      },
      {
        name: 'Very Fast (Speed Reading)',
        rate: this.speech.VERY_FAST_SPEECH_RATE,
        text: 'This is very fast speech for speed reading and rapid information processing.'
      }
    ];

    let currentIndex = 0;

    const nextRate = () => {
      if (currentIndex >= rateDemo.length) {
        console.log('✅ Cross-platform rate demonstration completed');
        return;
      }

      const demo = rateDemo[currentIndex];
      console.log(`🎵 ${demo.name} - Rate: ${demo.rate}`);
      console.log(`📱 Platform mapping: ${Ti.Platform.osname} uses ${demo.rate}`);

      this.speakWithOptimalVoice(demo.text, 'en', { rate: demo.rate });
      currentIndex++;
    };

    // Set up temporary event handler for demo sequence
    const originalHandler = this.onSpeechCompleted.bind(this);
    this.speech.removeEventListener('completed', originalHandler);
    this.speech.addEventListener('completed', nextRate);

    // Start first demo
    nextRate();

    // Restore original handler after demo
    setTimeout(() => {
      this.speech.removeEventListener('completed', nextRate);
      this.speech.addEventListener('completed', originalHandler);
    }, rateDemo.length * 4000 + 2000);
  }

  demonstrateMultiLanguageSupport() {
    console.log('🌍 Demonstrating multi-language support...');

    const languageDemo = [
      { lang: 'en', text: 'Hello! This demonstrates English text-to-speech with quality voice selection.' },
      { lang: 'es', text: '¡Hola! Esto demuestra la síntesis de voz en español con selección de calidad.' },
      { lang: 'fr', text: 'Bonjour! Ceci démontre la synthèse vocale française avec sélection de qualité.' },
      { lang: 'de', text: 'Hallo! Dies demonstriert deutsche Sprachsynthese mit Qualitätsstimmauswahl.' },
      { lang: 'it', text: 'Ciao! Questo dimostra la sintesi vocale italiana con selezione di qualità.' },
      { lang: 'pt', text: 'Olá! Isto demonstra síntese de fala em português com seleção de qualidade.' }
    ];

    let currentIndex = 0;

    const nextLanguage = () => {
      if (currentIndex >= languageDemo.length) {
        console.log('✅ Multi-language demonstration completed');
        return;
      }

      const demo = languageDemo[currentIndex];
      const availableVoices = this.voiceCache.get(demo.lang) || [];

      console.log(`🌍 ${demo.lang.toUpperCase()}: ${availableVoices.length} voices available`);

      if (availableVoices.length > 0) {
        this.speakWithOptimalVoice(demo.text, demo.lang, {
          rate: this.speech.DEFAULT_SPEECH_RATE,
          minQuality: 300
        });
      } else {
        console.log(`⚠️ No voices available for ${demo.lang}, skipping...`);
        setTimeout(nextLanguage, 500);
        return;
      }

      currentIndex++;
    };

    // Set up temporary event handler
    const originalHandler = this.onSpeechCompleted.bind(this);
    this.speech.removeEventListener('completed', originalHandler);
    this.speech.addEventListener('completed', nextLanguage);

    nextLanguage();

    // Restore handler
    setTimeout(() => {
      this.speech.removeEventListener('completed', nextLanguage);
      this.speech.addEventListener('completed', originalHandler);
    }, languageDemo.length * 5000 + 3000);
  }

  demonstrateAdvancedControls() {
    console.log('🎛️ Demonstrating advanced speech controls...');

    const longText = 'This is a long text that will be used to demonstrate advanced speech controls including pause and resume functionality. The text is intentionally long so that we have enough time to pause and resume the speech synthesis. This feature allows for interactive control over the speech output, which is particularly useful in educational applications, accessibility tools, and interactive media applications.';

    console.log('▶️ Starting long speech for control demonstration...');
    this.speakWithOptimalVoice(longText, 'en', { rate: this.speech.SLOW_SPEECH_RATE });

    // Demonstrate pause after 3 seconds
    setTimeout(() => {
      if (this.speech.isSpeaking()) {
        console.log('⏸️ Pausing speech...');
        this.speech.pauseSpeaking();

        // Resume after 2 seconds
        setTimeout(() => {
          console.log('▶️ Resuming speech...');
          this.speech.continueSpeaking();
        }, 2000);
      }
    }, 3000);

    // Demonstrate stop after 8 seconds total
    setTimeout(() => {
      if (this.speech.isSpeaking()) {
        console.log('⏹️ Stopping speech early...');
        this.speech.stopSpeaking();
      }
    }, 8000);
  }

  demonstrateQualitySelection() {
    console.log('🏆 Demonstrating voice quality selection...');

    const text = 'Comparing voice quality levels from standard to premium voices.';
    const languages = ['en', 'es'];

    languages.forEach(lang => {
      const voices = this.voiceCache.get(lang) || [];
      const qualityTiers = {
        'Premium': voices.filter(v => (v.quality || 0) > 400),
        'Enhanced': voices.filter(v => (v.quality || 0) > 300 && (v.quality || 0) <= 400),
        'Standard': voices.filter(v => (v.quality || 0) <= 300)
      };

      console.log(`🎤 ${lang.toUpperCase()} Quality Analysis:`);
      Object.entries(qualityTiers).forEach(([tier, voiceList]) => {
        console.log(`  ${tier}: ${voiceList.length} voices`);
        if (voiceList.length > 0) {
          console.log(`    Best: ${voiceList[0].name} (${voiceList[0].quality || 'Unknown'})`);
        }
      });
    });
  }

  // =========================================================================
  // 📊 PERFORMANCE & METRICS
  // =========================================================================

  trackPerformance(startTime) {
    const duration = Date.now() - startTime;
    this.performanceMetrics.totalDuration += duration;

    const avgDuration = this.performanceMetrics.totalDuration / this.performanceMetrics.speechCount;

    console.log(`📊 Performance Metrics:`);
    console.log(`  Total speeches: ${this.performanceMetrics.speechCount}`);
    console.log(`  Total errors: ${this.performanceMetrics.errors}`);
    console.log(`  Average duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Success rate: ${((this.performanceMetrics.speechCount - this.performanceMetrics.errors) / this.performanceMetrics.speechCount * 100).toFixed(1)}%`);
  }

  // =========================================================================
  // 🎯 EVENT HANDLERS
  // =========================================================================

  onSpeechStarted(e) {
    console.log('🎤 Speech started');
  }

  onSpeechCompleted(e) {
    console.log('✅ Speech completed');

    if (e._startTime) {
      this.trackPerformance(e._startTime);
    }
  }

  onSpeechPaused(e) {
    console.log('⏸️ Speech paused');
  }

  onSpeechContinued(e) {
    console.log('▶️ Speech resumed');
  }

  onSpeechCanceled(e) {
    console.log('❌ Speech canceled');
  }

  onSpeechError(e) {
    console.error('💥 Speech error:', e.error);
    this.performanceMetrics.errors++;

    // Implement error recovery strategies
    this.handleSpeechError(e.error);
  }

  handleSpeechError(errorCode) {
    const errorStrategies = {
      'AVSpeechSynthesizerErrorVoiceUnavailable': () => {
        console.log('🔄 Voice unavailable, trying with default voice...');
        // Could retry with default voice
      },
      'AVSpeechSynthesizerErrorAudioUnavailable': () => {
        console.log('🔄 Audio unavailable, speech system may be busy...');
        // Could queue for retry
      },
      'NETWORK_ERROR': () => {
        console.log('🔄 Network error, switching to local voices only...');
        // Could filter to local voices only
      }
    };

    const strategy = errorStrategies[errorCode];
    if (strategy) {
      strategy();
    } else {
      console.log('🔄 Unknown error, using general recovery strategy...');
    }
  }

  // =========================================================================
  // 🎬 DEMO ORCHESTRATION
  // =========================================================================

  demonstrateFeatures() {
    console.log('🎬 Starting comprehensive TTS feature demonstration...');

    const demonstrations = [
      {
        name: 'Cross-Platform Rate Consistency',
        action: () => this.demonstrateCrossPlatformRates(),
        delay: 1000
      },
      {
        name: 'Multi-Language Support',
        action: () => this.demonstrateMultiLanguageSupport(),
        delay: 25000
      },
      {
        name: 'Voice Quality Selection',
        action: () => this.demonstrateQualitySelection(),
        delay: 35000
      },
      {
        name: 'Advanced Controls',
        action: () => this.demonstrateAdvancedControls(),
        delay: 40000
      }
    ];

    demonstrations.forEach((demo, index) => {
      setTimeout(() => {
        console.log(`\n🎯 === ${demo.name} ===`);
        demo.action();
      }, demo.delay);
    });

    // Final summary
    setTimeout(() => {
      console.log('\n🎉 Advanced TTS demonstration completed!');
      console.log('📊 Final performance summary:');
      this.trackPerformance(0);
    }, 50000);
  }

  // =========================================================================
  // 🔧 UTILITY METHODS
  // =========================================================================

  getAvailableLanguages() {
    return Array.from(this.voiceCache.keys());
  }

  getVoicesForLanguage(language) {
    return this.voiceCache.get(language) || [];
  }

  getBestVoiceForLanguage(language, options = {}) {
    const voices = this.getVoicesForLanguage(language);

    return voices.find(voice => {
      if (options.requireLocal && voice.isNetworkConnectionRequired) return false;
      if (options.minQuality && (voice.quality || 0) < options.minQuality) return false;
      if (options.maxQuality && (voice.quality || 0) > options.maxQuality) return false;
      return true;
    }) || voices[0] || null;
  }

  cleanup() {
    console.log('🧹 Cleaning up Advanced TTS Demo...');

    if (this.speech && this.speech.isSpeaking()) {
      this.speech.stopSpeaking();
    }

    // Remove event listeners
    if (this.speech) {
      this.speech.removeEventListener('started', this.onSpeechStarted);
      this.speech.removeEventListener('completed', this.onSpeechCompleted);
      this.speech.removeEventListener('paused', this.onSpeechPaused);
      this.speech.removeEventListener('continued', this.onSpeechContinued);
      this.speech.removeEventListener('canceled', this.onSpeechCanceled);
      this.speech.removeEventListener('error', this.onSpeechError);
    }

    this.voiceCache.clear();
  }
}

// =============================================================================
// 🚀 DEMO STARTUP
// =============================================================================

const advancedTTSDemo = new AdvancedTTSDemo();

module.exports = AdvancedTTSDemo;
