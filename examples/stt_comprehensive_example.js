/**
 * Utterance v4.1 - Comprehensive Speech-to-Text Example
 * Advanced demonstration of STT features (iOS and Android)
 * 
 * Features:
 * - Voice command processing
 * - Real-time transcription (partial results)
 * - Multi-language recognition
 * - Advanced error handling and recovery
 * - Permission management
 * - Network state awareness
 * - Performance optimization
 * - Continuous listening modes
 */

const utterance = require('bencoding.utterance');

class ComprehensiveSTTDemo {
  constructor() {
    console.log('🎤 Comprehensive STT Demo - Utterance v4.1');
    console.log(`📱 Platform: ${Ti.Platform.osname} ${Ti.Platform.version} `);

    this.speechToText = utterance.createSpeechToText();
    this.isListening = false;
    this.continuousMode = false;
    this.commandHistory = [];
    this.errorCount = 0;
    this.networkState = Ti.Network.online;

    this.initialize();
  }

  // =========================================================================
  // 🔧 INITIALIZATION & SETUP
  // =========================================================================

  initialize() {
    if (!this.speechToText.isSupported()) {
      console.error('❌ STT not supported on this device');
      this.showUnsupportedDevice();
      return;
    }

    console.log('✅ STT supported, initializing...');

    this.setupEventListeners();
    this.setupNetworkMonitoring();
    this.checkPermissions();
    this.startDemo();
  }

  setupEventListeners() {
    // STT event listeners
    this.speechToText.addEventListener('started', this.onSTTStarted.bind(this));
    this.speechToText.addEventListener('partial', this.onSTTPartial.bind(this));
    this.speechToText.addEventListener('canceled', this.onSTTCanceled.bind(this));
    this.speechToText.addEventListener('completed', this.onSTTCompleted.bind(this));
  }

  setupNetworkMonitoring() {
    Ti.Network.addEventListener('change', (e) => {
      this.networkState = e.online;
      console.log(`🌐 Network state: ${e.online ? 'Online' : 'Offline'} `);

      if (!e.online && this.isListening) {
        console.log('📡 Lost network during recognition');
        this.handleNetworkLoss();
      }
    });
  }

  // requestPermissions() works on both platforms and answers in the `permissions` event
  checkPermissions() {
    if (this.speechToText.getPermissionStatus().granted) {
      console.log('✅ Permissions already granted');
      return;
    }
    console.log('🎤 Requesting permissions...');
    this.requestAudioPermission();
  }

  requestAudioPermission() {
    this.speechToText.addEventListener('permissions', (e) => {
      if (e.granted) {
        console.log('✅ Permissions granted');
      } else {
        console.error(`❌ Permissions denied (${e.status})`);
        this.showPermissionDenied();
      }
    }, { once: true });
    this.speechToText.requestPermissions();
  }

  // =========================================================================
  // 🎤 CORE STT METHODS
  // =========================================================================

  startListening(options = {}) {
    if (!this.networkState) {
      console.log('📵 Cannot start recognition - network required');
      this.showNetworkRequired();
      return;
    }

    if (this.isListening) {
      console.log('⚠️ Already listening, please wait...');
      return;
    }

    // No system dialog shows a prompt anymore: promptText is only a label for the log
    const hint = options.promptText || 'Speak now...';
    const config = {
      language: options.language || 'en-US',
      maxResults: options.maxResults || 5,
      taskHint: options.taskHint || this.speechToText.TASK_HINT_DICTATION,
      // The words the app expects: iOS uses them, and Android passes them on to a recognizer that may ignore them
      contextualStrings: ['hello', 'time', 'date', 'weather', 'search', 'help', 'history']
    };

    console.log(`🎤 Starting recognition: "${hint}"`);
    this.speechToText.startSpeechToText(config);

    // Safety limit: the session normally ends by itself after a pause, and this does nothing once it has finished
    this.stopTimer = setTimeout(() => this.speechToText.stopRecording(), options.listenMs || 8000);
  }

  startContinuousListening() {
    console.log('🔄 Starting continuous listening mode...');
    this.continuousMode = true;
    this.startListening({
      promptText: 'Continuous mode active - speak commands...',
      maxResults: 3
    });
  }

  stopContinuousListening() {
    console.log('🛑 Stopping continuous listening mode...');
    this.continuousMode = false;
  }

  // =========================================================================
  // 🎯 VOICE COMMAND PROCESSING
  // =========================================================================

