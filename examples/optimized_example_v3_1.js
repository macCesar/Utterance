/**
 * Optimized usage example for fast stop->start sequences
 * Version: 3.1 - Cancellation without delay
 */

var utterance = require('bencoding.utterance');
var speech = utterance.createSpeech();

// ===== CONFIGURATION =====
var VOICE = 'es-MX';
var RATE = 1.2;

// ===== OPTIMIZED METHOD FOR FAST TEXT SWITCHING =====
function speakTextOptimized(text) {
  console.log(`🎙️ Speaking: "${text}"`);

  // ✅ OPTIMIZATION v3.1: No need to check isSpeaking()
  // startSpeaking() now handles cancellation automatically
  speech.startSpeaking({
    text: text,
    voice: VOICE,
    rate: RATE
  });
}

// ===== TRADITIONAL METHOD (FOR COMPARISON) =====
function speakTextTraditional(text) {
  console.log(`🐌 Traditional method: "${text}"`);

  // ❌ Previous approach that introduced delays
  if (speech.isSpeaking) {
    speech.stopSpeaking();
    // Previously it was necessary to wait or use setTimeout to avoid conflicts
    setTimeout(() => {
      speech.startSpeaking({
        text: text,
        voice: VOICE,
        rate: RATE
      });
    }, 100); // Delay required in the previous version
  } else {
    speech.startSpeaking({
      text: text,
      voice: VOICE,
      rate: RATE
    });
  }
}

// ===== REAL USAGE SIMULATION =====
function simulateRealUsage() {
  var messages = [
    "Primer mensaje de prueba",
    "Segundo mensaje más largo para verificar que la cancelación funciona correctamente",
    "Tercer mensaje corto",
    "Cuarto mensaje con información importante",
    "Último mensaje de la secuencia"
  ];

  console.log('\n🚀 Starting real usage simulation...');
  console.log('📱 Switching messages quickly just like a real app\n');

  var index = 0;
  var interval = setInterval(() => {
    if (index >= messages.length) {
      clearInterval(interval);
      console.log('\n✅ Simulation completed without delays!');
      return;
    }

    // ✅ OPTIMIZED USAGE: Immediate switch with no extra checks
    speakTextOptimized(messages[index]);
    index++;

  }, 800); // Switch message every 800ms (very fast)
}

// ===== EVENTS =====
speech.addEventListener('started', function (e) {
  console.log(`▶️  Started: "${e.text?.substring(0, 40)}..."`);
});

speech.addEventListener('stopped', function (e) {
  console.log(`⏹️  Stopped: "${e.text?.substring(0, 40)}..."`);
});

speech.addEventListener('canceled', function (e) {
  console.log(`❌ Canceled: "${e.text?.substring(0, 40)}..."`);
});

speech.addEventListener('completed', function (e) {
  console.log(`✅ Completed: "${e.text?.substring(0, 40)}..."`);
});

// ===== EXECUTION =====
console.log('🎯 Optimized usage example - TTS v3.1');
console.log('🔧 Improvements included:');
console.log('   • Immediate cancellation without delays');
console.log('   • Automatic state cleanup');
console.log('   • Intelligent handling of rapid sequences');
console.log('   • No manual isSpeaking() checks required\n');

if (!utterance.isSupported()) {
  console.error('❌ TTS not supported on this device');
} else {
  // Immediate demo
  console.log('🧪 Quick test with 3 immediate changes:');

  setTimeout(() => speakTextOptimized("Primer texto"), 1000);
  setTimeout(() => speakTextOptimized("Segundo texto inmediatamente"), 1200);
  setTimeout(() => speakTextOptimized("Tercer texto sin delay"), 1400);

  // Run the realistic simulation afterwards
  setTimeout(() => simulateRealUsage(), 5000);
}

// ===== ADDITIONAL USEFUL FUNCTIONS =====

// Manual state cleanup (for special scenarios)
function forceClearTTSState() {
  console.log('🧹 Manually clearing TTS state...');
  speech.forceClearState(); // New method v3.1
}

// Optimized state verification
function checkTTSStatus() {
  var isReady = speech.isTTSReady(); // New method v3.1
  var isSpeaking = speech.isSpeaking;

  console.log(`📊 TTS status: ${isReady ? 'Ready' : 'Not ready'}, ${isSpeaking ? 'Speaking' : 'Silent'}`);
  return { isReady, isSpeaking };
}

// ===== EXPORT FOR REUSE =====
if (typeof module !== 'undefined') {
  module.exports = {
    speakTextOptimized: speakTextOptimized,
    forceClearTTSState: forceClearTTSState,
    checkTTSStatus: checkTTSStatus,
    speech: speech
  };
}
