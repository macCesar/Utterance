/**
 * Test to verify the performance improvements for cancel->start sequences
 * Version: 3.1 - TTS state handling optimization
 */

var utterance = require('bencoding.utterance');
var speech = utterance.createSpeech();

// Variables to measure performance
var testResults = [];
var currentTestIndex = 0;

// Diverse test phrases (spoken in Spanish intentionally)
var testTexts = [
  "Primera prueba de velocidad de cancelación",
  "Segunda prueba con texto diferente",
  "Tercera prueba de síntesis rápida",
  "Cuarta prueba de rendimiento mejorado",
  "Quinta y última prueba de optimización"
];

// ===== PERFORMANCE TEST FUNCTION =====
function testFastCancelStart(testName, iterations) {
  console.log(`\n🧪 Starting test: ${testName}`);
  console.log(`📊 Iterations: ${iterations}`);

  var startTime = Date.now();
  var completedIterations = 0;

  function performIteration() {
    if (completedIterations >= iterations) {
      var totalTime = Date.now() - startTime;
      var avgTimePerIteration = totalTime / iterations;

      console.log(`✅ ${testName} completed:`);
      console.log(`   • Total time: ${totalTime}ms`);
      console.log(`   • Average per iteration: ${avgTimePerIteration.toFixed(2)}ms`);

      testResults.push({
        test: testName,
        iterations: iterations,
        totalTime: totalTime,
        avgTime: avgTimePerIteration
      });

      return;
    }

    var textIndex = completedIterations % testTexts.length;
    var text = testTexts[textIndex];

    // ✅ CRITICAL SEQUENCE: stop -> start immediately
    if (speech.isSpeaking) {
      speech.stopSpeaking();
    }

    // Start a new synthesis immediately
    speech.startSpeaking({
      text: text,
      rate: 1.5,  // Fast rate for testing
      voice: 'es-MX'
    });

    completedIterations++;

    // Schedule the next iteration after a short delay
    setTimeout(performIteration, 100);
  }

  performIteration();
}

// ===== AGGRESSIVE CANCELLATION TEST =====
function testAggressiveCancellation() {
  console.log('\n🔥 Aggressive cancellation test...');

  var cancelCount = 0;
  var maxCancels = 10;

  function rapidCancelTest() {
    if (cancelCount >= maxCancels) {
      console.log(`✅ Aggressive cancellation completed: ${cancelCount} cancels`);
      return;
    }

    // Start synthesis
    speech.startSpeaking({
      text: `Cancelación número ${cancelCount + 1}`,
      rate: 0.8
    });

    // Cancel immediately
    setTimeout(() => {
      speech.cancelSpeaking();
      cancelCount++;

      // Next cancellation
      setTimeout(rapidCancelTest, 50);
    }, 100);
  }

  rapidCancelTest();
}

// ===== SPEECH EVENTS =====
speech.addEventListener('started', function (e) {
  // Optional log for debugging if required
  // console.log('🎙️ Started:', e.text?.substring(0, 30) + '...');
});

speech.addEventListener('completed', function (e) {
  console.log('✅ Completed:', e.text?.substring(0, 30) + '...');
});

speech.addEventListener('stopped', function (e) {
  console.log('⏹️ Stopped:', e.text?.substring(0, 30) + '...');
});

speech.addEventListener('canceled', function (e) {
  console.log('❌ Canceled:', e.text?.substring(0, 30) + '...');
});

// ===== TEST EXECUTION =====
console.log('🚀 Starting TTS v3.1 performance tests');
console.log('📱 Platform: Android');
console.log('🎯 Focus: Stop/cancel -> start optimization');

// Wait for the module to be ready
setTimeout(() => {
  if (!utterance.isSupported()) {
    console.error('❌ TTS is not supported on this device');
    return;
  }

  console.log('✅ TTS supported, starting tests...');

  // Test 1: Rapid sequences
  setTimeout(() => testFastCancelStart('Rapid Sequences', 5), 1000);

  // Test 2: Aggressive cancellation
  setTimeout(() => testAggressiveCancellation(), 8000);

  // Test 3: Very rapid sequences
  setTimeout(() => testFastCancelStart('Very Rapid Sequences', 10), 15000);

  // Show final results
  setTimeout(() => {
    console.log('\n📊 === FINAL RESULTS ===');
    testResults.forEach(result => {
      console.log(`${result.test}: ${result.avgTime.toFixed(2)}ms average`);
    });

    var overallAvg = testResults.reduce((sum, r) => sum + r.avgTime, 0) / testResults.length;
    console.log(`\n🎯 Overall average: ${overallAvg.toFixed(2)}ms`);
    console.log('✅ Tests completed - TTS state clean and ready');
  }, 25000);

}, 500);

// ===== EXPORT FOR TITANIUM USAGE =====
if (typeof module !== 'undefined') {
  module.exports = {
    testFastCancelStart: testFastCancelStart,
    testAggressiveCancellation: testAggressiveCancellation,
    speech: speech
  };
}