  processVoiceCommand(recognizedText) {
    const command = recognizedText.toLowerCase().trim();
    const timestamp = new Date().toLocaleTimeString();

    // Add to command history
    this.commandHistory.push({
      text: recognizedText,
      command: command,
      timestamp: timestamp,
      processed: false
    });

    console.log(`🎯 Processing: "${recognizedText}"`);

    // Command routing
    let processed = false;

    if (command.includes('hello') || command.includes('hi')) {
      processed = this.handleGreetingCommand(command);
    } else if (command.includes('time')) {
      processed = this.handleTimeCommand(command);
    } else if (command.includes('date')) {
      processed = this.handleDateCommand(command);
    } else if (command.includes('weather')) {
      processed = this.handleWeatherCommand(command);
    } else if (command.includes('search') || command.includes('find')) {
      processed = this.handleSearchCommand(command, recognizedText);
    } else if (command.includes('call') || command.includes('phone')) {
      processed = this.handleCallCommand(command, recognizedText);
    } else if (command.includes('continuous')) {
      processed = this.handleContinuousCommand(command);
    } else if (command.includes('stop') || command.includes('quit') || command.includes('exit')) {
      processed = this.handleStopCommand(command);
    } else if (command.includes('help')) {
      processed = this.handleHelpCommand(command);
    } else if (command.includes('history')) {
      processed = this.handleHistoryCommand(command);
    } else if (command.includes('clear')) {
      processed = this.handleClearCommand(command);
    } else {
      processed = this.handleUnknownCommand(recognizedText);
    }

    // Update history
    this.commandHistory[this.commandHistory.length - 1].processed = processed;

    // Continue listening if in continuous mode
    if (this.continuousMode && processed && !command.includes('stop')) {
      setTimeout(() => {
        this.startListening({
          promptText: 'Continuous mode - say another command...',
          maxResults: 3
        });
      }, 1000);
    }
  }

  // =========================================================================
  // 🎯 COMMAND HANDLERS
  // =========================================================================

  handleGreetingCommand(command) {
    console.log('👋 Greeting command detected');
    const responses = [
      'Hello! How can I help you today?',
      'Hi there! What would you like to do?',
      'Greetings! I\'m ready to assist you.'
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];
    console.log(`💬 Response: ${response}`);

    return true;
  }

  handleTimeCommand(command) {
    console.log('🕐 Time command detected');
    const now = new Date();
    const timeString = now.toLocaleTimeString();

    console.log(`💬 Current time: ${timeString}`);
    return true;
  }

  handleDateCommand(command) {
    console.log('📅 Date command detected');
    const now = new Date();
    const dateString = now.toLocaleDateString();

    console.log(`💬 Today's date: ${dateString}`);
    return true;
  }

  handleWeatherCommand(command) {
    console.log('🌤️ Weather command detected');
    console.log('💬 Weather feature would connect to weather API here');
    return true;
  }

  handleSearchCommand(command, fullText) {
    console.log('🔍 Search command detected');

    // Extract search query
    const searchTerms = ['search for', 'search', 'find', 'look for'];
    let query = fullText;

    for (const term of searchTerms) {
      const index = command.indexOf(term);
      if (index !== -1) {
        query = fullText.substring(fullText.toLowerCase().indexOf(term) + term.length).trim();
        break;
      }
    }

    console.log(`💬 Search query: "${query}"`);
    return true;
  }

  handleCallCommand(command, fullText) {
    console.log('📞 Call command detected');

    // Extract contact name
    const callTerms = ['call', 'phone'];
    let contact = fullText;

    for (const term of callTerms) {
      const index = command.indexOf(term);
      if (index !== -1) {
        contact = fullText.substring(fullText.toLowerCase().indexOf(term) + term.length).trim();
        break;
      }
    }

    console.log(`💬 Call contact: "${contact}"`);
    return true;
  }

  handleContinuousCommand(command) {
    console.log('🔄 Continuous mode command detected');

    if (command.includes('start') || command.includes('begin')) {
      this.startContinuousListening();
    } else if (command.includes('stop') || command.includes('end')) {
      this.stopContinuousListening();
    }

    return true;
  }

  handleStopCommand(command) {
    console.log('🛑 Stop command detected');
    this.stopContinuousListening();
    console.log('💬 Voice commands stopped. Goodbye!');
    return true;
  }

