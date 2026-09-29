/**
 * 🧪 Quick Voice Test - Verify Cross-Platform Voice Normalization
 * Tests the automatic _ ↔ - normalization in both modules
 */

const utterance = require('bencoding.utterance');

class QuickVoiceTest {
  constructor() {
    console.log('🧪 Starting Quick Voice Normalization Test');
    console.log(`📱 Platform: ${Ti.Platform.osname}`);

    this.speech = utterance.createSpeech();

    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported');
      return;
    }

    // ✅ ANDROID: Esperar a que TTS esté listo
    if (Ti.Platform.osname === 'android') {
      setTimeout(() => this.runTests(), 3000);
    } else {
      setTimeout(() => this.runTests(), 1000);
    }
  }

  runTests() {
    console.log('\n🎯 Testing Cross-Platform Voice Format Normalization...\n');

    // Test different formats to verify auto-normalization
    const testCases = [
      // iOS format (should work on both platforms)
      {
        text: 'Testing iOS format en-US',
        config: { language: 'en-US' },
        description: 'iOS format (en-US) → should become en_US on Android'
      },

      // Android format (should work on both platforms)
      {
        text: 'Testing Android format en_US',
        config: { language: 'en_US' },
        description: 'Android format (en_US) → should become en-US on iOS'
      },

      // Spanish tests
      {
        text: 'Probando formato español es-ES',
        config: { language: 'es-ES' },
        description: 'Spanish iOS format (es-ES)'
      },

      {
        text: 'Probando formato español es_MX',
        config: { language: 'es_MX' },
        description: 'Spanish Android format (es_MX)'
      },

      // Voice parameter tests
      {
        text: 'Testing voice parameter with iOS format',
        config: { voice: 'fr-FR' },
        description: 'Voice param iOS format (fr-FR)'
      },

      {
        text: 'Testing voice parameter with Android format',
        config: { voice: 'fr_FR' },
        description: 'Voice param Android format (fr_FR)'
      }
    ];

    this.runTestSequence(testCases, 0);
  }

  runTestSequence(testCases, currentIndex) {
    if (currentIndex >= testCases.length) {
      console.log('\n✅ All normalization tests completed!');
      console.log('🎯 Key takeaway: You can now use ANY format on ANY platform!');
      this.showAvailableVoices();
      return;
    }

    const testCase = testCases[currentIndex];
    console.log(`\n📝 Test ${currentIndex + 1}/${testCases.length}: ${testCase.description}`);
    console.log(`🎤 Speaking: "${testCase.text}"`);
    console.log(`⚙️ Config:`, testCase.config);

    // Add completion handler for this specific test
    const testHandler = () => {
      this.speech.removeEventListener('completed', testHandler);

      // Wait a bit, then continue to next test
      setTimeout(() => {
        this.runTestSequence(testCases, currentIndex + 1);
      }, 1500);
    };

    this.speech.addEventListener('completed', testHandler);

    // Start the test
    const config = {
      text: testCase.text,
      rate: this.speech.FAST_SPEECH_RATE,
      ...testCase.config
    };

    this.speech.startSpeaking(config);
  }

  showAvailableVoices() {
    console.log('\n📋 Checking available voices...');

    try {
      const voices = this.speech.getModernVoices();
      console.log(`\n🎵 Found ${voices.length} voices on ${Ti.Platform.osname}:`);

      if (voices.length === 0) {
        console.warn('⚠️ No voices detected. Possible causes:');
        if (Ti.Platform.osname === 'android') {
          console.warn('   - TTS engine not fully initialized yet');
          console.warn('   - Try waiting longer before calling getModernVoices()');
          console.warn('   - Check if Google TTS is installed');
        } else {
          console.warn('   - iOS voice detection issue');
          console.warn('   - Try on physical device instead of simulator');
        }
        return;
      }

      // Group by language for better readability
      const byLanguage = {};
      voices.forEach(voice => {
        const lang = (voice.language || 'unknown').split('-')[0].split('_')[0];
        if (!byLanguage[lang]) byLanguage[lang] = [];
        byLanguage[lang].push(voice);
      });

      Object.keys(byLanguage).forEach(lang => {
        const langVoices = byLanguage[lang];
        console.log(`\n🌍 ${lang.toUpperCase()} (${langVoices.length} voices):`);

        langVoices.slice(0, 3).forEach(voice => { // Show first 3 per language
          const quality = voice.quality || 'unknown';
          const network = voice.isNetworkConnectionRequired ? '🌐' : '📱';
          console.log(`   ${network} ${voice.name} | Quality: ${quality}`);
        });

        if (langVoices.length > 3) {
          console.log(`   ... and ${langVoices.length - 3} more`);
        }
      });

    } catch (error) {
      console.warn('⚠️ Could not get modern voices:', error.message);
      console.log('🔄 Trying legacy voice API...');

      try {
        const legacyVoices = this.speech.getVoices();
        console.log(`📜 Legacy voices (${legacyVoices.length}):`, legacyVoices.slice(0, 10));
      } catch (e) {
        console.error('❌ No voice APIs available');
      }
    }
  }
}

// Auto-start the test
const test = new QuickVoiceTest();

module.exports = QuickVoiceTest;
