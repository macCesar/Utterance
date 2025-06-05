/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.TextToSpeech.OnInitListener;
import android.speech.tts.UtteranceProgressListener;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import org.appcelerator.kroll.KrollDict;
import org.appcelerator.kroll.KrollPropertyChange;
import org.appcelerator.kroll.KrollProxy;
import org.appcelerator.kroll.KrollProxyListener;
import org.appcelerator.kroll.annotations.Kroll;
import org.appcelerator.kroll.common.Log;
import org.appcelerator.titanium.TiApplication;
import org.appcelerator.titanium.TiLifecycle;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class SpeechProxy extends KrollProxy implements TiLifecycle.OnLifecycleEvent, KrollProxyListener, OnInitListener {
    //Add properties for iOS compatability - FIXED VALUES v3.0+
    @Kroll.constant
    public static final float DEFAULT_SPEECH_RATE = 1.0f;
    @Kroll.constant
    public static final float MIN_SPEECH_RATE = 0.1f;
    @Kroll.constant
    public static final float MAX_SPEECH_RATE = 3.0f;
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_IMMEDIATE = 0;
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_WORD = 0;

    // Cross-Platform Speech Rate Constants
    @Kroll.constant
    public static final float VERY_SLOW_SPEECH_RATE = 0.4f;
    @Kroll.constant
    public static final float SLOW_SPEECH_RATE = 0.6f;
    @Kroll.constant
    public static final float FAST_SPEECH_RATE = 1.3f;
    @Kroll.constant
    public static final float VERY_FAST_SPEECH_RATE = 1.6f;

    // Mathematical Equivalence Constants
    @Kroll.constant
    public static final float MATH_VERY_SLOW_SPEECH_RATE = 0.475f;
    @Kroll.constant
    public static final float MATH_SLOW_SPEECH_RATE = 0.825f;
    @Kroll.constant
    public static final float MATH_FAST_SPEECH_RATE = 1.875f;
    @Kroll.constant
    public static final float MATH_VERY_FAST_SPEECH_RATE = 2.275f;

    private final String _logName = UtteranceModule.MODULE_FULL_NAME;
    private TextToSpeech _tts = null;
    private String _text = "";
    private String _voice = "";
    private final CountDownLatch _initLatch = new CountDownLatch(1);
    private final AtomicBoolean _initSuccess = new AtomicBoolean(false);
    private final AtomicBoolean _isSpeakingProperty = new AtomicBoolean(false);
    private final Handler _mainHandler = new Handler(Looper.getMainLooper());

    // OPTIMIZACIÓN: Estados mejorados para mejor control
    private final AtomicBoolean _isReady = new AtomicBoolean(false);
    private final AtomicBoolean _isInitializing = new AtomicBoolean(false);
    private final AtomicBoolean _isStopping = new AtomicBoolean(false);
    private final AtomicBoolean _isCanceling = new AtomicBoolean(false);

    // OPTIMIZACIÓN: Contador de utterances para tracking único
    private final AtomicInteger _utteranceCounter = new AtomicInteger(0);
    private volatile String _currentUtteranceId = null;

    // OPTIMIZACIÓN: Cache de configuración actual
    private volatile float _currentRate = DEFAULT_SPEECH_RATE;
    private volatile float _currentPitch = 1.0f;
    private volatile Locale _currentLocale = null;

    // OPTIMIZACIÓN: Límite de tiempo para operaciones
    private static final long INIT_TIMEOUT_MS = 2000;
    private static final long STOP_TIMEOUT_MS = 500;

    public SpeechProxy() {
        super();
        // Inicializar inmediatamente pero de forma segura
        _mainHandler.post(new Runnable() {
            @Override
            public void run() {
                initializeTTSOptimized();
            }
        });
    }

    /**
     * OPTIMIZACIÓN: Inicialización mejorada con mejor manejo de estados
     */
    private void initializeTTSOptimized() {
        if (_tts == null && _isInitializing.compareAndSet(false, true)) {
            Log.d(_logName, "Starting optimized TTS initialization");
            try {
                _tts = new TextToSpeech(TiApplication.getInstance().getApplicationContext(), this);
            } catch (Exception e) {
                Log.e(_logName, "Failed to initialize TTS: " + e.getMessage());
                _isInitializing.set(false);
                _initLatch.countDown();
            }
        }
    }

    /**
     * OPTIMIZACIÓN: Espera inteligente para inicialización
     */
    private boolean waitForInit(long timeoutMs) {
        try {
            return _initLatch.await(timeoutMs, TimeUnit.MILLISECONDS) && _initSuccess.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * OPTIMIZACIÓN: Verificación rápida de estado
     */
    private boolean isReadyForSpeech() {
        return _tts != null && _isReady.get() && !_isStopping.get() && !_isCanceling.get();
    }

    /**
     * OPTIMIZACIÓN: Conversión de locale mejorada con cache
     */
    public static Locale toLocale(String str) {
      if (str == null || str.isEmpty()) {
          return Locale.getDefault();
      }

      // Cache simple para locales comunes
      switch (str) {
          case "en_US":
          case "en-US":
              return Locale.US;
          case "en_GB":
          case "en-GB":
              return Locale.UK;
          case "es_ES":
          case "es-ES":
              return new Locale("es", "ES");
          case "es_MX":
          case "es-MX":
              return new Locale("es", "MX");
      }

      // Manejo de formato moderno de Android (API 21+)
      if (android.os.Build.VERSION.SDK_INT >= 21 && str.contains("-x-")) {
          String[] parts = str.split("-x-");
          if (parts.length > 0) {
              String langPart = parts[0];
              String[] langComponents = langPart.split("-");
              if (langComponents.length >= 2) {
                  return new Locale(langComponents[0], langComponents[1].toUpperCase());
              } else if (langComponents.length == 1) {
                  return new Locale(langComponents[0]);
              }
          }
      }

      // Normalización rápida de formato iOS a Android
      if (str.contains("-")) {
          String[] parts = str.split("-");
          if (parts.length >= 2) {
              return new Locale(parts[0], parts[1].toUpperCase());
          } else if (parts.length == 1) {
              return new Locale(parts[0]);
          }
      }

      // Formato tradicional con underscore
      if (str.contains("_")) {
          String[] parts = str.split("_");
          if (parts.length >= 2) {
              return new Locale(parts[0], parts[1]);
          } else if (parts.length == 1) {
              return new Locale(parts[0]);
          }
      }

      // Intento de parseo simple
      if (str.length() == 2) {
          return new Locale(str);
      }

      return Locale.getDefault();
  }

  /**
   * OPTIMIZACIÓN: UtteranceProgressListener mejorado con mejor manejo de estados
   */
  private UtteranceProgressListener createOptimizedUtteranceProgressListener() {
      return new UtteranceProgressListener() {
          @Override
          public void onStart(String utteranceId) {
              Log.d(_logName, "TTS Engine: utterance started - " + utteranceId);
              _isSpeakingProperty.set(true);
              _currentUtteranceId = utteranceId;

              // Reset de flags de control
              _isStopping.set(false);
              _isCanceling.set(false);

              fireEventAsync("started", true, "Speech started");
          }

          @Override
          public void onDone(String utteranceId) {
              Log.d(_logName, "TTS Engine: utterance completed - " + utteranceId);
              _isSpeakingProperty.set(false);

              // CLAVE: Solo disparar eventos si este utterance es el actual
              // Esto evita conflictos cuando se hace stop+start rápido
              if (utteranceId != null && utteranceId.equals(_currentUtteranceId)) {
                  // Determinar qué evento disparar basado en el estado
                  if (_isCanceling.get()) {
                      _isCanceling.set(false);
                      fireEventAsync("canceled", true, "Speech canceled");
                  } else if (_isStopping.get()) {
                      _isStopping.set(false);
                      fireEventAsync("stopped", true, "Speech stopped");
                  } else {
                      fireEventAsync("completed", true, "Speech completed");
                  }
                  _currentUtteranceId = null;
              } else {
                  Log.d(_logName, "Ignoring onDone for old utterance: " + utteranceId + " (current: " + _currentUtteranceId + ")");
              }
          }

          @Override
          @SuppressWarnings("deprecation")
          public void onError(String utteranceId) {
              onErrorInternal(utteranceId, -1);
          }

          @Override
          public void onError(String utteranceId, int errorCode) {
              onErrorInternal(utteranceId, errorCode);
          }

          private void onErrorInternal(String utteranceId, int errorCode) {
              Log.e(_logName, "TTS Engine: utterance error - " + utteranceId + " (code: " + errorCode + ")");
              _isSpeakingProperty.set(false);
              _currentUtteranceId = null;

              // Reset de flags
              _isStopping.set(false);
              _isCanceling.set(false);

              String errorMessage = getErrorMessage(errorCode);
              fireEventAsync("completed", false, errorMessage);
          }
      };
  }

  /**
   * OPTIMIZACIÓN: Mensajes de error descriptivos
   */
  private String getErrorMessage(int errorCode) {
      if (android.os.Build.VERSION.SDK_INT >= 21) {
          switch (errorCode) {
              case TextToSpeech.ERROR_SYNTHESIS:
                  return "Speech synthesis error";
              case TextToSpeech.ERROR_SERVICE:
                  return "TTS service error";
              case TextToSpeech.ERROR_OUTPUT:
                  return "Audio output error";
              case TextToSpeech.ERROR_NETWORK:
                  return "Network error";
              case TextToSpeech.ERROR_NETWORK_TIMEOUT:
                  return "Network timeout";
              case TextToSpeech.ERROR_INVALID_REQUEST:
                  return "Invalid request";
              case TextToSpeech.ERROR_NOT_INSTALLED_YET:
                  return "Voice data not installed";
              default:
                  return "Unknown error (code: " + errorCode + ")";
          }
      }
      return "Speech synthesis error";
  }

  /**
   * OPTIMIZACIÓN: Disparo de eventos asíncronos mejorado
   */
  private void fireEventAsync(final String eventName, final boolean success, final String message) {
      if (!hasListeners(eventName)) {
          return;
      }

      _mainHandler.post(new Runnable() {
          @Override
          public void run() {
              HashMap<String, Object> event = new HashMap<>();
              event.put("success", success);
              event.put("message", message);
              event.put("speaking", _isSpeakingProperty.get());
              event.put("text", _text);
              event.put("voice", _voice);
              event.put("rate", _currentRate);
              event.put("pitch", _currentPitch);
              fireEvent(eventName, event);
              Log.d(_logName, "Event fired: " + eventName + " - " + message);
          }
      });
  }

  @Override
  public void onInit(int status) {
      try {
          if (status == TextToSpeech.ERROR_NETWORK_TIMEOUT || 
              status == TextToSpeech.ERROR_NETWORK ||
              status == TextToSpeech.ERROR_NOT_INSTALLED_YET ||
              status == TextToSpeech.LANG_MISSING_DATA || 
              status == TextToSpeech.LANG_NOT_SUPPORTED) {

              String errorMsg = "TTS initialization failed: " + getInitErrorMessage(status);
              Log.e(_logName, errorMsg);
              _initSuccess.set(false);
              _isReady.set(false);
              _isInitializing.set(false);
              _initLatch.countDown();

              fireEventAsync("error", false, errorMsg);
              return;
          }

          if (status == TextToSpeech.SUCCESS) {
              _initSuccess.set(true);
              _isReady.set(true);
              _isInitializing.set(false);

              // Configurar listener optimizado
              _tts.setOnUtteranceProgressListener(createOptimizedUtteranceProgressListener());

              // Configurar voz predeterminada
              setupDefaultVoice();

              // OPTIMIZACIÓN: Pre-calentar el motor TTS
              warmUpTTS();

              _initLatch.countDown();
              Log.i(_logName, "TTS initialized successfully");

              fireEventAsync("initialized", true, "TTS ready");
          }
      } catch (Exception error) {
          handleInitError(error);
      }
  }

  /**
   * OPTIMIZACIÓN: Mensajes descriptivos para errores de inicialización
   */
  private String getInitErrorMessage(int status) {
      switch (status) {
          case TextToSpeech.ERROR_NETWORK_TIMEOUT:
              return "Network timeout during initialization";
          case TextToSpeech.ERROR_NETWORK:
              return "Network error during initialization";
          case TextToSpeech.ERROR_NOT_INSTALLED_YET:
              return "TTS voice data not installed";
          case TextToSpeech.LANG_MISSING_DATA:
              return "Language data missing";
          case TextToSpeech.LANG_NOT_SUPPORTED:
              return "Language not supported";
          default:
              return "Unknown initialization error";
      }
  }

  /**
   * OPTIMIZACIÓN: Configurar voz predeterminada
   */
  private void setupDefaultVoice() {
      if (android.os.Build.VERSION.SDK_INT >= 21) {
          android.speech.tts.Voice defaultVoice = _tts.getDefaultVoice();
          if (defaultVoice != null) {
              _voice = defaultVoice.getName();
              _currentLocale = defaultVoice.getLocale();
          }
      } else {
          // Para API < 21, usar Locale.getDefault() en lugar del método deprecated
          _currentLocale = Locale.getDefault();
          _voice = _currentLocale.toString();
      }
  }

  /**
   * OPTIMIZACIÓN: Pre-calentar el motor TTS para reducir latencia en el primer uso
   */
  private void warmUpTTS() {
      if (android.os.Build.VERSION.SDK_INT >= 21) {
          // Síntesis silenciosa para pre-calentar
          Bundle params = new Bundle();
          params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.0f);
          _tts.speak("", TextToSpeech.QUEUE_FLUSH, params, "warmup");
      }
  }

  /**
   * OPTIMIZACIÓN: Manejo de errores de inicialización
   */
  private void handleInitError(Exception error) {
      _initSuccess.set(false);
      _isReady.set(false);
      _isInitializing.set(false);
      _initLatch.countDown();

      String errorMsg = "TTS initialization exception: " + error.getMessage();
      Log.e(_logName, errorMsg, error);
      fireEventAsync("error", false, errorMsg);
  }

  @Kroll.getProperty
  @Kroll.method
  public Boolean isSpeaking() {
      if (_tts == null || !_isReady.get()) {
          return false;
      }

      // Actualizar estado y devolver
      boolean speaking = _tts.isSpeaking();
      _isSpeakingProperty.set(speaking);
      return speaking;
  }

  @Kroll.method
  public boolean isSupported() {
      return true;
  }

  @Kroll.method
  public boolean isLanguageAvailable(String language) {
      if (_tts == null || !_isReady.get()) {
          return false;
      }

      try {
          Locale locale = toLocale(language);
          int result = _tts.isLanguageAvailable(locale);
          return result >= TextToSpeech.LANG_AVAILABLE;
      } catch (Exception e) {
          Log.e(_logName, "Error checking language availability: " + e.getMessage());
          return false;
      }
  }

  /**
   * OPTIMIZACIÓN: Método principal de habla mejorado con mejor cancelación
   */
  @Kroll.method
  @SuppressWarnings({"rawtypes", "unchecked"})
  public void startSpeaking(HashMap hm) {
      final KrollDict args = new KrollDict(hm);

      if (!args.containsKeyAndNotNull("text")) {
          Log.e(_logName, "Text parameter is required");
          fireEventAsync("error", false, "Text parameter is required");
          return;
      }

      // CLAVE: Limpiar estados ANTES de cancelar habla previa
      _isStopping.set(false);
      _isCanceling.set(false);
      _currentUtteranceId = null;

      // OPTIMIZACIÓN: Cancelar cualquier habla previa inmediatamente
      if (_tts != null && _tts.isSpeaking()) {
          _tts.stop();
          _isSpeakingProperty.set(false);
      }

      // Verificar si TTS está listo
      if (!isReadyForSpeech()) {
          if (_tts == null) {
              initializeTTSOptimized();
          }

          // Esperar brevemente por inicialización
          _mainHandler.postDelayed(new Runnable() {
              @Override
              public void run() {
                  if (isReadyForSpeech()) {
                      performSpeak(args);
                  } else {
                      Log.e(_logName, "TTS not ready after wait");
                      fireEventAsync("error", false, "TTS not ready");
                  }
              }
          }, 100);
      } else {
          // TTS listo, hablar inmediatamente
          performSpeak(args);
      }
  }

  /**
     * OPTIMIZACIÓN: Método de habla optimizado
     */
    private void performSpeak(KrollDict args) {
      _text = args.getString("text");

      // Configurar voz/idioma
      if (args.containsKeyAndNotNull("voice") || args.containsKeyAndNotNull("language")) {
          String requestedVoice = args.containsKeyAndNotNull("voice") ? 
              args.getString("voice") : args.getString("language");

          // Normalizar formato iOS a Android
          requestedVoice = requestedVoice.replace("-", "_");

          if (!requestedVoice.equals("auto") && !requestedVoice.equals(_voice)) {
              setVoiceOptimized(requestedVoice);
          }
      }

      // Configurar velocidad
      if (args.containsKeyAndNotNull("rate")) {
          double rateDouble = args.getDouble("rate");
          float rate = (float) rateDouble;
          if (rate != _currentRate) {
              _currentRate = rate;
              _tts.setSpeechRate(rate);
          }
      }

      // Configurar tono
      if (args.containsKeyAndNotNull("pitch")) {
          double pitchDouble = args.getDouble("pitch");
          float pitch = (float) pitchDouble;
          if (pitch != _currentPitch) {
              _currentPitch = pitch;
              _tts.setPitch(pitch);
          }
      }

      // Generar ID único para este utterance
      String utteranceId = "utterance_" + _utteranceCounter.incrementAndGet();

      // OPTIMIZACIÓN: Usar API moderna con parámetros optimizados
      if (android.os.Build.VERSION.SDK_INT >= 21) {
          Bundle params = new Bundle();
          params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);

          // OPTIMIZACIÓN: Usar QUEUE_FLUSH para cancelar cualquier cola previa
          int result = _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

          if (result == TextToSpeech.ERROR) {
              Log.e(_logName, "Failed to queue speech");
              fireEventAsync("error", false, "Failed to queue speech");
          }
      } else {
          // Fallback para API < 21
          @SuppressWarnings("deprecation")
          HashMap<String, String> params = new HashMap<>();
          params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);

          @SuppressWarnings("deprecation")
          int result = _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, params);

          if (result == TextToSpeech.ERROR) {
              Log.e(_logName, "Failed to queue speech");
              fireEventAsync("error", false, "Failed to queue speech");
          }
      }
  }

  /**
   * OPTIMIZACIÓN: Configuración de voz mejorada
   */
  private void setVoiceOptimized(String requestedVoice) {
      _voice = requestedVoice;

      if (android.os.Build.VERSION.SDK_INT >= 21) {
          // Intentar establecer voz por nombre primero
          java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
          if (voices != null) {
              for (android.speech.tts.Voice voice : voices) {
                  if (voice.getName().equals(requestedVoice)) {
                      _tts.setVoice(voice);
                      _currentLocale = voice.getLocale();
                      return;
                  }
              }
          }
      }

      // Fallback: establecer por locale
      Locale locale = toLocale(requestedVoice);
      if (_tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
          _tts.setLanguage(locale);
          _currentLocale = locale;
      } else {
          Log.w(_logName, "Requested voice/language not available: " + requestedVoice);
      }
  }

  /**
   * OPTIMIZACIÓN: Pausa mejorada (no soportada nativamente en Android)
   */
  @Kroll.method
  @SuppressWarnings("rawtypes")
  public void pauseSpeaking(@Kroll.argument(optional = true) HashMap hm) {
      Log.d(_logName, "Pause not natively supported on Android");
      fireEventAsync("paused", false, "Pause not supported on Android");
  }

  /**
   * OPTIMIZACIÓN: Continuar mejorado (no soportado nativamente en Android)
   */
  @Kroll.method
  @SuppressWarnings("rawtypes")
  public void continueSpeaking(@Kroll.argument(optional = true) HashMap hm) {
      Log.d(_logName, "Continue not natively supported on Android");
      fireEventAsync("continued", false, "Continue not supported on Android");
  }

  @Kroll.method
  public void continueSpeaking() {
      continueSpeaking(null);
  }

  /**
   * OPTIMIZACIÓN: Stop mejorado con respuesta inmediata como la versión original
   */
  @Kroll.method
  @SuppressWarnings("rawtypes")
  public void stopSpeaking(@Kroll.argument(optional = true) HashMap hm) {
      if (_tts == null) {
          fireEventAsync("stopped", true, "Already stopped");
          return;
      }

      // CLAVE: Resetear flags ANTES de hacer stop para evitar confusión
      _isStopping.set(false);
      _isCanceling.set(false);

      if (_tts.isSpeaking()) {
          _tts.stop();
          _isSpeakingProperty.set(false);
          _currentUtteranceId = null;
          
          // CLAVE: Disparar evento inmediatamente como en la versión original
          fireEventAsync("stopped", true, "Speech stopped");
      } else {
          _isSpeakingProperty.set(false);
          fireEventAsync("stopped", true, "Already stopped");
      }
  }

  /**
   * OPTIMIZACIÓN: Cancel mejorado para respuesta inmediata como stopSpeaking
   */
  @Kroll.method
  public void cancelSpeaking() {
      if (_tts == null) {
          fireEventAsync("canceled", true, "Already canceled");
          return;
      }

      // CLAVE: Resetear flags ANTES de hacer stop
      _isStopping.set(false);
      _isCanceling.set(false);

      if (_tts.isSpeaking()) {
          _tts.stop();
          _isSpeakingProperty.set(false);
          _currentUtteranceId = null;
          
          // CLAVE: Disparar evento inmediatamente
          fireEventAsync("canceled", true, "Speech canceled");
      } else {
          _isSpeakingProperty.set(false);
          fireEventAsync("canceled", true, "Already canceled");
      }
  }

