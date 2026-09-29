/**
 * 🤖 Android Voice Debug - Diagnose Android TTS Issues
 * Specifically for debugging Android voice detection problems
 */

const utterance = require('bencoding.utterance');

class AndroidVoiceDebug {
  constructor() {
    if (Ti.Platform.osname !== 'android') {
      console.log('ℹ️ This debug tool is for Android only');
      return;
    }

    console.log('🤖 Starting Android Voice Debug Session');
    this.speech = utterance.createSpeech();
    this.startDeepDiagnosis();
  }

  startDeepDiagnosis() {
    console.log('\n🔍 ANDROID TTS DEEP DIAGNOSIS\n');

    // Step 1: Basic support check
    console.log('1️⃣ Basic Support Check:');
    console.log(`   isSupported(): ${this.speech.isSupported()}`);

    // Step 2: Check TTS readiness (if available)
    if (this.speech.isTTSReady) {
      console.log(`   isTTSReady(): ${this.speech.isTTSReady()}`);
    } else {
      console.log('   isTTSReady(): Method not available');
    }

    // Step 3: Wait and check multiple times
    console.log('\n2️⃣ TTS Initialization Check:');
    this.checkInitializationStatus();
  }

  checkInitializationStatus() {
    const maxChecks = 20; // ✅ AUMENTADO: Más tiempo para inicialización lenta
    let checkCount = 0;

    const checkInterval = setInterval(() => {
      checkCount++;
      const isReady = this.speech.isTTSReady ? this.speech.isTTSReady() : 'unknown';

      console.log(`   Check ${checkCount}/${maxChecks}: TTS Ready = ${isReady}`);

      if (isReady === true || checkCount >= maxChecks) {
        clearInterval(checkInterval);

        if (isReady === true) {
          console.log('✅ TTS is ready! Proceeding with voice detection...');
          // ✅ NUEVO: Esperar un poco más después de que dice estar listo
          setTimeout(() => this.detectVoices(), 2000);
        } else {
          console.log('⚠️ TTS not ready after waiting. Trying voice detection anyway...');
          // ✅ NUEVO: Esperar más tiempo antes del retry
          setTimeout(() => this.detectVoices(), 3000);
        }
      }
    }, 1500); // ✅ AUMENTADO: Check cada 1.5 segundos en lugar de 1 segundo
  }

