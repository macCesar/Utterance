/**
 * Utterance v3.0 - Comprehensive Speech-to-Text Example
 * Advanced demonstration of STT features (Android only)
 * 
 * Features:
 * - Voice command processing
 * - Real-time transcription
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
    console.log('🎤 Comprehensive STT Demo - Utterance v3.0');
    console.log(`📱 Platform: ${Ti.Platform.osname} ${Ti.Platform.version} `);

    if (Ti.Platform.osname !== 'android') {
      console.log('ℹ️ Speech-to-Text is only available on Android');
      this.showPlatformLimitation();
      return;
    }

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
    this.speechToText.addEventListener('completed', this.onSTTCompleted.bind(this));
    this.speechToText.addEventListener('error', this.onSTTError.bind(this));
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

  checkPermissions() {
    if (Ti.Platform.osname === 'android') {
      const hasAudioPermission = Ti.Android.hasPermission('android.permission.RECORD_AUDIO');

      if (!hasAudioPermission) {
        console.log('🎤 Requesting audio permission...');
        this.requestAudioPermission();
      } else {
        console.log('✅ Audio permissions already granted');
      }
    }
  }

  requestAudioPermission() {
    Ti.Android.requestPermissions(['android.permission.RECORD_AUDIO'], (e) => {
      if (e.success) {
        console.log('✅ Audio permission granted');
      } else {
        console.error('❌ Audio permission denied');
        this.showPermissionDenied();
      }
    });
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

    const config = {
      promptText: options.promptText || 'Speak now...',
      maxResults: options.maxResults || 5,
      languageModel: options.languageModel || this.speechToText.LANGUAGE_MODEL_FREE_FORM
    };

    console.log(`🎤 Starting recognition: "${config.promptText}"`);
    this.speechToText.startSpeechToText(config);
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

  handleSTTError(error) {
    this.errorCount++;
    console.error(`🚨 STT Error #${this.errorCount}: ${error}`);

    const errorHandlers = {
      'ERROR_NETWORK_TIMEOUT': () => this.handleNetworkTimeout(),
      'ERROR_NETWORK': () => this.handleNetworkError(),
      'ERROR_AUDIO': () => this.handleAudioError(),
      'ERROR_SERVER': () => this.handleServerError(),
      'ERROR_CLIENT': () => this.handleClientError(),
      'ERROR_SPEECH_TIMEOUT': () => this.handleSpeechTimeout(),
      'ERROR_NO_MATCH': () => this.handleNoMatch(),
      'ERROR_RECOGNIZER_BUSY': () => this.handleRecognizerBusy(),
      'ERROR_INSUFFICIENT_PERMISSIONS': () => this.handleInsufficientPermissions()
    };

    const handler = errorHandlers[error];
    if (handler) {
      handler();
    } else {
      this.handleUnknownError(error);
    }

    // Auto-retry logic for certain errors
    if (this.shouldRetryOnError(error) && this.continuousMode) {
      setTimeout(() => {
        console.log('🔄 Auto-retrying after error...');
        this.startListening({
          promptText: 'Retrying after error - speak again...',
          maxResults: 3
        });
      }, 2000);
    }
  }

  shouldRetryOnError(error) {
    const retryableErrors = [
      'ERROR_SPEECH_TIMEOUT',
      'ERROR_NO_MATCH',
      'ERROR_NETWORK_TIMEOUT'
    ];
    return retryableErrors.includes(error) && this.errorCount < 3;
  }

  handleNetworkTimeout() {
    console.log('🌐 Network timeout - check internet connection');
    console.log('💬 Network timeout. Please check your internet connection.');
  }

  handleNetworkError() {
    console.log('🌐 Network error - connectivity issues');
    console.log('💬 Network error. Please check your internet connection.');
  }

  handleAudioError() {
    console.log('🎤 Audio error - microphone issues');
    console.log('💬 Microphone error. Please check microphone permissions and try again.');
  }

  handleServerError() {
    console.log('🖥️ Server error - recognition service issues');
    console.log('💬 Speech recognition server error. Please try again in a moment.');
  }

  handleClientError() {
    console.log('📱 Client error - local device issues');
    console.log('💬 Speech recognition client error. Please restart the app.');
  }

  handleSpeechTimeout() {
    console.log('🔇 Speech timeout - no speech detected');
    console.log('💬 No speech detected. Please speak more clearly and try again.');
  }

  handleNoMatch() {
    console.log('❓ No match - speech not recognized');
    console.log('💬 Could not recognize speech. Please try speaking more clearly.');
  }

  handleRecognizerBusy() {
    console.log('⏳ Recognizer busy - service overloaded');
    console.log('💬 Speech recognition is busy. Please wait a moment and try again.');
  }

  handleInsufficientPermissions() {
    console.log('🔒 Insufficient permissions - microphone access required');
    console.log('💬 Microphone permission required for speech recognition.');
    this.requestAudioPermission();
  }

  handleUnknownError(error) {
    console.log(`❓ Unknown error: ${error}`);
    console.log(`💬 An unknown error occurred: ${error}`);
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

  onSTTCompleted(e) {
    console.log('✅ STT Completed');
    this.isListening = false;

    if (e.results && e.results.length > 0) {
      console.log('📝 Recognition results:', e.results);
      this.processVoiceCommand(e.results[0]);
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

  onSTTError(e) {
    console.error('💥 STT Error in event handler:', e.error);
    this.isListening = false;
    this.handleSTTError(e.error);
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

  showPlatformLimitation() {
    console.log('⚠️ Platform Limitation Notice:');
    console.log('   Speech-to-Text is only available on Android devices');
    console.log('   Current platform:', Ti.Platform.osname);
    console.log('   Please test this demo on an Android device');
  }

  showUnsupportedDevice() {
    console.log('❌ Device Not Supported:');
    console.log('   Speech recognition is not available on this Android device');
    console.log('   Requirements: Android 5.0+ with Google Play Services');
    console.log('   Please ensure Google app is installed and updated');
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
      this.speechToText.removeEventListener('completed', this.onSTTCompleted);
      this.speechToText.removeEventListener('error', this.onSTTError);
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
      console.log(`✅ Test ${currentTest} completed: "${e.results?.[0] || 'No result'}"`);
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
