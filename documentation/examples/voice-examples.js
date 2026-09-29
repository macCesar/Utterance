/**
 * 🎙️ Voice Parameter Examples
 * Practical examples of using the 'voice' parameter on iOS and Android
 */

const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// =============================================================================
// 🎤 VOICE PARAMETER EXAMPLES
// =============================================================================

class VoiceExamples {
  constructor() {
    this.speech = utterance.createSpeech();
    this.runExamples();
  }

  async runExamples() {
    console.log('🎙️ Starting Voice Parameter Examples...');

    // Wait a bit for TTS to initialize
    setTimeout(() => {
      this.example1_BasicVoiceSelection();
    }, 1000);
  }

  // ==========================================================================
  // 📝 EXAMPLE 1: Basic Voice Selection by Language Code
  // ==========================================================================
  example1_BasicVoiceSelection() {
    console.log('\n📝 EXAMPLE 1: Basic Voice Selection by Language Code');

    const examples = [
      { text: 'Hello, this is English', voice: 'en-US' },
      { text: 'Hola, esto es español', voice: 'es-ES' },
      { text: 'Bonjour, ceci est français', voice: 'fr-FR' },
      { text: 'Hallo, das ist Deutsch', voice: 'de-DE' }
    ];

    let currentIndex = 0;

    const speakNext = () => {
      if (currentIndex >= examples.length) {
        console.log('✅ Example 1 completed');
        setTimeout(() => this.example2_SpecificVoiceNames(), 2000);
        return;
      }

      const example = examples[currentIndex];
      console.log(`🎤 Speaking with voice: ${example.voice}`);

      // ✅ USAR PARÁMETRO 'voice' con código de idioma
      this.speech.startSpeaking({
        text: example.text,
        voice: example.voice,  // ← AQUÍ está el uso del parámetro 'voice'
        rate: this.speech.DEFAULT_SPEECH_RATE
      });

      currentIndex++;
    };

    // Setup sequential playback
    const handler = () => speakNext();
    this.speech.addEventListener('completed', handler);

    // Start first example
    speakNext();

    // Cleanup after sequence
    setTimeout(() => {
      this.speech.removeEventListener('completed', handler);
    }, examples.length * 5000);
  }

