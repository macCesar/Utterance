/**
 * Quick Utterance v3.0 Test - Verify both TTS and STT work
 */

const utterance = require('bencoding.utterance');

console.log('🧪 Quick Utterance Test');
console.log('Platform:', Ti.Platform.osname);

// Test TTS
console.log('\n--- TTS Test ---');
const speech = utterance.createSpeech();
console.log('TTS Supported:', speech.isSupported());

if (speech.isSupported()) {
  speech.addEventListener('completed', () => console.log('✅ TTS Done'));
  speech.startSpeaking({
    text: "Testing Utterance 3.0",
    rate: 0.5
  });
}

// Test STT  
console.log('\n--- STT Test ---');
const stt = utterance.createSpeechToText();
console.log('STT Supported:', stt.isSupported());

if (stt.isSupported()) {
  stt.addEventListener('completed', (e) => {
    console.log('✅ STT Result:', e.text);
  });

  // Start STT (will request microphone permissions)
  stt.startSpeechToText({
    promptText: "Say 'hello world'"
  });
}
