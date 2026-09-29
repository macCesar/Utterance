// Test to verify that cards can be pronounced quickly without missing any
var utterance = require('bencoding.utterance');
var speech = utterance.createSpeech();

// Test Cards
var cards = ['El Sol', 'La Luna', 'El Gato', 'La Paloma', 'El Pescado', 'La Casa', 'El Árbol', 'La Flor'];
var cardIndex = 0;
var eventsReceived = [];

// Configure listeners for debugging
speech.addEventListener('started', function (e) {
  console.log('[STARTED] ' + e.text + ' (success: ' + e.success + ')');
  eventsReceived.push('started:' + e.text);
});

speech.addEventListener('completed', function (e) {
  console.log('[COMPLETED] ' + e.text + ' (success: ' + e.success + ')');
  eventsReceived.push('completed:' + e.text);
});

speech.addEventListener('stopped', function (e) {
  console.log('[STOPPED] ' + e.text + ' (success: ' + e.success + ')');
  eventsReceived.push('stopped:' + e.text);
});

speech.addEventListener('canceled', function (e) {
  console.log('[CANCELED] ' + e.text + ' (success: ' + e.success + ')');
  eventsReceived.push('canceled:' + e.text);
});

function speakNextCard() {
  if (cardIndex >= cards.length) {
    console.log('\n=== TEST COMPLETED ===');
    console.log('Events received:', eventsReceived.length);
    eventsReceived.forEach(function (event, i) {
      console.log((i + 1) + ': ' + event);
    });
    return;
  }

  var text = cards[cardIndex];
  cardIndex++;

  console.log('\n--- Speaking card #' + cardIndex + ': "' + text + '" ---');

  // Simulate user behavior: rapid stop + start
  if (speech.isSpeaking) {
    console.log('TTS is speaking, stopping...');
    speech.stopSpeaking();
  }

  console.log('Starting new pronunciation...');
  speech.startSpeaking({ text: text, voice: 'es_MX', rate: 1.2 });

  // Continue with the next card in 300ms (very fast)
  setTimeout(speakNextCard, 300);
}

// Diagnostic test output
if (speech.getDiagnostics) {
  console.log('TTS diagnostics:', JSON.stringify(speech.getDiagnostics(), null, 2));
}

console.log('=== STARTING RAPID CARD PRONUNCIATION TEST ===');
console.log('Testing ' + cards.length + ' cards with rapid interruptions...\n');

// Start test
speakNextCard();

// Finalization test after 5 seconds
setTimeout(function () {
  console.log('\n=== FINISHING TEST ===');
  if (speech.isSpeaking) {
    speech.stopSpeaking();
  }

  console.log('\nTest results:');
  console.log('- Scheduled cards: ' + cards.length);
  console.log('- Started events: ' + eventsReceived.filter(e => e.startsWith('started:')).length);
  console.log('- Stopped events: ' + eventsReceived.filter(e => e.startsWith('stopped:')).length);
  console.log('- Completed events: ' + eventsReceived.filter(e => e.startsWith('completed:')).length);

  // Verify whether every card was spoken
  var startedCards = eventsReceived.filter(e => e.startsWith('started:')).map(e => e.split(':')[1]);
  var missingCards = cards.filter(card => !startedCards.includes(card));

  if (missingCards.length === 0) {
    console.log('✅ SUCCESS: Every card was pronounced');
  } else {
    console.log('❌ FAILURE: Missing cards: ' + missingCards.join(', '));
  }
}, 5000);
