/**
 * 🎙️ Voice Parameter Examples - FIXED version for Android
 * Fixes: TTS initialization timing + robust handling of voice examples
 *
 * ✅ ISSUES SOLVED:
 * - Examples failed on Android when TTS was not initialized
 * - getModernVoices() returned an empty array
 * - Missing fallbacks for legacy devices
 * - Improved example sequencing
 */

const utterance = require('bencoding.utterance')

class VoiceExamplesFixed {
  constructor() {
    console.log('🎙️ Starting Voice Parameter Examples (Fixed Version)...')
    this.speech = utterance.createSpeech()
    this.isAndroid = Ti.Platform.osname === 'android'
    this.isIOS = Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad'

    // Initialization state
    this.isInitialized = false
    this.voices = []
    this.initRetryCount = 0
    this.maxInitRetries = 10
    this.currentExample = 0
    this.totalExamples = 5

    if (!this.speech.isSupported()) {
      console.error('❌ TTS not supported on this device')
      return
    }

    this.initializeTTS()
  }

  // ✅ ROBUST TTS INITIALIZATION
  initializeTTS() {
    console.log('🔄 Initializing TTS for Voice Examples...')

    if (this.isAndroid) {
      this.initializeAndroidTTS()
    } else {
      this.initializeIOSTTS()
    }
  }