  detectVoices() {
    console.log('\n3️⃣ Voice Detection Attempts:');

    // Attempt 1: Modern API
    console.log('\n🔬 Attempt 1: Modern API (getModernVoices)');
    try {
      const modernVoices = this.speech.getModernVoices();
      console.log(`   Result: ${modernVoices.length} voices found`);

      if (modernVoices.length > 0) {
        console.log('   Sample voices:');
        modernVoices.slice(0, 5).forEach((voice, i) => {
          console.log(`     ${i + 1}. ${voice.name} (${voice.locale || voice.language})`);
        });

        // ✅ CRUCIAL: Reducir drasticamente la carga de voces
        setTimeout(() => this.testOptimizedVoices(modernVoices), 1000);
        return;
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }

    // Attempt 2: Legacy API - ✅ CORREGIDO: Usar método correcto
    console.log('\n🔬 Attempt 2: Legacy API (getVoices)');
    try {
      // ✅ FIX: El método correcto es getModernLanguages, no getVoices
      const legacyLanguages = this.speech.getModernLanguages ? this.speech.getModernLanguages() : [];
      console.log(`   Result: ${legacyLanguages.length} languages found`);

      if (legacyLanguages.length > 0) {
        console.log('   Languages:', legacyLanguages.slice(0, 10));
        this.testLegacyLanguages(legacyLanguages);
        return;
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }

    // Attempt 3: Try with MUCH longer delay
    console.log('\n🔬 Attempt 3: Retry after MUCH longer delay');
    setTimeout(() => {
      try {
        const retryVoices = this.speech.getModernVoices();
        console.log(`   Delayed result: ${retryVoices.length} voices found`);

        if (retryVoices.length > 0) {
          this.testSampleVoices(retryVoices);
        } else {
          this.showTroubleshootingTips();
        }
      } catch (error) {
        console.log(`   Delayed error: ${error.message}`);
        this.showTroubleshootingTips();
      }
    }, 8000); // ✅ AUMENTADO: De 5 a 8 segundos
  }

  // ✅ NUEVO: Método optimizado para manejar muchas voces
  testOptimizedVoices(voices) {
    console.log('\n4️⃣ Testing Optimized Voice Selection:');
    console.log(`📊 Total voices found: ${voices.length}`);

    // ✅ CRÍTICO: Pre-filtrar voces ANTES de procesar
    const optimizedVoices = this.selectOptimalVoices(voices);
    console.log(`🎯 Optimized to ${optimizedVoices.length} high-quality voices`);

    if (optimizedVoices.length === 0) {
      console.log('❌ No suitable voices found after optimization');
      this.showTroubleshootingTips();
      return;
    }

    // Test con solo UNA voz óptima para evitar sobrecarga
    const bestVoice = optimizedVoices[0];
    console.log(`🎤 Testing single optimal voice: ${bestVoice.name} (${bestVoice.locale})`);

    // ✅ ULTRA-SIMPLE: Test básico sin configuraciones complejas
    this.speech.startSpeaking({
      text: 'Hello. This is a simple voice test.',
      language: bestVoice.locale || 'en_US'
      // ✅ NO rate, NO pitch - usar defaults para máxima compatibilidad
    });

    // ✅ OPCIONAL: Test de voz específica después de pausa larga
    setTimeout(() => {
      if (optimizedVoices.length > 1) {
        const secondVoice = optimizedVoices[1];
        console.log(`🎤 Testing second voice: ${secondVoice.name}`);

        this.speech.startSpeaking({
          text: 'This is a second voice test.',
          language: secondVoice.locale || 'en_US'
        });
      }
    }, 8000); // ✅ LARGO delay entre tests
  }

  // ✅ NUEVO: Selección inteligente de voces óptimas
  selectOptimalVoices(voices) {
    console.log('🔍 Selecting optimal voices from large set...');

    // 1. Filtrar voces problemáticas conocidas
    const cleanVoices = voices.filter(voice => {
      const name = voice.name || '';
      const locale = voice.locale || voice.language || '';

      // ✅ EXPANDIDO: Lista más completa de voces problemáticas
      const problematicPatterns = [
        'ur-pk', 'ur_pk',           // Urdu Pakistan
        'network',                  // Voces de red
        'espeak',                  // Motor espeak
        'pico',                    // Motor pico antiguo
        'x-',                      // Voces experimentales
        'beta',                    // Voces beta
        'test',                    // Voces de prueba
        'sample',                  // Voces de muestra
        'demo'                     // Voces demo
      ];

      const nameCheck = name.toLowerCase();
      const localeCheck = locale.toLowerCase();

      return !problematicPatterns.some(pattern =>
        nameCheck.includes(pattern) || localeCheck.includes(pattern)
      );
    });

    console.log(`📋 Clean voices: ${cleanVoices.length} (filtered ${voices.length - cleanVoices.length} problematic)`);

    // 2. Priorizar idiomas comunes y voces de alta calidad
    const prioritizedVoices = cleanVoices.filter(voice => {
      const locale = (voice.locale || voice.language || '').toLowerCase();
      const quality = voice.quality || 0;

      // Solo idiomas comunes y calidad decente
      const commonLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
      const isCommonLanguage = commonLanguages.some(lang => locale.includes(lang));
      const isGoodQuality = quality >= 200; // Calidad mínima aceptable

      return isCommonLanguage && isGoodQuality;
    });

    console.log(`🎯 Prioritized voices: ${prioritizedVoices.length}`);

    // 3. Seleccionar una voz por idioma principal
    const voicesByLanguage = new Map();

    prioritizedVoices.forEach(voice => {
      const locale = voice.locale || voice.language || '';
      const langCode = locale.split(/[-_]/)[0]; // 'en' de 'en-US' o 'en_US'

      if (!voicesByLanguage.has(langCode)) {
        voicesByLanguage.set(langCode, []);
      }
      voicesByLanguage.get(langCode).push(voice);
    });

    // 4. Seleccionar la mejor voz por idioma
    const optimalVoices = [];

    voicesByLanguage.forEach((voices, lang) => {
      // Ordenar por calidad y preferir voces locales
      const sortedVoices = voices.sort((a, b) => {
        const qualityDiff = (b.quality || 0) - (a.quality || 0);
        const networkPref = (a.isNetworkConnectionRequired ? 1 : 0) - (b.isNetworkConnectionRequired ? 1 : 0);
        return qualityDiff || networkPref;
      });

      // Tomar solo la mejor voz de este idioma
      if (sortedVoices.length > 0) {
        optimalVoices.push(sortedVoices[0]);
        console.log(`🌍 Best ${lang}: ${sortedVoices[0].name} (quality: ${sortedVoices[0].quality})`);
      }
    });

    // 5. Limitar a máximo 5 voces para evitar sobrecarga
    const finalVoices = optimalVoices.slice(0, 5);

    console.log(`✅ Final optimized selection: ${finalVoices.length} voices`);
    finalVoices.forEach((voice, i) => {
      console.log(`   ${i + 1}. ${voice.name} (${voice.locale}) - Quality: ${voice.quality}`);
    });

    return finalVoices;
  }

  // ✅ ACTUALIZADO: Simplificar consejos de troubleshooting
  showTroubleshootingTips() {
    console.log('\n🆘 ANDROID TTS OPTIMIZATION TIPS:');
    console.log('');
    console.log('🐌 PERFORMANCE ISSUES (472 voices detected):');
    console.log('   • Your device has an unusually high number of voices (472!)');
    console.log('   • This can overwhelm TTS processing and cause delays');
    console.log('   • Consider filtering voices before use');
    console.log('   • Use only common languages (en, es, fr, etc.)');
    console.log('   • Avoid network-dependent voices when possible');
    console.log('');
    console.log('⚡ QUICK SOLUTIONS:');
    console.log('   • Restart the app to clear TTS cache');
    console.log('   • Use simple language codes (en, es) instead of specific voices');
    console.log('   • Test with Wi-Fi enabled (some voices need internet)');
    console.log('   • Clear Google TTS app cache in device settings');
    console.log('   • Reduce speech rate to 1.0 and pitch to 1.0');
    console.log('');
    console.log('💾 MEMORY OPTIMIZATION:');
    console.log('   • Filter voices by quality before using');
    console.log('   • Limit concurrent voice operations');
    console.log('   • Add longer delays between voice changes');

    // ✅ ULTRA-BÁSICO: Probar solo con idioma sin especificar voz
    console.log('\n🎤 Trying ultra-basic speech without voice selection...');

    setTimeout(() => {
      try {
        this.speech.startSpeaking({
          text: 'Basic speech test without voice selection',
          language: 'en' // ✅ Solo código de idioma base
        });
      } catch (error) {
        console.error('💥 Even ultra-basic speech failed:', error.message);
      }
    }, 2000);
  }
}

// Auto-start if on Android
if (Ti.Platform.osname === 'android') {
  const debug = new AndroidVoiceDebug();
} else {
  console.log('ℹ️ Android Voice Debug - Run this on Android device');
}

module.exports = AndroidVoiceDebug;
