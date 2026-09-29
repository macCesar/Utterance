/**
 * 🎙️ Voice Explorer - FIXED version for Android
 * Fixes: Android TTS initialization timing + robust voice management
 *
 * ✅ ISSUES SOLVED:
 * - getModernVoices() returned an empty array on Android
 * - TTS was not initialized when voices were requested
 * - Missing fallbacks for legacy devices
 * - Improved error and timeout handling
 */

const utterance = require('bencoding.utterance')

class VoiceExplorerFixed {
  constructor() {
    console.log('🎙️ Starting Voice Explorer (Fixed Version)...')
    this.speech = utterance.createSpeech()
    this.isAndroid = Ti.Platform.osname === 'android'
    this.isIOS = Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad'

    // Initialization state
    this.isInitialized = false
    this.voices = []
    this.initRetryCount = 0
    this.maxInitRetries = 10

    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported on this device')
      return
    }

    this.createUI()
    this.initializeTTS()
  }

  createUI() {
    this.window = Ti.UI.createWindow({
      title: 'Voice Explorer (Fixed)',
      backgroundColor: '#f5f5f5',
      layout: 'vertical'
    })

    // Header
    const header = Ti.UI.createLabel({
      text: '🎙️ Voice Explorer & Tester (v2.0)',
      font: { fontSize: 20, fontWeight: 'bold' },
      color: '#333',
      textAlign: 'center',
      top: 20,
      height: 40
    })

    // Platform & Status info
    this.statusLabel = Ti.UI.createLabel({
      text: `Platform: ${Ti.Platform.osname}\nStatus: Initializing TTS...`,
      font: { fontSize: 14, fontWeight: 'bold' },
      color: '#e74c3c',
      textAlign: 'center',
      top: 10,
      height: 50
    })

    // Voice info display
    this.voiceInfoLabel = Ti.UI.createLabel({
      text: 'Waiting for TTS initialization...',
      font: { fontSize: 12 },
      color: '#666',
      textAlign: 'left',
      top: 10,
      left: 15,
      right: 15,
      height: Ti.UI.SIZE
    })

    // Scrollable voice list
    this.scrollView = Ti.UI.createScrollView({
      top: 20,
      height: '50%',
      showVerticalScrollIndicator: true
    })

    // Control buttons
    const buttonContainer = Ti.UI.createView({
      layout: 'horizontal',
      height: 60,
      top: 20
    })

    this.testAllButton = Ti.UI.createButton({
      title: 'Test All Voices',
      backgroundColor: '#95a5a6',
      color: 'white',
      borderRadius: 5,
      width: '30%',
      left: '2%',
      enabled: false
    })

    this.analyzeButton = Ti.UI.createButton({
      title: 'Analyze Voices',
      backgroundColor: '#95a5a6',
      color: 'white',
      borderRadius: 5,
      width: '30%',
      left: '1%',
      enabled: false
    })

    this.reloadButton = Ti.UI.createButton({
      title: 'Reload Voices',
      backgroundColor: '#f39c12',
      color: 'white',
      borderRadius: 5,
      width: '30%',
      right: '2%'
    })

    // Event listeners
    this.testAllButton.addEventListener('click', () => this.testAllVoices())
    this.analyzeButton.addEventListener('click', () => this.analyzeVoices())
    this.reloadButton.addEventListener('click', () => this.reinitializeTTS())

    buttonContainer.add(this.testAllButton)
    buttonContainer.add(this.analyzeButton)
    buttonContainer.add(this.reloadButton)

    // Debug info
    this.debugLabel = Ti.UI.createLabel({
      text: 'Debug info will appear here...',
      font: { fontSize: 10 },
      color: '#7f8c8d',
      textAlign: 'left',
      top: 10,
      left: 15,
      right: 15,
      height: Ti.UI.SIZE
    })

    this.window.add(header)
    this.window.add(this.statusLabel)
    this.window.add(this.voiceInfoLabel)
    this.window.add(this.scrollView)
    this.window.add(buttonContainer)
    this.window.add(this.debugLabel)

    this.window.open()
  }

  // ✅ MAIN INITIALIZATION METHOD
  initializeTTS() {
    console.log('🔄 Initializing TTS...')
    this.updateStatus('Initializing TTS engine...', '#f39c12')

    if (this.isAndroid) {
      this.initializeAndroidTTS()
    } else {
      this.initializeIOSTTS()
    }
  }

  // ✅ ANDROID-SPECIFIC INITIALIZATION
  initializeAndroidTTS() {
    console.log('🤖 Android TTS initialization...')

    // Approach 1: use isTTSReady() when available
    if (typeof this.speech.isTTSReady === 'function') {
      this.waitForAndroidTTSReady()
    } else {
      // Approach 2: use a fixed timeout plus events
      this.useAndroidTimeoutMethod()
    }
  }

  waitForAndroidTTSReady() {
    const checkReady = () => {
      this.initRetryCount++

      try {
        const isReady = this.speech.isTTSReady()
        console.log(`🔍 TTS Ready check #${this.initRetryCount}: ${isReady}`)

        if (isReady) {
          console.log('✅ Android TTS is ready!')
          this.onTTSInitialized()
        } else if (this.initRetryCount < this.maxInitRetries) {
          this.updateStatus(`Waiting for TTS... (${this.initRetryCount}/${this.maxInitRetries})`, '#f39c12')
          setTimeout(checkReady, 500)
        } else {
          console.warn('⚠️ TTS ready timeout, trying to load voices anyway...')
          this.onTTSInitialized()
        }
      } catch (error) {
        console.error('❌ Error checking TTS ready:', error)
        this.useAndroidTimeoutMethod()
      }
    }

    checkReady()
  }

  useAndroidTimeoutMethod() {
    console.log('🕐 Using Android timeout method...')

    // Try a very short test text to trigger TTS
    try {
      this.speech.addEventListener('completed', this.handleInitTestCompleted.bind(this))
      this.speech.addEventListener('started', this.handleInitTestStarted.bind(this))

      this.speech.startSpeaking({
        text: '.',  // Minimal text
        rate: this.speech.MAX_SPEECH_RATE || 3.0  // Very fast
      })
    } catch (error) {
      console.error('❌ Error with test speech:', error)
      // Fallback: wait for a fixed duration
      setTimeout(() => {
        this.onTTSInitialized()
      }, 3000)
    }
  }

  handleInitTestStarted(e) {
    console.log('🎤 Init test started - TTS is working')
    this.speech.removeEventListener('started', this.handleInitTestStarted.bind(this))
  }

  handleInitTestCompleted(e) {
    console.log('✅ Init test completed - TTS ready')
    this.speech.removeEventListener('completed', this.handleInitTestCompleted.bind(this))
    this.onTTSInitialized()
  }

  // ✅ IOS INITIALIZATION (simpler)
  initializeIOSTTS() {
    console.log('🍎 iOS TTS initialization...')
    // iOS is usually faster, but add a small delay
    setTimeout(() => {
      this.onTTSInitialized()
    }, 500)
  }

  // ✅ CALLBACK WHEN TTS IS READY
  onTTSInitialized() {
    if (this.isInitialized) {
      console.log('ℹ️ TTS already initialized, skipping...')
      return
    }

    this.isInitialized = true
    console.log('🎉 TTS initialized successfully!')
    this.updateStatus('TTS Ready! Loading voices...', '#27ae60')

    // Wait a bit longer to ensure voices are available
    setTimeout(() => {
      this.loadVoices()
    }, 1000)
  }

  // ✅ IMPROVED VOICE LOADING
  loadVoices() {
    console.log('📋 Loading available voices...')
    this.updateStatus('Loading voices...', '#3498db')

    try {
      // Attempt the modern method first
      this.voices = this.speech.getModernVoices() || []
      console.log(`🎵 Modern API: Found ${this.voices.length} voices`)

      if (this.voices.length > 0) {
        this.displayModernVoices()
        this.enableControls()
        this.updateStatus(`Ready! Found ${this.voices.length} voices`, '#27ae60')
      } else {
        console.warn('⚠️ Modern API returned empty, trying legacy...')
        this.loadLegacyVoices()
      }
    } catch (error) {
      console.warn('⚠️ Modern voice API failed:', error)
      this.loadLegacyVoices()
    }

    this.updateDebugInfo()
  }

  loadLegacyVoices() {
    try {
      this.voices = this.speech.getVoices() || []
      console.log(`🎵 Legacy API: Found ${this.voices.length} voices`)

      if (this.voices.length > 0) {
        this.displayLegacyVoices()
        this.enableControls()
        this.updateStatus(`Ready! Found ${this.voices.length} legacy voices`, '#27ae60')
      } else {
        this.handleNoVoices()
      }
    } catch (error) {
      console.error('❌ Legacy voice API failed:', error)
      this.handleNoVoices()
    }
  }

  handleNoVoices() {
    console.error('❌ No voices available from any API')
    this.voiceInfoLabel.text = '❌ No voices available. This may indicate:\n• TTS not fully initialized\n• Device compatibility issue\n• Try the "Reload Voices" button'
    this.updateStatus('No voices found', '#e74c3c')

    // Display a prominent retry button
    this.showRetryOption()
  }

  showRetryOption() {
    const retryContainer = Ti.UI.createView({
      layout: 'vertical',
      height: Ti.UI.SIZE,
      top: 20,
      backgroundColor: '#ecf0f1',
      borderRadius: 10
    })

    const retryLabel = Ti.UI.createLabel({
      text: '🔄 Try reloading voices or restart the app',
      font: { fontSize: 14, fontWeight: 'bold' },
      color: '#e74c3c',
      textAlign: 'center',
      top: 15,
      height: 30
    })

    const bigRetryButton = Ti.UI.createButton({
      title: '🔄 RELOAD VOICES',
      backgroundColor: '#e74c3c',
      color: 'white',
      borderRadius: 5,
      font: { fontSize: 16, fontWeight: 'bold' },
      top: 10,
      bottom: 15,
      left: 20,
      right: 20,
      height: 50
    })

    bigRetryButton.addEventListener('click', () => {
      retryContainer.removeFromSuperview()
      this.reinitializeTTS()
    })

    retryContainer.add(retryLabel)
    retryContainer.add(bigRetryButton)
    this.scrollView.add(retryContainer)
  }

  enableControls() {
    this.testAllButton.enabled = true
    this.testAllButton.backgroundColor = '#e74c3c'
    this.analyzeButton.enabled = true
    this.analyzeButton.backgroundColor = '#3498db'
  }

  updateStatus(message, color = '#333') {
    this.statusLabel.text = `Platform: ${Ti.Platform.osname}\nStatus: ${message}`
    this.statusLabel.color = color
  }

  updateDebugInfo() {
    const debugInfo = `
Debug Info:
• Initialized: ${this.isInitialized}
• Platform: ${Ti.Platform.osname}
• Total voices: ${this.voices.length}
• Init retries: ${this.initRetryCount}
• Modern API: ${typeof this.speech.getModernVoices === 'function'}
• TTS Ready: ${typeof this.speech.isTTSReady === 'function' ? this.speech.isTTSReady() : 'N/A'}
    `.trim()

    this.debugLabel.text = debugInfo
  }

  // ✅ FULL REINITIALIZATION
  reinitializeTTS() {
    console.log('🔄 Reinitializing TTS...')
    this.isInitialized = false
    this.initRetryCount = 0
    this.voices = []

    // Clear UI
    this.scrollView.removeAllChildren()
    this.testAllButton.enabled = false
    this.testAllButton.backgroundColor = '#95a5a6'
    this.analyzeButton.enabled = false
    this.analyzeButton.backgroundColor = '#95a5a6'

    this.initializeTTS()
  }

  displayModernVoices() {
    const containerView = Ti.UI.createView({
      layout: 'vertical',
      height: Ti.UI.SIZE,
      top: 10
    })

    // Platform info
    const platformInfo = `✅ Platform: ${Ti.Platform.osname}\n🎵 Total Modern Voices: ${this.voices.length}\n📊 Using Advanced Voice API`
    this.voiceInfoLabel.text = platformInfo

    // Group voices by language
    const voicesByLanguage = this.groupVoicesByLanguage(this.voices)

    Object.keys(voicesByLanguage).forEach((language, index) => {
      const voices = voicesByLanguage[language]

      // Language header
      const langHeader = Ti.UI.createLabel({
        text: `🌍 ${language.toUpperCase()} (${voices.length} voices)`,
        font: { fontSize: 16, fontWeight: 'bold' },
        color: '#2c3e50',
        textAlign: 'left',
        top: index === 0 ? 10 : 20,
        left: 15,
        right: 15,
        height: 30
      })
      containerView.add(langHeader)

      // Voice buttons for this language
      voices.forEach((voice, voiceIndex) => {
        const button = this.createVoiceButton(voice, voiceIndex)
        containerView.add(button)
      })
    })

    this.scrollView.add(containerView)
  }

  displayLegacyVoices() {
    const containerView = Ti.UI.createView({
      layout: 'vertical',
      height: Ti.UI.SIZE,
      top: 10
    })

    this.voiceInfoLabel.text = `⚠️ Platform: ${Ti.Platform.osname}\n🎵 Legacy Voices: ${this.voices.length}\n📊 Using Basic Voice API`

    this.voices.forEach((voice, index) => {
      const voiceName = typeof voice === 'string' ? voice : (voice.name || voice.language || voice.locale || 'Unknown')

      const button = Ti.UI.createButton({
        title: `🎤 ${voiceName}`,
        backgroundColor: '#95a5a6',
        color: 'white',
        borderRadius: 5,
        top: 10,
        left: 15,
        right: 15,
        height: 50
      })

      button.addEventListener('click', () => {
        this.testVoice(voiceName, `Hello! This is voice ${voiceName}`)
      })

      containerView.add(button)
    })

    this.scrollView.add(containerView)
  }

  createVoiceButton(voice, index) {
    // Extract voice information
    const name = voice.name || 'Unknown'
    const language = voice.language || voice.locale || 'Unknown'
    const quality = voice.quality || 'Unknown'
    const network = voice.isNetworkConnectionRequired ? '🌐' : '📱'

    // Color based on quality
    let backgroundColor = '#95a5a6' // Default gray
    if (quality > 400) { backgroundColor = '#27ae60' } // High quality - green
    else if (quality > 300) { backgroundColor = '#f39c12' } // Medium - orange
    else if (quality > 200) { backgroundColor = '#3498db' } // Basic - blue

    const button = Ti.UI.createButton({
      title: `${network} ${name}\n${language} | Quality: ${quality}`,
      backgroundColor: backgroundColor,
      color: 'white',
      borderRadius: 5,
      font: { fontSize: 12 },
      textAlign: 'left',
      top: 5,
      left: 15,
      right: 15,
      height: 60
    })

    button.addEventListener('click', () => {
      this.testSpecificVoice(voice)
    })

    return button
  }

  groupVoicesByLanguage(voices) {
    const grouped = {}

    voices.forEach(voice => {
      const language = voice.language || voice.locale || 'unknown'
      const langCode = language.split('-')[0].split('_')[0] // Get base language

      if (!grouped[langCode]) {
        grouped[langCode] = []
      }
      grouped[langCode].push(voice)
    })

    return grouped
  }

  testSpecificVoice(voice) {
    const name = voice.name || voice.language || voice.locale
    const language = voice.language || voice.locale

    console.log(`🎤 Testing voice: ${name}`)

    // Create test text based on language
    const testTexts = {
      en: 'Hello! This is an English voice test. How does this sound?',
      es: '¡Hola! Esta es una prueba de voz en español. ¿Cómo suena esto?',
      fr: 'Bonjour! Ceci est un test de voix française. Comment cela sonne-t-il?',
      de: 'Hallo! Dies ist ein deutscher Sprachtest. Wie klingt das?',
      it: 'Ciao! Questo è un test vocale italiano. Come suona?',
      pt: 'Olá! Este é um teste de voz portuguesa. Como isso soa?'
    }

    const langCode = language ? language.split('-')[0].split('_')[0] : 'en'
    const testText = testTexts[langCode] || `Testing voice: ${name}. This is a voice quality test.`

    try {
      // ✅ FIXED APPROACH: Use both 'voice' and 'language' for maximum compatibility
      this.speech.startSpeaking({
        text: testText,
        voice: name,      // Para API moderna
        language: name,   // Para API legacy
        rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
      })
    } catch (error) {
      console.error('❌ Error testing voice:', error)
    }
  }

  testVoice(voiceName, text) {
    console.log(`🎤 Testing legacy voice: ${voiceName}`)

    try {
      this.speech.startSpeaking({
        text: text,
        voice: voiceName,
        language: voiceName,  // Legacy fallback
        rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
      })
    } catch (error) {
      console.error('❌ Error testing legacy voice:', error)
    }
  }

  testAllVoices() {
    console.log('🎵 Testing all voices sequentially...')

    if (this.voices.length === 0) {
      console.log('No voices available to test')
      return
    }

    let currentIndex = 0
    const totalVoices = this.voices.length

    const testNext = () => {
      if (currentIndex >= totalVoices) {
        console.log('✅ All voices tested!')
        this.updateStatus('All voices tested!', '#27ae60')
        return
      }

      const voice = this.voices[currentIndex]
      const name = voice.name || voice.language || voice.locale || voice || 'Unknown'

      console.log(`Testing voice ${currentIndex + 1}/${totalVoices}: ${name}`)
      this.updateStatus(`Testing ${currentIndex + 1}/${totalVoices}: ${name}`, '#f39c12')

      try {
        this.speech.startSpeaking({
          text: `Voice number ${currentIndex + 1}. This is ${name}.`,
          voice: name,
          language: name,
          rate: this.speech.FAST_SPEECH_RATE || 1.5
        })
      } catch (error) {
        console.error(`❌ Error testing voice ${name}:`, error)
        // Continue to next voice
        currentIndex++
        setTimeout(testNext, 1000)
      }

      currentIndex++
    }

    // Setup event listener for sequential testing
    const completedHandler = () => {
      setTimeout(testNext, 500) // Small delay between voices
    }

    this.speech.addEventListener('completed', completedHandler)

    // Start testing
    testNext()

    // Cleanup after all tests (timeout safety)
    setTimeout(() => {
      this.speech.removeEventListener('completed', completedHandler)
      this.updateStatus('Voice testing completed', '#27ae60')
    }, totalVoices * 8000) // 8 seconds max per voice
  }

  analyzeVoices() {
    console.log('📊 Analyzing voice characteristics...')

    if (this.voices.length === 0) {
      console.log('No voice data available for analysis')
      const dialog = Ti.UI.createAlertDialog({
        title: 'No Voices',
        message: 'No voices available for analysis. Try reloading voices first.',
        buttonNames: ['OK']
      })
      dialog.show()
      return
    }

    const analysis = this.performVoiceAnalysis(this.voices)
    this.displayAnalysis(analysis)
  }

  performVoiceAnalysis(voices) {
    const analysis = {
      total: voices.length,
      byLanguage: {},
      byQuality: {},
      networkVoices: 0,
      localVoices: 0,
      uniqueLanguages: new Set(),
      hasModernFeatures: false
    }

    voices.forEach(voice => {
      // Detect if this is a modern voice object or legacy string
      const isModernVoice = typeof voice === 'object' && voice.name

      if (isModernVoice) {
        analysis.hasModernFeatures = true

        // Language analysis
        const language = voice.language || voice.locale || 'unknown'
        const langCode = language.split('-')[0].split('_')[0]

        analysis.byLanguage[langCode] = (analysis.byLanguage[langCode] || 0) + 1
        analysis.uniqueLanguages.add(langCode)

        // Quality analysis
        const quality = voice.quality || 0
        let qualityTier = 'Unknown'
        if (quality > 400) { qualityTier = 'Premium' }
        else if (quality > 300) { qualityTier = 'Enhanced' }
        else if (quality > 200) { qualityTier = 'Standard' }
        else if (quality > 0) { qualityTier = 'Basic' }

        analysis.byQuality[qualityTier] = (analysis.byQuality[qualityTier] || 0) + 1

        // Network vs Local
        if (voice.isNetworkConnectionRequired) {
          analysis.networkVoices++
        } else {
          analysis.localVoices++
        }
      } else {
        // Legacy voice (string)
        const voiceStr = voice.toString()
        let langCode = 'unknown'

        // Try to extract language from voice string
        if (voiceStr.includes('en') || voiceStr.toLowerCase().includes('english')) { langCode = 'en' }
        else if (voiceStr.includes('es') || voiceStr.toLowerCase().includes('spanish')) { langCode = 'es' }
        else if (voiceStr.includes('fr') || voiceStr.toLowerCase().includes('french')) { langCode = 'fr' }
        else if (voiceStr.includes('de') || voiceStr.toLowerCase().includes('german')) { langCode = 'de' }

        analysis.byLanguage[langCode] = (analysis.byLanguage[langCode] || 0) + 1
        analysis.uniqueLanguages.add(langCode)
        analysis.byQuality['Legacy'] = (analysis.byQuality['Legacy'] || 0) + 1
        analysis.localVoices++ // Assume legacy voices are local
      }
    })

    return analysis
  }

  displayAnalysis(analysis) {
    const analysisText = `
📊 VOICE ANALYSIS REPORT

🎵 Total Voices: ${analysis.total}
🌍 Languages: ${analysis.uniqueLanguages.size} (${Array.from(analysis.uniqueLanguages).join(', ')})
🔧 API Type: ${analysis.hasModernFeatures ? 'Modern' : 'Legacy'}

📱 Local Voices: ${analysis.localVoices}
🌐 Network Voices: ${analysis.networkVoices}

🏆 QUALITY DISTRIBUTION:
${Object.entries(analysis.byQuality).map(([quality, count]) =>
      `   ${quality}: ${count} voices`).join('\n')}

🌍 LANGUAGE DISTRIBUTION:
${Object.entries(analysis.byLanguage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([lang, count]) => `   ${lang}: ${count} voices`).join('\n')}

Platform: ${Ti.Platform.osname}
    `.trim()

    console.log(analysisText)

    // Show in dialog
    const dialog = Ti.UI.createAlertDialog({
      title: 'Voice Analysis',
      message: analysisText,
      buttonNames: ['OK']
    })
    dialog.show()
  }
}

// ✅ AUTOMATIC INITIALIZATION
console.log('🚀 Initializing Voice Explorer Fixed...')
const explorerFixed = new VoiceExplorerFixed()

module.exports = VoiceExplorerFixed
