/**
 * Improved example of using getModernVoices() with the new capabilities
 * This code demonstrates how to use the enhanced methods to obtain voices
 */

const utterance = require('bencoding.utterance');
const speech = utterance.createSpeech();

// ====================================
// Approach 1: Direct usage (recommended)
// ====================================
console.log("=== Example 1: Direct getModernVoices() usage ===");

function useModernVoicesDirectly() {
  try {
    const voices = speech.getModernVoices();

    if (voices.length > 0) {
      console.log(`✅ Found ${voices.length} voices`);

      // Filter high-quality Spanish voices
      const spanishVoices = voices.filter(voice => {
        const locale = voice.locale || voice.language || '';
        return locale.toLowerCase().includes('es') && voice.quality > 300;
      });

      if (spanishVoices.length > 0) {
        console.log(`🗣️ High-quality Spanish voices: ${spanishVoices.length}`);
        spanishVoices.forEach(voice => {
          console.log(`  - ${voice.name} (${voice.locale}) - Quality: ${voice.quality}`);
        });

        // Use the first high-quality voice
        speech.startSpeaking({
          text: "¡Hola! Este es un ejemplo con voces de alta calidad.",
          voice: spanishVoices[0].name,
          rate: speech.DEFAULT_SPEECH_RATE
        });
      }
    } else {
      console.log("⚠️ No voices could be retrieved");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ====================================
// Approach 2: Manual retry method
// ====================================
console.log("\\n=== Example 2: Manual retry on failure ===");

function useModernVoicesWithRetry() {
  let attempts = 0;
  const maxAttempts = 3;

  function tryGetVoices() {
    attempts++;

    try {
      const voices = speech.getModernVoices();

      if (voices && voices.length > 0) {
        console.log(`✅ Voices obtained on attempt ${attempts}: ${voices.length} voices`);

        const englishVoices = voices.filter(voice => {
          const locale = voice.locale || voice.language || '';
          return locale.toLowerCase().includes('en');
        });

        if (englishVoices.length > 0) {
          const bestVoice = englishVoices.find(voice => voice.quality > 400) || englishVoices[0];
          console.log(`🎯 Using voice: ${bestVoice.name} (quality: ${bestVoice.quality})`);

          speech.startSpeaking({
            text: "Hello! This example uses manual retry for voice loading.",
            voice: bestVoice.name,
            rate: speech.DEFAULT_SPEECH_RATE
          });
        }
        return;
      }

      throw new Error("Empty voice list");

    } catch (error) {
      console.error(`❌ Attempt ${attempts} failed: ${error.message}`);

      if (attempts < maxAttempts) {
        console.log(`🔄 Retrying in 1 second...`);
        setTimeout(tryGetVoices, 1000);
      } else {
        console.log("🚨 Using default configuration after all attempts");
        speech.startSpeaking({
          text: "Using default speech configuration after retry attempts."
        });
      }
    }
  }

  tryGetVoices();
}

// ====================================
// Approach 3: Comprehensive validation
// ====================================
console.log("\\n=== Example 3: Comprehensive system validation ===");

function useModernVoicesWithValidation() {
  // Verify basic support
  if (!speech.isSupported()) {
    console.error("❌ TTS not supported on this device");
    return;
  }

  console.log("✅ TTS supported, continuing...");

  try {
    const voices = speech.getModernVoices();

    if (voices.length > 0) {
      console.log(`✅ Voices retrieved: ${voices.length}`);

      // Find the best available voice
      const bestVoice = voices.reduce((best, current) => {
        return current.quality > best.quality ? current : best;
      });

      console.log(`🏆 Best voice: ${bestVoice.name} (quality: ${bestVoice.quality})`);

      speech.startSpeaking({
        text: "This is the highest quality voice available on your device.",
        voice: bestVoice.name,
        rate: speech.DEFAULT_SPEECH_RATE
      });
    } else {
      console.log("⚠️ Voice list empty, using default configuration");
      speech.startSpeaking({
        text: "Using default voice configuration."
      });
    }
  } catch (error) {
    console.error("❌ Error retrieving voices:", error.message);

    // Full fallback
    speech.startSpeaking({
      text: "Using basic speech synthesis."
    });
  }
}

// ====================================
// Approach 4: Detailed voice analysis
// ====================================
console.log("\\n=== Example 4: Detailed analysis of available voices ===");

function analyzeAvailableVoices() {
  try {
    const voices = speech.getModernVoices();

    if (voices.length > 0) {
      console.log(`✅ Analyzing ${voices.length} available voices...`);

      // Analyze available voices
      const voiceAnalysis = {
        total: voices.length,
        highQuality: voices.filter(v => v.quality > 400).length,
        mediumQuality: voices.filter(v => v.quality > 200 && v.quality <= 400).length,
        basicQuality: voices.filter(v => v.quality <= 200).length,
        networkRequired: voices.filter(v => v.isNetworkConnectionRequired).length,
        languages: [...new Set(voices.map(v => (v.locale || '').split('-')[0]))].filter(Boolean).length
      };

      console.log("📊 Voice analysis:", voiceAnalysis);

      // Select the optimal voice (high quality, no network required when possible)
      let optimalVoice = voices.find(voice =>
        voice.quality > 400 && !voice.isNetworkConnectionRequired
      );

      if (!optimalVoice) {
        optimalVoice = voices.find(voice => voice.quality > 400);
      }

      if (!optimalVoice) {
        optimalVoice = voices[0];
      }

      console.log(`🎯 Optimal voice selected: ${optimalVoice.name}`);
      console.log(`   Quality: ${optimalVoice.quality}, Network required: ${optimalVoice.isNetworkConnectionRequired ? 'Yes' : 'No'}`);

      speech.startSpeaking({
        text: "This voice was selected using detailed analysis for optimal quality and performance.",
        voice: optimalVoice.name,
        rate: speech.DEFAULT_SPEECH_RATE
      });
    } else {
      console.log("⚠️ No voices available to analyze");
    }
  } catch (error) {
    console.error("❌ Error during voice analysis:", error.message);
  }
}

// ====================================
// Global event configuration
// ====================================
speech.addEventListener('started', function () {
  console.log("🎵 Speech started");
});

speech.addEventListener('completed', function (event) {
  console.log("✅ Speech completed");
});

speech.addEventListener('error', function (event) {
  console.error("❌ Speech error:", event.error);
});

// ====================================
// Run examples sequentially
// ====================================
console.log("🚀 Starting improved usage examples...");

// Check support first
if (!speech.isSupported()) {
  console.error("❌ Text-to-Speech is not compatible with this device");
} else {
  console.log("✅ Text-to-Speech supported");

  // Run examples with delays to avoid conflicts
  setTimeout(() => useModernVoicesDirectly(), 1000);
  setTimeout(() => useModernVoicesWithRetry(), 4000);
  setTimeout(() => useModernVoicesWithValidation(), 8000);
  setTimeout(() => analyzeAvailableVoices(), 12000);
}

// ====================================
// Additional utilities
// ====================================

/**
 * Helper function to check TTS status
 */
function checkTTSStatus() {
  const status = {
    isSupported: speech.isSupported(),
    isSpeaking: speech.isSpeaking()
  };

  console.log("📋 TTS status:", status);
  return status;
}

/**
 * Helper function to retrieve available languages
 */
function getAvailableLanguages() {
  try {
    const voices = speech.getModernVoices();
    const languages = [...new Set(voices.map(v => (v.locale || '').split('-')[0]))].filter(Boolean);
    console.log(`🌍 Available languages: ${languages.length}`);
    console.log("📝 Language list:", languages.join(', '));
    return languages;
  } catch (error) {
    console.error("❌ Error retrieving languages:", error.message);
    return [];
  }
}

// Export functions for external usage
module.exports = {
  useModernVoicesDirectly,
  useModernVoicesWithRetry,
  useModernVoicesWithValidation,
  analyzeAvailableVoices,
  checkTTSStatus,
  getAvailableLanguages
};