  handleHelpCommand(command) {
    console.log('❓ Help command detected');

    const helpText = `
🎤 Available voice commands:
• "Hello" - Greeting
• "What time is it?" - Current time
• "What's the date?" - Current date  
• "Search for [query]" - Search something
• "Call [contact]" - Make a call
• "Start continuous" - Enable continuous listening
• "Stop continuous" - Disable continuous listening
• "Help" - Show this help
• "History" - Show command history
• "Clear history" - Clear command history
• "Stop" - Exit voice commands
    `;

    console.log(helpText);
    return true;
  }

  handleHistoryCommand(command) {
    console.log('📚 History command detected');

    if (this.commandHistory.length === 0) {
      console.log('💬 No commands in history');
      return true;
    }

    console.log('📚 Command History:');
    this.commandHistory.slice(-10).forEach((entry, index) => {
      const status = entry.processed ? '✅' : '❌';
      console.log(`  ${status} [${entry.timestamp}] "${entry.text}"`);
    });

    return true;
  }

  handleClearCommand(command) {
    console.log('🗑️ Clear command detected');

    if (command.includes('history')) {
      this.commandHistory = [];
      console.log('💬 Command history cleared');
    }

    return true;
  }

  handleUnknownCommand(recognizedText) {
    console.log('❓ Unknown command');
    console.log(`💬 I didn't understand: "${recognizedText}"`);
    console.log('💬 Try saying "help" for available commands');
    return false;
  }

  // =========================================================================
  // 🛡️ ADVANCED ERROR HANDLING & RECOVERY
  // =========================================================================

  // Failures arrive in `completed` with success: false, a `code` that does not change and a `message` for the log
  handleSTTError(e) {
    this.errorCount++;
    console.error(`🚨 STT Error #${this.errorCount}: ${e.code} - ${e.message}`);

    const speechToText = this.speechToText;
    const errorHandlers = {
      [speechToText.ERROR_NO_SPEECH]: () => this.handleNoMatch(),
      [speechToText.ERROR_NETWORK]: () => this.handleNetworkError(),
      [speechToText.ERROR_AUDIO]: () => this.handleAudioError(),
      [speechToText.ERROR_BUSY]: () => this.handleRecognizerBusy(),
      [speechToText.ERROR_PERMISSION_DENIED]: () => this.handleInsufficientPermissions()
    };

    const handler = errorHandlers[e.code];
    if (handler) {
      handler();
    } else {
      this.handleUnknownError(e.message);
    }

    // Auto-retry when nothing was heard
    if (e.code === speechToText.ERROR_NO_SPEECH && this.continuousMode && this.errorCount < 3) {
      setTimeout(() => {
        console.log('🔄 Auto-retrying after error...');
        this.startListening({
          promptText: 'Retrying after error - speak again...',
          maxResults: 3
        });
      }, 2000);
    }
  }

  handleNetworkError() {
    console.log('🌐 Network error - connectivity issues');
    console.log('💬 Network error. Please check your internet connection.');
  }

  handleAudioError() {
    console.log('🎤 Audio error - microphone issues');
    console.log('💬 Microphone error. Please check microphone permissions and try again.');
  }

  handleNoMatch() {
    console.log('❓ No match - nothing recognized');
    console.log('💬 No speech detected. Please speak more clearly and try again.');
  }

  handleRecognizerBusy() {
    console.log('⏳ Recognizer busy - another session is running');
    console.log('💬 Speech recognition is busy. Please wait a moment and try again.');
  }

  handleInsufficientPermissions() {
    console.log('🔒 Insufficient permissions - microphone access required');
    console.log('💬 Microphone permission required for speech recognition.');
    this.requestAudioPermission();
  }

  handleUnknownError(message) {
    console.log(`❓ Unknown error: ${message}`);
    console.log(`💬 An unknown error occurred: ${message}`);
  }

  handleNetworkLoss() {
    console.log('📡 Network lost during recognition');
    console.log('💬 Internet connection lost. Speech recognition requires network access.');

    if (this.continuousMode) {
      this.stopContinuousListening();
      console.log('🔄 Continuous mode disabled due to network loss');
    }
  }

  // =========================================================================
  // 🎯 EVENT HANDLERS
  // =========================================================================

  onSTTStarted(e) {
    console.log('🎤 STT Started - Listening for speech...');
    this.isListening = true;
    this.errorCount = 0; // Reset error count on successful start
  }

  // The text so far. A command is acted on as soon as a partial contains it, and cancelRecording() drops the session
  onSTTPartial(e) {
    console.log('… so far:', e.text);
    if (/\b(stop|quit|exit)\b/i.test(e.text)) {
      clearTimeout(this.stopTimer);
      this.speechToText.cancelRecording();
      this.handleStopCommand(e.text.toLowerCase());
    }
  }

