/**
 * Quick Utterance v4.1 Test - Verify both TTS and STT work
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
    text: "Testing Utterance 4.1",
    rate: 0.5
  });
}

// Test STT  
console.log('\n--- STT Test ---');
const stt = utterance.createSpeechToText();
console.log('STT Supported:', stt.isSupported());

if (stt.isSupported()) {
  stt.addEventListener('partial', (e) => console.log('… so far:', e.text));

  stt.addEventListener('completed', (e) => {
    if (!e.success) {
      console.log('❌ STT failed:', e.code, e.message);
      return;
    }
    console.log('✅ STT Result:', e.text);
  });

  const start = () => {
    console.log("Say 'hello world'");
    stt.startSpeechToText({ language: 'en-US' });
    setTimeout(() => stt.stopRecording(), 6000);
  };

  // requestPermissions() works on both platforms; the permissions event answers
  if (stt.getPermissionStatus().granted) {
    start();
  } else {
    stt.addEventListener('permissions', (e) => e.granted && start(), { once: true });
    stt.requestPermissions();
  }
}