  // ==========================================================================
  // 📝 EXAMPLE 2: Using Specific Voice Names
  // ==========================================================================
  example2_SpecificVoiceNames() {
    console.log('\n📝 EXAMPLE 2: Using Specific Voice Names');

    try {
      const voices = this.speech.getModernVoices();
      console.log(`Found ${voices.length} voices available`);

      // Find different types of voices
      const englishVoices = voices.filter(v =>
        (v.language || '').toLowerCase().includes('en')
      );

      const spanishVoices = voices.filter(v =>
        (v.language || '').toLowerCase().includes('es')
      );

      console.log(`English voices: ${englishVoices.length}`);
      console.log(`Spanish voices: ${spanishVoices.length}`);

      if (englishVoices.length > 0) {
        const selectedVoice = englishVoices[0];
        console.log(`🎤 Testing specific voice: ${selectedVoice.name}`);

        // ✅ USAR PARÁMETRO 'voice' con nombre específico de voz
        this.speech.startSpeaking({
          text: `Hello! I am ${selectedVoice.name}, a specific voice with quality ${selectedVoice.quality}`,
          voice: selectedVoice.name,  // ← NOMBRE ESPECÍFICO DE VOZ
          rate: this.speech.DEFAULT_SPEECH_RATE
        });

        // Test Spanish voice after English
        setTimeout(() => {
          if (spanishVoices.length > 0) {
            const spanishVoice = spanishVoices[0];
            console.log(`🎤 Testing Spanish voice: ${spanishVoice.name}`);

            this.speech.startSpeaking({
              text: `¡Hola! Soy ${spanishVoice.name}, una voz específica española`,
              voice: spanishVoice.name,  // ← NOMBRE ESPECÍFICO DE VOZ ESPAÑOLA
              rate: this.speech.DEFAULT_SPEECH_RATE
            });
          }
        }, 4000);
      }

      setTimeout(() => this.example3_VoiceQualityComparison(), 8000);

    } catch (error) {
      console.warn('Modern voice API not available, skipping to next example');
      setTimeout(() => this.example3_VoiceQualityComparison(), 2000);
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 3: Voice Quality Comparison
  // ==========================================================================
  example3_VoiceQualityComparison() {
    console.log('\n📝 EXAMPLE 3: Voice Quality Comparison');

    try {
      const voices = this.speech.getModernVoices();
      const englishVoices = voices.filter(v =>
        (v.language || '').toLowerCase().includes('en')
      );

      // Sort by quality (highest first)
      const sortedVoices = englishVoices.sort((a, b) =>
        (b.quality || 0) - (a.quality || 0)
      );

      if (sortedVoices.length >= 2) {
        const highQualityVoice = sortedVoices[0];
        const lowerQualityVoice = sortedVoices[sortedVoices.length - 1];

        console.log(`🏆 High quality voice: ${highQualityVoice.name} (${highQualityVoice.quality})`);
        console.log(`📱 Lower quality voice: ${lowerQualityVoice.name} (${lowerQualityVoice.quality})`);

        // Test high quality voice
        this.speech.startSpeaking({
          text: 'This is a high quality voice with enhanced clarity and naturalness',
          voice: highQualityVoice.name,  // ← VOZ DE ALTA CALIDAD
          rate: this.speech.DEFAULT_SPEECH_RATE
        });

        // Test lower quality voice for comparison
        setTimeout(() => {
          this.speech.startSpeaking({
            text: 'This is a lower quality voice for comparison purposes',
            voice: lowerQualityVoice.name,  // ← VOZ DE MENOR CALIDAD
            rate: this.speech.DEFAULT_SPEECH_RATE
          });
        }, 5000);
      }

      setTimeout(() => this.example4_NetworkVsLocalVoices(), 10000);

    } catch (error) {
      console.warn('Voice quality comparison not available');
      setTimeout(() => this.example4_NetworkVsLocalVoices(), 2000);
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 4: Network vs Local Voices
  // ==========================================================================
  example4_NetworkVsLocalVoices() {
    console.log('\n📝 EXAMPLE 4: Network vs Local Voices');

    try {
      const voices = this.speech.getModernVoices();

      const localVoices = voices.filter(v => !v.isNetworkConnectionRequired);
      const networkVoices = voices.filter(v => v.isNetworkConnectionRequired);

      console.log(`📱 Local voices: ${localVoices.length}`);
      console.log(`🌐 Network voices: ${networkVoices.length}`);

      if (localVoices.length > 0) {
        const localVoice = localVoices[0];
        console.log(`📱 Testing local voice: ${localVoice.name}`);

        this.speech.startSpeaking({
          text: 'This is a local voice that works offline',
          voice: localVoice.name,  // ← VOZ LOCAL (OFFLINE)
          rate: this.speech.DEFAULT_SPEECH_RATE
        });

        if (networkVoices.length > 0) {
          setTimeout(() => {
            const networkVoice = networkVoices[0];
            console.log(`🌐 Testing network voice: ${networkVoice.name}`);

            this.speech.startSpeaking({
              text: 'This is a network voice that may require internet connection',
              voice: networkVoice.name,  // ← VOZ DE RED (ONLINE)
              rate: this.speech.DEFAULT_SPEECH_RATE
            });
          }, 4000);
        }
      }

      setTimeout(() => this.example5_CrossPlatformVoices(), 8000);

    } catch (error) {
      console.warn('Network vs local comparison not available');
      setTimeout(() => this.example5_CrossPlatformVoices(), 2000);
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 5: Cross-Platform Voice Selection
  // ==========================================================================
  example5_CrossPlatformVoices() {
    console.log('\n📝 EXAMPLE 5: Cross-Platform Voice Selection');

    // This example shows how to use voices that work on both platforms
    const crossPlatformVoices = [
      {
        text: 'Cross-platform English voice',
        voice: 'en',  // Simple language code - works everywhere
        desc: 'Simple language code'
      },
      {
        text: 'Cross-platform Spanish voice',
        voice: 'es',  // Simple language code - works everywhere
        desc: 'Simple language code'
      },
      {
        text: 'Platform-specific English voice',
        voice: Ti.Platform.osname === 'android' ? 'en_US' : 'en-US',  // Platform-specific format
        desc: 'Platform-specific format'
      }
    ];

    let currentIndex = 0;

    const speakNext = () => {
      if (currentIndex >= crossPlatformVoices.length) {
        console.log('✅ All voice examples completed!');
        this.displaySummary();
        return;
      }

      const example = crossPlatformVoices[currentIndex];
      console.log(`🎤 ${example.desc}: ${example.voice}`);

      this.speech.startSpeaking({
        text: example.text,
        voice: example.voice,  // ← DIFERENTES FORMATOS DE VOZ
        rate: this.speech.DEFAULT_SPEECH_RATE
      });

      currentIndex++;
    };

    // Setup sequential playback
    const handler = () => speakNext();
    this.speech.addEventListener('completed', handler);

    // Start examples
    speakNext();

    // Cleanup
    setTimeout(() => {
      this.speech.removeEventListener('completed', handler);
    }, crossPlatformVoices.length * 5000);
  }

  displaySummary() {
    const summary = `
🎙️ VOICE PARAMETER EXAMPLES COMPLETED!

📋 What we demonstrated:

1️⃣ Basic voice selection by language code (en-US, es-ES, etc.)
2️⃣ Specific voice names for fine control
3️⃣ Voice quality comparison (high vs low quality)
4️⃣ Network vs local voices (online vs offline)
5️⃣ Cross-platform voice compatibility

🔑 KEY TAKEAWAYS:
• Use 'voice' parameter to select specific voices
• Language codes work on both platforms (en, es, fr, etc.)
• Specific voice names give you precise control
• Voice quality affects naturalness and clarity
• Local voices work offline, network voices may need internet

🎯 TRY IT YOURSELF:
- Run getModernVoices() to see all available voices
- Test different voice names and language codes
- Compare voice quality and characteristics
    `;

    console.log(summary);

    // Show summary dialog if UI is available
    try {
      const dialog = Ti.UI.createAlertDialog({
        title: 'Voice Examples Complete!',
        message: 'Check the console for detailed information about voice usage.',
        buttonNames: ['OK']
      });
      dialog.show();
    } catch (e) {
      // No UI available, console output only
    }
  }
}

// =============================================================================
// 🚀 QUICK TESTING FUNCTIONS
// =============================================================================

// Quick function to test any voice
function testVoice(voiceName, text = 'This is a voice test') {
  console.log(`🎤 Testing voice: ${voiceName}`);

  speech.startSpeaking({
    text: text,
    voice: voiceName,
    rate: speech.DEFAULT_SPEECH_RATE
  });
}

// Quick function to list all available voices
function listAllVoices() {
  try {
    const voices = speech.getModernVoices();
    console.log(`\n📋 Available Voices (${voices.length} total):`);

    voices.forEach((voice, index) => {
      const name = voice.name || 'Unknown';
      const language = voice.language || voice.locale || 'Unknown';
      const quality = voice.quality || 'Unknown';
      const network = voice.isNetworkConnectionRequired ? '🌐' : '📱';

      console.log(`${index + 1}. ${network} ${name} (${language}) - Quality: ${quality}`);
    });

    return voices;
  } catch (error) {
    console.warn('Modern voice API not available, trying legacy...');
    try {
      const voices = speech.getVoices();
      console.log(`📋 Legacy Voices (${voices.length} total):`, voices);
      return voices;
    } catch (e) {
      console.error('No voice APIs available');
      return [];
    }
  }
}

// =============================================================================
// 🎯 USAGE EXAMPLES
// =============================================================================

console.log('🎙️ Voice Parameter Examples Available!');
console.log('');
console.log('📋 Quick Commands:');
console.log('- listAllVoices() - See all available voices');
console.log('- testVoice("en-US", "Hello world") - Test specific voice');
console.log('- new VoiceExamples() - Run all examples');
console.log('');

// Export for external use
module.exports = {
  VoiceExamples,
  testVoice,
  listAllVoices
};

// Start examples automatically
setTimeout(() => {
  new VoiceExamples();
}, 1000);
