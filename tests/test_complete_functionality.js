/**
 * Utterance v3.0 - Complete Cross-Platform Test Suite
 * Tests both TTS (Text-to-Speech) and STT (Speech-to-Text) functionality
 * 
 * This test validates that both iOS and Android implementations work correctly
 */

// Import the Utterance module
const utterance = require('bencoding.utterance');

console.log('🚀 Starting Utterance v3.0 Complete Test Suite...');
console.log('📱 Platform:', Ti.Platform.osname);
console.log('📱 Version:', Ti.Platform.version);

// =============================================================================
// 🗣️ TEXT-TO-SPEECH (TTS) TESTS - Cross Platform
// =============================================================================

console.log('\n=== 🗣️ TTS (Text-to-Speech) Tests ===');

try {
  const speech = utterance.createSpeech();
  console.log('✅ TTS Proxy created successfully');

  // Test if TTS is supported
  const isTTSSupported = speech.isSupported();
  console.log('🔍 TTS Support:', isTTSSupported ? '✅ Supported' : '❌ Not Supported');

  if (isTTSSupported) {
    // Test voice availability
    const voices = speech.getModernVoices();
    console.log('🎵 Available voices:', voices ? voices.length + ' voices found' : 'None found');

    // Add event listeners
    speech.addEventListener('started', function (e) {
      console.log('🎤 TTS Started:', e);
    });

    speech.addEventListener('completed', function (e) {
      console.log('✅ TTS Completed:', e);
    });

    speech.addEventListener('error', function (e) {
      console.log('❌ TTS Error:', e);
    });

    // Test TTS with normalized speech rate
    console.log('🎵 Testing TTS with text: "Hello from Utterance v3.0"');
    speech.startSpeaking({
      text: "Hello from Utterance version 3.0. Cross platform text to speech is working correctly.",
      rate: speech.DEFAULT_SPEECH_RATE || 0.5,
      volume: 1.0
    });
  }
} catch (error) {
  console.log('❌ TTS Test Failed:', error.message);
}

// =============================================================================
// 🎯 SPEECH-TO-TEXT (STT) TESTS - Cross Platform  
// =============================================================================

console.log('\n=== 🎯 STT (Speech-to-Text) Tests ===');

try {
  const speechToText = utterance.createSpeechToText();
  console.log('✅ STT Proxy created successfully');

  // Test if STT is supported
  const isSTTSupported = speechToText.isSupported();
  console.log('🔍 STT Support:', isSTTSupported ? '✅ Supported' : '❌ Not Supported');

  if (isSTTSupported) {
    // Add event listeners for STT
    speechToText.addEventListener('started', function (e) {
      console.log('🎤 STT Started - Listening for speech...');
    });

    // Failures arrive here too, with success: false and a message
    speechToText.addEventListener('completed', function (e) {
      if (!e.success) {
        console.log('❌ STT failed:', e.message);
        return;
      }
      console.log('✅ STT Completed:', e);
      console.log('📝 Recognized text:', e.text || 'No text recognized');
    });

    const listen = function () {
      console.log('🎤 Starting STT test - Please speak now...');
      speechToText.startSpeechToText({ language: 'en-US' });
      // Safety limit: the session normally ends by itself after a pause, and this does nothing once it has finished
      setTimeout(function () { speechToText.stopRecording(); }, 8000);
    };

    // On Android the microphone permission must be granted before the first call
    if (Ti.Platform.osname === 'android' && !Ti.Android.hasPermission('android.permission.RECORD_AUDIO')) {
      Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], function (e) {
        if (e.success) {
          listen();
        }
      });
    } else {
      listen();
    }

  } else {
    console.log('⚠️ STT not supported on this device/platform');
  }
} catch (error) {
  console.log('❌ STT Test Failed:', error.message);
}

// =============================================================================
// 📊 CONSTANTS AND CAPABILITIES TEST
// =============================================================================

console.log('\n=== 📊 Module Constants & Capabilities ===');

try {
  const speech = utterance.createSpeech();

  // Test available constants
  console.log('🔧 Testing available constants...');
  console.log('  - DEFAULT_SPEECH_RATE:', speech.DEFAULT_SPEECH_RATE || 'Not defined');
  console.log('  - MIN_SPEECH_RATE:', speech.MIN_SPEECH_RATE || 'Not defined');
  console.log('  - MAX_SPEECH_RATE:', speech.MAX_SPEECH_RATE || 'Not defined');

  const stt = utterance.createSpeechToText();
  console.log('  - LANGUAGE_MODEL_FREE_FORM:', stt.LANGUAGE_MODEL_FREE_FORM || 'Not defined');
  console.log('  - LANGUAGE_MODEL_WEB_SEARCH:', stt.LANGUAGE_MODEL_WEB_SEARCH || 'Not defined');

} catch (error) {
  console.log('❌ Constants test failed:', error.message);
}

// =============================================================================
// 🎯 CROSS-PLATFORM COMPATIBILITY TEST
// =============================================================================

console.log('\n=== 🎯 Cross-Platform Compatibility Summary ===');

const platformCapabilities = {
  platform: Ti.Platform.osname,
  tts: false,
  stt: false,
  voiceCount: 0
};

try {
  // Test TTS
  const speech = utterance.createSpeech();
  platformCapabilities.tts = speech.isSupported();

  if (platformCapabilities.tts) {
    const voices = speech.getModernVoices();
    platformCapabilities.voiceCount = voices ? voices.length : 0;
  }

  // Test STT
  const speechToText = utterance.createSpeechToText();
  platformCapabilities.stt = speechToText.isSupported();

} catch (error) {
  console.log('❌ Compatibility test error:', error.message);
}

console.log('📊 Platform Capabilities:');
console.log('  Platform:', platformCapabilities.platform);
console.log('  TTS Support:', platformCapabilities.tts ? '✅' : '❌');
console.log('  STT Support:', platformCapabilities.stt ? '✅' : '❌');
console.log('  Voice Count:', platformCapabilities.voiceCount);

console.log('\n🎉 Utterance v3.0 Test Suite Complete!');
console.log('📝 Both TTS and STT should be working on iOS and Android');