  initializeAndroidTTS() {
    console.log('🤖 Android TTS initialization for examples...')

    // Approach 1: use isTTSReady() when available
    if (typeof this.speech.isTTSReady === 'function') {
      this.waitForAndroidTTSReady()
    } else {
      // Approach 2: use a timeout with a test event
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
          console.log('✅ Android TTS is ready for examples!')
          this.onTTSInitialized()
        } else if (this.initRetryCount < this.maxInitRetries) {
          console.log(`⏳ Waiting for TTS... (${this.initRetryCount}/${this.maxInitRetries})`)
          setTimeout(checkReady, 500)
        } else {
          console.warn('⚠️ TTS ready timeout, proceeding with examples anyway...')
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
    console.log('🕐 Using Android timeout method for examples...')

    try {
      this.speech.addEventListener('completed', this.handleInitTestCompleted.bind(this))
      this.speech.addEventListener('started', this.handleInitTestStarted.bind(this))

      this.speech.startSpeaking({
        text: '.',  // Minimal text to wake up TTS
        rate: this.speech.MAX_SPEECH_RATE || 3.0
      })
    } catch (error) {
      console.error('❌ Error with test speech:', error)
      setTimeout(() => {
        this.onTTSInitialized()
      }, 3000)
    }
  }

  handleInitTestStarted(e) {
    console.log('🎤 Init test started - TTS working for examples')
    this.speech.removeEventListener('started', this.handleInitTestStarted.bind(this))
  }

  handleInitTestCompleted(e) {
    console.log('✅ Init test completed - TTS ready for examples')
    this.speech.removeEventListener('completed', this.handleInitTestCompleted.bind(this))
    this.onTTSInitialized()
  }

  initializeIOSTTS() {
    console.log('🍎 iOS TTS initialization for examples...')
    setTimeout(() => {
      this.onTTSInitialized()
    }, 500)
  }

  // ✅ CALLBACK WHEN TTS IS READY
  onTTSInitialized() {
    if (this.isInitialized) {
      console.log('ℹ️ TTS already initialized for examples, skipping...')
      return
    }

    this.isInitialized = true
    console.log('🎉 TTS initialized! Loading voices for examples...')

    // Load voices before starting the examples
    this.loadVoicesForExamples()
  }

  // ✅ VOICE LOADING SPECIFIC TO EXAMPLES
  loadVoicesForExamples() {
    console.log('📋 Loading voices for examples...')

    try {
      this.voices = this.speech.getModernVoices() || []
      console.log(`🎵 Modern API: Found ${this.voices.length} voices for examples`)

      if (this.voices.length === 0) {
        console.warn('⚠️ Modern API returned empty, trying legacy for examples...')
        this.loadLegacyVoicesForExamples()
      } else {
        this.startExamples()
      }
    } catch (error) {
      console.warn('⚠️ Modern voice API failed for examples:', error)
      this.loadLegacyVoicesForExamples()
    }
  }

  loadLegacyVoicesForExamples() {
    try {
      this.voices = this.speech.getVoices() || []
      console.log(`🎵 Legacy API: Found ${this.voices.length} voices for examples`)
      this.startExamples()
    } catch (error) {
      console.error('❌ No voice APIs available for examples:', error)
      this.voices = []
      this.startExamples() // Continue with the basic examples
    }
  }

  // ✅ START EXAMPLE SEQUENCE
  startExamples() {
    console.log(`🚀 Starting Voice Examples with ${this.voices.length} voices available`)
    console.log('📊 Platform:', Ti.Platform.osname)

    // Give TTS a moment to fully stabilize
    setTimeout(() => {
      this.example1_BasicVoiceSelection()
    }, 1000)
  }

  // ==========================================================================
  // 📝 EXAMPLE 1: Basic Voice Selection by Language Code
  // ==========================================================================
  example1_BasicVoiceSelection() {
    console.log('\n📝 EXAMPLE 1: Basic Voice Selection by Language Code')
    this.currentExample = 1

    const examples = [
      { text: 'Hello, this is English', voice: 'en-US' },
      { text: 'Hola, esto es español', voice: 'es-ES' },
      { text: 'Bonjour, ceci est français', voice: 'fr-FR' },
      { text: 'Hallo, das ist Deutsch', voice: 'de-DE' }
    ]

    let currentIndex = 0

    const speakNext = () => {
      if (currentIndex >= examples.length) {
        console.log('✅ Example 1 completed')
        this.cleanupHandlerAndContinue(() => this.example2_SpecificVoiceNames(), 2000)
        return
      }

      const example = examples[currentIndex]
      console.log(`🎤 [${this.currentExample}/${this.totalExamples}] Speaking with voice: ${example.voice}`)

      try {
        // ✅ USE THE 'voice' PARAMETER WITH LANGUAGE CODE + FALLBACKS
        this.speech.startSpeaking({
          text: example.text,
          voice: example.voice,      // Primary parameter
          language: example.voice,   // Legacy fallback
          rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
        })
      } catch (error) {
        console.error(`❌ Error with voice ${example.voice}:`, error)
        // Continue with the next example
        currentIndex++
        setTimeout(speakNext, 1000)
        return
      }

      currentIndex++
    }

    // Setup sequential playback with automatic cleanup
    this.currentHandler = () => {
      setTimeout(speakNext, 500) // Small delay between examples
    }

    this.speech.addEventListener('completed', this.currentHandler)

    // Start first example
    speakNext()

    // Safety timeout
    setTimeout(() => {
      this.cleanupHandlerAndContinue(() => this.example2_SpecificVoiceNames(), 0)
    }, examples.length * 6000)
  }

  // ==========================================================================
  // 📝 EXAMPLE 2: Using Specific Voice Names
  // ==========================================================================
  example2_SpecificVoiceNames() {
    console.log('\n📝 EXAMPLE 2: Using Specific Voice Names')
    this.currentExample = 2

    if (this.voices.length === 0) {
      console.warn('⚠️ No voices available for specific name testing, skipping to next example')
      setTimeout(() => this.example3_VoiceQualityComparison(), 1000)
      return
    }

    try {
      // Find different types of voices
      const englishVoices = this.voices.filter(v => {
        const language = v.language || v.locale || ''
        return language.toLowerCase().includes('en')
      })

      const spanishVoices = this.voices.filter(v => {
        const language = v.language || v.locale || ''
        return language.toLowerCase().includes('es')
      })

      console.log(`🔍 Found ${englishVoices.length} English voices, ${spanishVoices.length} Spanish voices`)

      if (englishVoices.length > 0) {
        const selectedVoice = englishVoices[0]
        const voiceName = selectedVoice.name || selectedVoice.language || selectedVoice.locale || 'en'

        console.log(`🎤 [${this.currentExample}/${this.totalExamples}] Testing specific voice: ${voiceName}`)

        // ✅ USE THE 'voice' PARAMETER WITH A SPECIFIC VOICE NAME
        this.speech.startSpeaking({
          text: `Hello! I am ${voiceName}, a specific voice with quality ${selectedVoice.quality || 'unknown'}`,
          voice: voiceName,        // Specific voice name
          language: voiceName,     // Fallback
          rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
        })

        // Test Spanish voice after English
        setTimeout(() => {
          if (spanishVoices.length > 0) {
            const spanishVoice = spanishVoices[0]
            const spanishVoiceName = spanishVoice.name || spanishVoice.language || spanishVoice.locale || 'es'

            console.log(`🎤 Testing Spanish voice: ${spanishVoiceName}`)

            this.speech.startSpeaking({
              text: `¡Hola! Soy ${spanishVoiceName}, una voz específica española`,
              voice: spanishVoiceName,
              language: spanishVoiceName,
              rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
            })
          }

          // Continue to next example
          setTimeout(() => this.example3_VoiceQualityComparison(), 3000)
        }, 4000)
      } else {
        console.warn('⚠️ No English voices found, skipping to next example')
        setTimeout(() => this.example3_VoiceQualityComparison(), 1000)
      }

    } catch (error) {
      console.warn('⚠️ Error in specific voice names example:', error)
      setTimeout(() => this.example3_VoiceQualityComparison(), 2000)
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 3: Voice Quality Comparison
  // ==========================================================================
  example3_VoiceQualityComparison() {
    console.log('\n📝 EXAMPLE 3: Voice Quality Comparison')
    this.currentExample = 3

    if (this.voices.length === 0) {
      console.warn('⚠️ No voices available for quality comparison, skipping')
      setTimeout(() => this.example4_NetworkVsLocalVoices(), 1000)
      return
    }

    try {
      const englishVoices = this.voices.filter(v => {
        const language = v.language || v.locale || ''
        return language.toLowerCase().includes('en')
      })

      if (englishVoices.length < 2) {
        console.warn('⚠️ Need at least 2 English voices for quality comparison')
        setTimeout(() => this.example4_NetworkVsLocalVoices(), 1000)
        return
      }

      // Sort by quality (highest first)
      const sortedVoices = englishVoices.sort((a, b) =>
        (b.quality || 0) - (a.quality || 0)
      )

      const highQualityVoice = sortedVoices[0]
      const lowerQualityVoice = sortedVoices[sortedVoices.length - 1]

      const highVoiceName = highQualityVoice.name || highQualityVoice.language || 'en'
      const lowVoiceName = lowerQualityVoice.name || lowerQualityVoice.language || 'en'

      console.log(`🏆 [${this.currentExample}/${this.totalExamples}] High quality voice: ${highVoiceName} (${highQualityVoice.quality || 'unknown'})`)
      console.log(`📱 Lower quality voice: ${lowVoiceName} (${lowerQualityVoice.quality || 'unknown'})`)

      // Test high quality voice
      this.speech.startSpeaking({
        text: 'This is a high quality voice with enhanced clarity and naturalness',
        voice: highVoiceName,
        language: highVoiceName,
        rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
      })

      // Test lower quality voice for comparison
      setTimeout(() => {
        this.speech.startSpeaking({
          text: 'This is a lower quality voice for comparison purposes',
          voice: lowVoiceName,
          language: lowVoiceName,
          rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
        })

        // Continue to next example
        setTimeout(() => this.example4_NetworkVsLocalVoices(), 3000)
      }, 5000)

    } catch (error) {
      console.warn('⚠️ Voice quality comparison failed:', error)
      setTimeout(() => this.example4_NetworkVsLocalVoices(), 2000)
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 4: Network vs Local Voices
  // ==========================================================================
  example4_NetworkVsLocalVoices() {
    console.log('\n📝 EXAMPLE 4: Network vs Local Voices')
    this.currentExample = 4

    if (this.voices.length === 0) {
      console.warn('⚠️ No voices available for network/local comparison, skipping')
      setTimeout(() => this.example5_CrossPlatformVoices(), 1000)
      return
    }

    try {
      const localVoices = this.voices.filter(v => !v.isNetworkConnectionRequired)
      const networkVoices = this.voices.filter(v => v.isNetworkConnectionRequired)

      console.log(`📱 [${this.currentExample}/${this.totalExamples}] Local voices: ${localVoices.length}`)
      console.log(`🌐 Network voices: ${networkVoices.length}`)

      if (localVoices.length > 0) {
        const localVoice = localVoices[0]
        const localVoiceName = localVoice.name || localVoice.language || 'en'

        console.log(`📱 Testing local voice: ${localVoiceName}`)

        this.speech.startSpeaking({
          text: 'This is a local voice that works offline',
          voice: localVoiceName,
          language: localVoiceName,
          rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
        })

        if (networkVoices.length > 0) {
          setTimeout(() => {
            const networkVoice = networkVoices[0]
            const networkVoiceName = networkVoice.name || networkVoice.language || 'en'

            console.log(`🌐 Testing network voice: ${networkVoiceName}`)

            this.speech.startSpeaking({
              text: 'This is a network voice that may require internet connection',
              voice: networkVoiceName,
              language: networkVoiceName,
              rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
            })

            setTimeout(() => this.example5_CrossPlatformVoices(), 3000)
          }, 4000)
        } else {
          setTimeout(() => this.example5_CrossPlatformVoices(), 4000)
        }
      } else {
        console.warn('⚠️ No local voices found')
        setTimeout(() => this.example5_CrossPlatformVoices(), 1000)
      }

    } catch (error) {
      console.warn('⚠️ Network vs local comparison failed:', error)
      setTimeout(() => this.example5_CrossPlatformVoices(), 2000)
    }
  }

  // ==========================================================================
  // 📝 EXAMPLE 5: Cross-Platform Voice Selection
  // ==========================================================================
  example5_CrossPlatformVoices() {
    console.log('\n📝 EXAMPLE 5: Cross-Platform Voice Selection')
    this.currentExample = 5

    // ✅ EJEMPLOS CROSS-PLATFORM MEJORADOS
    const crossPlatformVoices = [
      {
        text: 'Cross-platform English voice',
        voice: 'en',  // Simple language code - works everywhere
        desc: 'Simple language code (en)'
      },
      {
        text: 'Cross-platform Spanish voice',
        voice: 'es',  // Simple language code - works everywhere
        desc: 'Simple language code (es)'
      },
      {
        text: 'Platform-specific English voice',
        voice: this.isAndroid ? 'en_US' : 'en-US',  // Platform-specific format
        desc: `Platform-specific format (${this.isAndroid ? 'en_US' : 'en-US'})`
      }
    ]

    let currentIndex = 0

    const speakNext = () => {
      if (currentIndex >= crossPlatformVoices.length) {
        console.log('✅ All voice examples completed!')
        this.displaySummary()
        return
      }

      const example = crossPlatformVoices[currentIndex]
      console.log(`🎤 [${this.currentExample}/${this.totalExamples}] ${example.desc}: ${example.voice}`)

      try {
        this.speech.startSpeaking({
          text: example.text,
          voice: example.voice,      // Different voice formats
          language: example.voice,   // Fallback
          rate: this.speech.DEFAULT_SPEECH_RATE || 1.0
        })
      } catch (error) {
        console.error(`❌ Error with cross-platform voice ${example.voice}:`, error)
        currentIndex++
        setTimeout(speakNext, 1000)
        return
      }

      currentIndex++
    }

    // Setup sequential playback
    this.currentHandler = () => {
      setTimeout(speakNext, 1000) // Delay between examples
    }

    this.speech.addEventListener('completed', this.currentHandler)

    // Start examples
    speakNext()

    // Safety cleanup
    setTimeout(() => {
      this.speech.removeEventListener('completed', this.currentHandler)
      this.displaySummary()
    }, crossPlatformVoices.length * 6000)
  }

  // ✅ METHOD TO CLEAN UP HANDLERS AND CONTINUE
  cleanupHandlerAndContinue(nextFunction, delay = 0) {
    if (this.currentHandler) {
      this.speech.removeEventListener('completed', this.currentHandler)
      this.currentHandler = null
    }

    if (delay > 0) {
      setTimeout(nextFunction, delay)
    } else {
      nextFunction()
    }
  }

  displaySummary() {
    // Clear any pending handler
    if (this.currentHandler) {
      this.speech.removeEventListener('completed', this.currentHandler)
    }

    const summary = `
🎙️ VOICE PARAMETER EXAMPLES COMPLETED!

📋 What we demonstrated:

1️⃣ Basic voice selection by language code (en-US, es-ES, etc.)
2️⃣ Specific voice names for fine control
3️⃣ Voice quality comparison (high vs low quality)
4️⃣ Network vs local voices (online vs offline)
5️⃣ Cross-platform voice compatibility

🔑 KEY TAKEAWAYS:
• Use 'voice' parameter to select specific voices
• Language codes work on both platforms (en, es, fr, etc.)
• Specific voice names give you precise control
• Voice quality affects naturalness and clarity
• Local voices work offline, network voices may need internet

🎯 PLATFORM INFO:
• Platform: ${Ti.Platform.osname}
• TTS Initialized: ${this.isInitialized}
• Voices Available: ${this.voices.length}
• Init Retries: ${this.initRetryCount}

🎯 TRY IT YOURSELF:
- Run listAllVoicesFixed() to see all available voices
- Test different voice names and language codes
- Compare voice quality and characteristics
    `

    console.log(summary)

    // Show summary dialog if UI is available
    try {
      const dialog = Ti.UI.createAlertDialog({
        title: 'Voice Examples Complete!',
        message: `All ${this.totalExamples} voice examples completed successfully! Check the console for detailed information.`,
        buttonNames: ['OK']
      })
      dialog.show()
    } catch (e) {
      // No UI available, console output only
      console.log('✅ Voice Examples completed successfully!')
    }
  }
}

// =============================================================================
// 🚀 IMPROVED TESTING FUNCTIONS
// =============================================================================

// ✅ Quick function to test any voice with proper initialization
function testVoiceFixed(voiceName, text = 'This is a voice test') {
  const speech = utterance.createSpeech()
  console.log(`🎤 Testing voice: ${voiceName}`)

  // Simple test with fallbacks
  try {
    speech.startSpeaking({
      text: text,
      voice: voiceName,
      language: voiceName,  // Fallback
      rate: speech.DEFAULT_SPEECH_RATE || 1.0
    })
  } catch (error) {
    console.error(`❌ Error testing voice ${voiceName}:`, error)
  }
}

// ✅ Quick function to list all available voices with proper initialization
function listAllVoicesFixed() {
  const speech = utterance.createSpeech()

  // Wait for TTS initialization if needed
  const tryGetVoices = () => {
    try {
      const voices = speech.getModernVoices() || []

      if (voices.length > 0) {
        console.log(`\n📋 Modern Voices Available (${voices.length} total):`)

        voices.forEach((voice, index) => {
          const name = voice.name || 'Unknown'
          const language = voice.language || voice.locale || 'Unknown'
          const quality = voice.quality || 'Unknown'
          const network = voice.isNetworkConnectionRequired ? '🌐' : '📱'

          console.log(`${index + 1}. ${network} ${name} (${language}) - Quality: ${quality}`)
        })

        return voices
      } else {
        console.warn('⚠️ Modern API returned empty, trying legacy...')
        return tryLegacyVoices()
      }
    } catch (error) {
      console.warn('⚠️ Modern voice API failed, trying legacy...')
      return tryLegacyVoices()
    }
  }

  const tryLegacyVoices = () => {
    try {
      const voices = speech.getVoices() || []
      console.log(`📋 Legacy Voices (${voices.length} total):`)

      voices.forEach((voice, index) => {
        const voiceName = typeof voice === 'string' ? voice : (voice.name || voice.toString())
        console.log(`${index + 1}. 📱 ${voiceName}`)
      })

      return voices
    } catch (e) {
      console.error('❌ No voice APIs available')
      return []
    }
  }

  // For Android, might need to wait a bit
  if (Ti.Platform.osname === 'android') {
    console.log('🤖 Android detected, waiting for TTS initialization...')
    setTimeout(() => {
      tryGetVoices()
    }, 2000)
  } else {
    return tryGetVoices()
  }
}

// ✅ Quick voice quality analysis
function analyzeVoicesFixed() {
  const speech = utterance.createSpeech()

  setTimeout(() => {
    try {
      const voices = speech.getModernVoices() || []

      if (voices.length === 0) {
        console.log('⚠️ No modern voices available for analysis')
        return
      }

      console.log('\n📊 VOICE ANALYSIS:')

      // Group by language
      const byLanguage = {}
      const byQuality = {}
      let networkCount = 0
      let localCount = 0

      voices.forEach(voice => {
        const lang = (voice.language || 'unknown').split('-')[0].split('_')[0]
        byLanguage[lang] = (byLanguage[lang] || 0) + 1

        const quality = voice.quality || 0
        const tier = quality > 400 ? 'Premium' : quality > 300 ? 'Enhanced' : quality > 200 ? 'Standard' : 'Basic'
        byQuality[tier] = (byQuality[tier] || 0) + 1

        if (voice.isNetworkConnectionRequired) networkCount++
        else localCount++
      })

      console.log(`🎵 Total: ${voices.length} voices`)
      console.log(`📱 Local: ${localCount}, 🌐 Network: ${networkCount}`)
      console.log('🌍 By Language:', byLanguage)
      console.log('🏆 By Quality:', byQuality)

    } catch (error) {
      console.error('❌ Voice analysis failed:', error)
    }
  }, Ti.Platform.osname === 'android' ? 2000 : 500)
}

// =============================================================================
// 🎯 USAGE EXAMPLES
// =============================================================================

console.log('🎙️ Voice Parameter Examples (Fixed Version) Available!')
console.log('')
console.log('📋 Quick Commands:')
console.log('- listAllVoicesFixed() - See all available voices (with TTS timing fix)')
console.log('- testVoiceFixed("en-US", "Hello world") - Test specific voice')
console.log('- analyzeVoicesFixed() - Analyze voice characteristics')
console.log('- new VoiceExamplesFixed() - Run all examples (with Android fixes)')
console.log('')

// Export for external use
module.exports = {
  VoiceExamplesFixed,
  testVoiceFixed,
  listAllVoicesFixed,
  analyzeVoicesFixed
}

// ✅ Start examples automatically with proper timing
console.log('🚀 Auto-starting Voice Examples in 2 seconds...')
setTimeout(() => {
  new VoiceExamplesFixed()
}, 2000)