  onSTTCanceled() {
    console.log('✋ STT canceled');
    clearTimeout(this.stopTimer);
    this.isListening = false;
  }

  onSTTCompleted(e) {
    console.log('✅ STT Completed');
    clearTimeout(this.stopTimer);
    this.isListening = false;

    if (!e.success) {
      this.handleSTTError(e);
    } else if (e.detectedInput) {
      console.log('📝 Best result:', e.text, '| alternatives:', e.words);
      this.processVoiceCommand(e.text);
    } else {
      console.log('🔇 No speech detected');

      if (this.continuousMode) {
        // Continue listening in continuous mode
        setTimeout(() => {
          this.startListening({
            promptText: 'Continuous mode - try again...',
            maxResults: 3
          });
        }, 1000);
      }
    }
  }

  // =========================================================================
  // 🎤 ADVANCED STT FEATURES
  // =========================================================================

  startTranscriptionMode() {
    console.log('📝 Starting transcription mode...');
    this.transcriptionMode = true;
    this.transcriptionBuffer = [];

    this.startListening({
      promptText: 'Transcription mode - speak naturally...',
      maxResults: 1
    });
  }

  stopTranscriptionMode() {
    console.log('🛑 Stopping transcription mode...');
    this.transcriptionMode = false;

    if (this.transcriptionBuffer && this.transcriptionBuffer.length > 0) {
      const fullTranscription = this.transcriptionBuffer.join(' ');
      console.log('📄 Full transcription:', fullTranscription);
      return fullTranscription;
    }

    return '';
  }

  multiLanguageTest() {
    const languages = [
      { code: 'en-US', test: 'Hello, this is English' },
      { code: 'es-ES', test: 'Hola, esto es español' },
      { code: 'fr-FR', test: 'Bonjour, ceci est français' }
    ];

    console.log('🌍 Starting multi-language test...');
    languages.forEach((lang, index) => {
      setTimeout(() => {
        console.log(`🌍 Testing ${lang.code}: Say "${lang.test}"`);
        this.startListening({
          promptText: `Say: "${lang.test}" (${lang.code})`,
          language: lang.code,
          maxResults: 1
        });
      }, index * 5000);
    });
  }

  // =========================================================================
  // 📊 ANALYTICS & PERFORMANCE
  // =========================================================================

  getAnalytics() {
    const totalCommands = this.commandHistory.length;
    const successfulCommands = this.commandHistory.filter(cmd => cmd.processed).length;
    const successRate = totalCommands > 0 ? (successfulCommands / totalCommands * 100).toFixed(1) : 0;

    const analytics = {
      totalCommands,
      successfulCommands,
      failedCommands: totalCommands - successfulCommands,
      successRate: `${successRate}%`,
      errorCount: this.errorCount,
      continuousMode: this.continuousMode,
      networkState: this.networkState ? 'Online' : 'Offline'
    };

    console.log('📊 STT Analytics:', analytics);
    return analytics;
  }

  resetAnalytics() {
    this.commandHistory = [];
    this.errorCount = 0;
    console.log('🔄 Analytics reset');
  }

  // =========================================================================
  // 🔧 UTILITY METHODS
  // =========================================================================

  showUnsupportedDevice() {
    console.log('❌ Device Not Supported:');
    console.log('   Speech recognition is not available on this device');
    console.log('   On Android it needs a speech recognition service, such as the Google app installed and updated');
  }

  showPermissionDenied() {
    console.log('🔒 Permission Denied:');
    console.log('   Microphone permission is required for speech recognition');
    console.log('   Please grant permission in app settings to use voice features');
  }

  showNetworkRequired() {
    console.log('📡 Network Required:');
    console.log('   Speech recognition requires internet connection');
    console.log('   Please connect to WiFi or cellular data and try again');
  }

  getCommandList() {
    const commands = [
      'Hello / Hi',
      'What time is it?',
      'What\'s the date?',
      'Search for [something]',
      'Call [contact name]',
      'Start continuous',
      'Stop continuous',
      'Help',
      'History',
      'Clear history',
      'Stop / Quit / Exit'
    ];

    console.log('📋 Available Commands:');
    commands.forEach((cmd, index) => {
      console.log(`   ${index + 1}. ${cmd}`);
    });

    return commands;
  }