// ========================================
    // Lifecycle Methods
    // ========================================

    @Override
    public void onDestroy(Activity activity) {
        if (_tts != null) {
            // Cancelar cualquier habla pendiente
            if (_tts.isSpeaking()) {
                _tts.stop();
            }
            // Liberar recursos
            _tts.shutdown();
            _tts = null;
            _isReady.set(false);
            _isSpeakingProperty.set(false);
            Log.d(_logName, "TTS resources released");
        }
    }

    @Override
    public void onPause(Activity activity) {
        // OPTIMIZACIÓN: Pausar si está hablando para ahorrar batería
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
            fireEventAsync("paused", true, "Speech paused due to app pause");
        }
    }

    @Override
    public void onResume(Activity activity) {
        // OPTIMIZACIÓN: Re-verificar disponibilidad al resumir
        if (_tts != null && _isReady.get()) {
            Log.d(_logName, "TTS ready on resume");
        }
    }

    @Override
    public void onStart(Activity activity) {
        // No-op
    }

    @Override
    public void onStop(Activity activity) {
        // OPTIMIZACIÓN: Detener habla al parar la actividad
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
        }
    }

    // ========================================
    // KrollProxyListener Methods
    // ========================================

    @Override
    public void listenerAdded(String type, int count, KrollProxy proxy) {
        // No-op
    }

    @Override
    public void listenerRemoved(String type, int count, KrollProxy proxy) {
        // No-op
    }

    @Override
    public void processProperties(KrollDict dict) {
        // No-op
    }

    @Override
    public void propertiesChanged(List<KrollPropertyChange> changes, KrollProxy proxy) {
        // No-op
    }

    @Override
    public void propertyChanged(String key, Object oldValue, Object newValue, KrollProxy proxy) {
        // No-op
    }

    // ========================================
    // Modern APIs (API 21+)
    // ========================================

    /**
     * OPTIMIZACIÓN: Obtener voces con cache y retry mejorado
     */
    @Kroll.method
    public Object[] getModernVoices() {
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern voices API requires Android API 21+ and initialized TTS");
            return new Object[0];
        }

        // Esperar inicialización con timeout corto
        if (!waitForInit(1000)) {
            Log.w(_logName, "TTS not ready. Call this method after 'initialized' event");
            return new Object[0];
        }

        try {
            java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
            
            if (voices == null || voices.isEmpty()) {
                // Un retry rápido
                try {
                    Thread.sleep(100);
                    voices = _tts.getVoices();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }

            if (voices == null || voices.isEmpty()) {
                Log.w(_logName, "No voices available");
                return new Object[0];
            }

            Object[] result = new Object[voices.size()];
            int index = 0;

            for (android.speech.tts.Voice voice : voices) {
                HashMap<String, Object> voiceInfo = new HashMap<>();
                voiceInfo.put("name", voice.getName());
                voiceInfo.put("locale", voice.getLocale().toString());
                voiceInfo.put("quality", voice.getQuality());
                voiceInfo.put("isNetworkConnectionRequired", voice.isNetworkConnectionRequired());
                
                // Información adicional útil
                voiceInfo.put("language", voice.getLocale().getLanguage());
                voiceInfo.put("country", voice.getLocale().getCountry());
                
                // Calidad como string
                String qualityStr = "normal";
                if (voice.getQuality() >= 400) {
                    qualityStr = "very_high";
                } else if (voice.getQuality() >= 300) {
                    qualityStr = "high";
                } else if (voice.getQuality() >= 200) {
                    qualityStr = "normal";
                } else {
                    qualityStr = "low";
                }
                voiceInfo.put("qualityString", qualityStr);
                
                result[index++] = voiceInfo;
            }

            Log.i(_logName, "Retrieved " + voices.size() + " voices");
            return result;
        } catch (Exception e) {
            Log.e(_logName, "Error getting voices: " + e.getMessage());
            return new Object[0];
        }
    }

    /**
     * OPTIMIZACIÓN: Obtener idiomas disponibles
     */
    @Kroll.method
    public Object[] getModernLanguages() {
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern languages API requires Android API 21+ and initialized TTS");
            return new Object[0];
        }

        if (!waitForInit(1000)) {
            Log.w(_logName, "TTS not ready. Call this method after 'initialized' event");
            return new Object[0];
        }

        try {
            java.util.Set<java.util.Locale> languages = _tts.getAvailableLanguages();
            
            if (languages == null || languages.isEmpty()) {
                Log.w(_logName, "No languages available");
                return new Object[0];
            }

            // Crear array con información detallada
            Object[] result = new Object[languages.size()];
            int index = 0;

            for (java.util.Locale locale : languages) {
                HashMap<String, Object> langInfo = new HashMap<>();
                langInfo.put("code", locale.toString());
                langInfo.put("language", locale.getLanguage());
                langInfo.put("country", locale.getCountry());
                langInfo.put("displayName", locale.getDisplayName());
                langInfo.put("displayLanguage", locale.getDisplayLanguage());
                langInfo.put("displayCountry", locale.getDisplayCountry());
                
                result[index++] = langInfo;
            }

            Log.i(_logName, "Retrieved " + languages.size() + " languages");
            return result;
        } catch (Exception e) {
            Log.e(_logName, "Error getting languages: " + e.getMessage());
            return new Object[0];
        }
    }

    /**
     * OPTIMIZACIÓN: Verificar si TTS está completamente listo
     */
    @Kroll.method
    public boolean isTTSReady() {
        return _tts != null && _isReady.get();
    }

    /**
     * OPTIMIZACIÓN: Obtener información del motor TTS actual
     */
    @Kroll.method
    public HashMap<String, Object> getEngineInfo() {
        HashMap<String, Object> info = new HashMap<>();
        
        if (_tts == null) {
            info.put("available", false);
            return info;
        }
        
        info.put("available", true);
        info.put("ready", _isReady.get());
        
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            try {
                info.put("defaultEngine", _tts.getDefaultEngine());
                info.put("currentEngine", _tts.getEngines());
                
                android.speech.tts.Voice currentVoice = _tts.getVoice();
                if (currentVoice != null) {
                    HashMap<String, Object> voiceInfo = new HashMap<>();
                    voiceInfo.put("name", currentVoice.getName());
                    voiceInfo.put("locale", currentVoice.getLocale().toString());
                    voiceInfo.put("quality", currentVoice.getQuality());
                    info.put("currentVoice", voiceInfo);
                }
            } catch (Exception e) {
                Log.e(_logName, "Error getting engine info: " + e.getMessage());
            }
        }
        
        info.put("currentRate", _currentRate);
        info.put("currentPitch", _currentPitch);
        
        return info;
    }

    /**
     * OPTIMIZACIÓN: Establecer motor TTS específico (API 14+)
     */
    @Kroll.method
    public void setEngine(String enginePackage) {
        if (_tts != null) {
            // Necesita recrear TTS con nuevo motor
            shutdownTTS();
        }
        
        _mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    _isInitializing.set(true);
                    _tts = new TextToSpeech(TiApplication.getInstance().getApplicationContext(), 
                                           SpeechProxy.this, enginePackage);
                } catch (Exception e) {
                    Log.e(_logName, "Failed to set engine: " + e.getMessage());
                    fireEventAsync("error", false, "Failed to set engine: " + enginePackage);
                }
            }
        });
    }

    /**
     * OPTIMIZACIÓN: Método para limpiar y reinicializar TTS
     */
    @Kroll.method
    public void reset() {
        shutdownTTS();
        _mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                initializeTTSOptimized();
            }
        }, 100);
    }

    /**
     * OPTIMIZACIÓN: Shutdown seguro del TTS
     */
    private void shutdownTTS() {
        if (_tts != null) {
            try {
                if (_tts.isSpeaking()) {
                    _tts.stop();
                }
                _tts.shutdown();
            } catch (Exception e) {
                Log.e(_logName, "Error during TTS shutdown: " + e.getMessage());
            } finally {
                _tts = null;
                _isReady.set(false);
                _isSpeakingProperty.set(false);
                _currentUtteranceId = null;
            }
        }
    }

    /**
     * OPTIMIZACIÓN: Pre-cargar datos de voz para reducir latencia
     */
    @Kroll.method
    public void preloadVoiceData(String language) {
        if (_tts == null || !_isReady.get()) {
            Log.w(_logName, "TTS not ready for preload");
            return;
        }
        
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            Locale locale = toLocale(language);
            // Sintetizar texto vacío para pre-cargar datos de voz
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.0f);
            _tts.setLanguage(locale);
            _tts.speak(" ", TextToSpeech.QUEUE_ADD, params, "preload_" + language);
            Log.d(_logName, "Preloading voice data for: " + language);
        }
    }

    /**
     * OPTIMIZACIÓN: Obtener tamaño estimado del texto en milisegundos
     */
    @Kroll.method
    public int getEstimatedDuration(String text, float rate) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        
        // Estimación basada en promedio de 150 palabras por minuto a velocidad normal
        String[] words = text.trim().split("\\s+");
        int wordCount = words.length;
        
        // Ajustar por velocidad
        float adjustedRate = rate > 0 ? rate : 1.0f;
        
        // 150 palabras/min = 2.5 palabras/seg a velocidad 1.0
        // Duración en ms = (palabras / 2.5) * 1000 / velocidad
        int estimatedMs = (int)((wordCount / 2.5f) * 1000 / adjustedRate);
        
        // Agregar pausas estimadas para puntuación
        int punctuationCount = text.length() - text.replace(".", "").replace(",", "")
                                                 .replace("!", "").replace("?", "").length();
        estimatedMs += punctuationCount * 200; // 200ms por signo de puntuación
        
        return estimatedMs;
    }

    /**
     * OPTIMIZACIÓN: Verificar si un idioma específico necesita conexión de red
     */
    @Kroll.method
    public boolean isNetworkRequired(String language) {
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21 || !_isReady.get()) {
            return false;
        }
        
        try {
            java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
            if (voices != null) {
                Locale targetLocale = toLocale(language);
                for (android.speech.tts.Voice voice : voices) {
                    if (voice.getLocale().equals(targetLocale)) {
                        return voice.isNetworkConnectionRequired();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(_logName, "Error checking network requirement: " + e.getMessage());
        }
        
        return false;
    }

    /**
     * OPTIMIZACIÓN: Método de diagnóstico para debugging
     */
    @Kroll.method
    public HashMap<String, Object> getDiagnostics() {
        HashMap<String, Object> diagnostics = new HashMap<>();
        
        diagnostics.put("ttsInitialized", _tts != null);
        diagnostics.put("isReady", _isReady.get());
        diagnostics.put("isInitializing", _isInitializing.get());
        diagnostics.put("isSpeaking", _isSpeakingProperty.get());
        diagnostics.put("isStopping", _isStopping.get());
        diagnostics.put("isCanceling", _isCanceling.get());
        diagnostics.put("currentUtteranceId", _currentUtteranceId);
        diagnostics.put("utteranceCount", _utteranceCounter.get());
        diagnostics.put("apiLevel", android.os.Build.VERSION.SDK_INT);
        
        if (_tts != null && _isReady.get()) {
            diagnostics.put("ttsIsSpeaking", _tts.isSpeaking());
            if (android.os.Build.VERSION.SDK_INT >= 21) {
                try {
                    diagnostics.put("defaultEngine", _tts.getDefaultEngine());
                    diagnostics.put("voiceCount", _tts.getVoices() != null ? _tts.getVoices().size() : 0);
                } catch (Exception e) {
                    diagnostics.put("diagnosticError", e.getMessage());
                }
            }
        }
        
        return diagnostics;
    }
}
