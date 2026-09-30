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

  // On Android the microphone permission must be granted first; iOS asks on the first call
  const start = () => {
    console.log("Say 'hello world'");
    stt.startSpeechToText({ language: 'en-US' });
    setTimeout(() => stt.stopRecording(), 6000);
  };

  if (Ti.Platform.osname === 'android' && !Ti.Android.hasPermission('android.permission.RECORD_AUDIO')) {
    Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], (e) => e.success && start());
  } else {
    start();
  }
}