  cleanup() {
    console.log('🧹 Cleaning up STT Demo...');

    this.stopContinuousListening();
    this.isListening = false;

    // Remove event listeners
    if (this.speechToText) {
      this.speechToText.removeEventListener('started', this.onSTTStarted);
      this.speechToText.removeEventListener('partial', this.onSTTPartial);
      this.speechToText.removeEventListener('canceled', this.onSTTCanceled);
      this.speechToText.removeEventListener('completed', this.onSTTCompleted);
    }

    // Clear data
    this.commandHistory = [];
    this.errorCount = 0;

    console.log('✅ STT Demo cleanup completed');
  }

  // =========================================================================
  // 🎮 INTERACTIVE DEMO METHODS
  // =========================================================================

  runInteractiveDemo() {
    console.log('🎮 Starting Interactive STT Demo...');
    console.log('📋 Available commands:');
    this.getCommandList();

    console.log('\n🎤 Demo is now active - speak any command!');
    console.log('💡 Tip: Say "help" for a reminder of available commands');

    this.startListening({
      promptText: 'Interactive Demo - Say any command...',
      maxResults: 5
    });
  }

  runPerformanceTest() {
    console.log('⚡ Starting STT Performance Test...');

    const testCommands = [
      'Hello world',
      'What time is it',
      'Search for weather',
      'Call mom',
      'Help me'
    ];

    console.log('📊 Performance test will cycle through sample commands');
    console.log('🎤 Please say each command when prompted:');

    let currentTest = 0;
    const startTime = Date.now();

    const runNextTest = () => {
      if (currentTest >= testCommands.length) {
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;

        console.log('✅ Performance test completed!');
        console.log(`⏱️ Total time: ${totalTime} seconds`);
        console.log('📊 Final analytics:');
        this.getAnalytics();
        return;
      }

      const command = testCommands[currentTest];
      console.log(`🎯 Test ${currentTest + 1}/${testCommands.length}: Say "${command}"`);

      this.startListening({
        promptText: `Performance Test ${currentTest + 1}: Say "${command}"`,
        maxResults: 1
      });

      currentTest++;
    };

    // Override completion handler for test
    const originalHandler = this.onSTTCompleted.bind(this);
    this.speechToText.removeEventListener('completed', originalHandler);

    this.speechToText.addEventListener('completed', (e) => {
      console.log(`✅ Test ${currentTest} completed: "${e.text || 'No result'}"`);
      setTimeout(runNextTest, 1000);
    });

    // Start first test
    runNextTest();

    // Restore original handler after test
    setTimeout(() => {
      this.speechToText.removeEventListener('completed', runNextTest);
      this.speechToText.addEventListener('completed', originalHandler);
    }, testCommands.length * 10000 + 5000);
  }
}

// =============================================================================
// 🚀 DEMO STARTUP & USAGE EXAMPLES
// =============================================================================

console.log('🎤 Initializing Comprehensive STT Demo...');

// Create the demo instance
const sttDemo = new ComprehensiveSTTDemo();

// Export for external use
module.exports = ComprehensiveSTTDemo;

// =============================================================================
// 📝 USAGE EXAMPLES
// =============================================================================

/*
// Example 1: Basic Usage
const demo = new ComprehensiveSTTDemo();

// Example 2: Run Interactive Demo
setTimeout(() => {
  if (sttDemo.speechToText && sttDemo.speechToText.isSupported()) {
    sttDemo.runInteractiveDemo();
  }
}, 2000);

// Example 3: Performance Testing
setTimeout(() => {
  if (sttDemo.speechToText && sttDemo.speechToText.isSupported()) {
    sttDemo.runPerformanceTest();
  }
}, 5000);

// Example 4: Continuous Listening
setTimeout(() => {
  if (sttDemo.speechToText && sttDemo.speechToText.isSupported()) {
    sttDemo.startContinuousListening();
  }
}, 3000);

// Example 5: Transcription Mode
setTimeout(() => {
  if (sttDemo.speechToText && sttDemo.speechToText.isSupported()) {
    sttDemo.startTranscriptionMode();
  }
}, 4000);

// Example 6: Multi-language Test
setTimeout(() => {
  if (sttDemo.speechToText && sttDemo.speechToText.isSupported()) {
    sttDemo.multiLanguageTest();
  }
}, 6000);

// App lifecycle cleanup
Ti.App.addEventListener('pause', () => {
  console.log('📱 App paused - cleaning up STT...');
  if (sttDemo) {
    sttDemo.cleanup();
  }
});

Ti.App.addEventListener('resume', () => {
  console.log('📱 App resumed - STT ready');
});
*/
