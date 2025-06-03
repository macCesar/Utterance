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

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class SpeechProxy extends KrollProxy implements TiLifecycle.OnLifecycleEvent, KrollProxyListener, OnInitListener {
    //Add properties for iOS compatability - FIXED VALUES v3.0+
    @Kroll.constant
    public static final float DEFAULT_SPEECH_RATE = 1.0f; // Android normal speed
    @Kroll.constant
    public static final float MIN_SPEECH_RATE = 0.1f; // Android minimum practical speed
    @Kroll.constant
    public static final float MAX_SPEECH_RATE = 3.0f; // Android maximum practical speed
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_IMMEDIATE = 0;
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_WORD = 0;
    
    // ========================================
    // v3.0+ Cross-Platform Speech Rate Constants (Perceptually Equivalent)
    // ========================================
    // These constants provide perceptually equivalent speech rates across iOS/Android
    // Optimized for real-world user experience rather than mathematical equivalence
    // iOS range: 0.0-1.0 | Android range: 0.1-3.0
    
    @Kroll.constant
    public static final float VERY_SLOW_SPEECH_RATE = 0.4f;  // Very slow - perceptually equivalent to iOS 0.3f
    @Kroll.constant
    public static final float SLOW_SPEECH_RATE = 0.6f;       // Slow - perceptually equivalent to iOS 0.45f
    @Kroll.constant
    public static final float FAST_SPEECH_RATE = 1.3f;       // Fast - perceptually equivalent to iOS 0.75f
    @Kroll.constant
    public static final float VERY_FAST_SPEECH_RATE = 1.6f;  // Very fast - perceptually equivalent to iOS 0.9f
    
    // ========================================
    // Mathematical Equivalence Constants (Optional/Advanced)
    // ========================================
    // For developers who prefer mathematical precision over perceptual equivalence
    // Formula: android_value = 0.1 + (ios_value × 2.9)
    
    @Kroll.constant
    public static final float MATH_VERY_SLOW_SPEECH_RATE = 0.475f;  // Exact math equivalent to iOS 0.125f
    @Kroll.constant
    public static final float MATH_SLOW_SPEECH_RATE = 0.825f;       // Exact math equivalent to iOS 0.25f
    @Kroll.constant
    public static final float MATH_FAST_SPEECH_RATE = 1.875f;       // Exact math equivalent to iOS 0.625f
    @Kroll.constant
    public static final float MATH_VERY_FAST_SPEECH_RATE = 2.275f;  // Exact math equivalent to iOS 0.75f
    private final String _logName = UtteranceModule.MODULE_FULL_NAME;
    private TextToSpeech _tts = null;
    private String _text = "";
    private String _voice = "";
    private boolean _isInitialized = false;
    private boolean _ttsReady = false; // Indica si el TTS está completamente listo

    public SpeechProxy() {
        super();
        // Don't initialize TTS here to avoid 'this' escape warning
        // TTS will be initialized when first needed
    }
    
    private void initializeTTS() {
        if (_tts == null && !_isInitialized) {
            _isInitialized = true;
            _tts = new TextToSpeech(TiApplication.getInstance().getApplicationContext(), this);
        }
    }
    
    private void ensureTTSInitialized() {
        if (_tts == null) {
            initializeTTS();
        }
    }

    public static Locale toLocale(String str) {
        if (str == null) {
            return null;
        }
        int len = str.length();
        if (len != 2 && len != 5 && len < 7) {
            throw new IllegalArgumentException("Invalid locale format: " + str);
        }
        char ch0 = str.charAt(0);
        char ch1 = str.charAt(1);
        if (ch0 < 'a' || ch0 > 'z' || ch1 < 'a' || ch1 > 'z') {
            throw new IllegalArgumentException("Invalid locale format: " + str);
        }
        if (len == 2) {
            return new Locale(str, "");
        } else {
            if (str.charAt(2) != '_') {
                throw new IllegalArgumentException("Invalid locale format: " + str);
            }
            char ch3 = str.charAt(3);
            if (ch3 == '_') {
                return new Locale(str.substring(0, 2), "", str.substring(4));
            }
            char ch4 = str.charAt(4);
            if (ch3 < 'A' || ch3 > 'Z' || ch4 < 'A' || ch4 > 'Z') {
                throw new IllegalArgumentException("Invalid locale format: " + str);
            }
            if (len == 5) {
                return new Locale(str.substring(0, 2), str.substring(3, 5));
            } else {
                if (str.charAt(5) != '_') {
                    throw new IllegalArgumentException("Invalid locale format: " + str);
                }
                return new Locale(str.substring(0, 2), str.substring(3, 5), str.substring(6));
            }
        }
    }

    // Modern UtteranceProgressListener for API compatibility
    private UtteranceProgressListener createUtteranceProgressListener() {
        return new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                if ("WARMUP".equals(utteranceId)) {
                    Log.d(_logName, "TTS warmup utterance started");
                    return; // No disparar eventos para warmup
                }
                
                Log.d(_logName, "utterance started");
                _isSpeakingProperty = true; // Actualizar la propiedad para consistencia entre plataformas
                doListener("started");
            }

            @Override
            public void onDone(String utteranceId) {
                if ("WARMUP".equals(utteranceId)) {
                    Log.d(_logName, "TTS warmup utterance completed");
                    _isWarmedUp = true;
                    _warmupInProgress = false;
                    return; // No disparar eventos para warmup
                }
                
                Log.d(_logName, "utterance completed");
                _isSpeakingProperty = false; // Actualizar la propiedad para consistencia entre plataformas
                doListener("completed");
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onError(String utteranceId) {
                if ("WARMUP".equals(utteranceId)) {
                    Log.w(_logName, "TTS warmup utterance error - will retry");
                    _warmupInProgress = false;
                    return; // No disparar eventos para warmup
                }
                
                Log.e(_logName, "utterance error");
                _isSpeakingProperty = false; // Actualizar la propiedad para consistencia entre plataformas
                if (hasListeners("completed")) {
                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", false);
                    event.put("message", "Speech synthesis error");
                    event.put("text", _text);
                    event.put("voice", _voice);
                    fireEvent("completed", event);
                }
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                if ("WARMUP".equals(utteranceId)) {
                    Log.w(_logName, "TTS warmup utterance error (code: " + errorCode + ") - will retry");
                    _warmupInProgress = false;
                    return; // No disparar eventos para warmup
                }
                
                Log.e(_logName, "utterance error with code: " + errorCode);
                if (hasListeners("completed")) {
                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", false);
                    event.put("message", "Speech synthesis error (code: " + errorCode + ")");
                    event.put("text", _text);
                    event.put("voice", _voice);
                    event.put("errorCode", errorCode);
                    fireEvent("completed", event);
                }
            }
        };
    }

    @Override
    public void onInit(int status) {
        try {

            if (status == TextToSpeech.LANG_MISSING_DATA
                    || status == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e(_logName, "This Language is not supported");
                if (hasListeners("completed")) {
                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", false);
                    event.put("message", "This Language is not supported");
                    event.put("text", _text);
                    event.put("voice", _voice);

                    fireEvent("completed", event);
                }
            }

            if (status == TextToSpeech.SUCCESS) {
                _ttsReady = true; // Marcar TTS como completamente listo
                // Use modern UtteranceProgressListener instead of deprecated OnUtteranceCompletedListener
                _tts.setOnUtteranceProgressListener(createUtteranceProgressListener());
                
                // Get default voice information using modern API if available
                if (android.os.Build.VERSION.SDK_INT >= 21) {
                    android.speech.tts.Voice defaultVoice = _tts.getVoice();
                    if (defaultVoice != null) {
                        _voice = defaultVoice.getLocale().toString();
                    }
                } else {
                    // For older versions, use a safe fallback since getLanguage() and getDefaultLanguage() are both deprecated
                    _voice = Locale.getDefault().toString();
                }
                
                // Realizar warmup automático para evitar pérdida del primer speech
                Log.i(_logName, "TTS initialized successfully, performing automatic warmup...");
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        warmUpTTS();
                    }
                }, 200); // Pequeño delay para asegurar que todo esté listo
            }
        } catch (Exception error) {
            if (hasListeners("completed")) {
                HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("success", false);
                event.put("message", "General Err: " + error.getMessage());
                event.put("text", _text);
                event.put("voice", _voice);
                fireEvent("completed", event);
            }
            Log.e(UtteranceModule.MODULE_FULL_NAME, error.getMessage());
            error.printStackTrace();
        }
    }

    private void doListener(String eventName) {
        if (hasListeners(eventName)) {
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("success", true);
            // Actualizar y usar la propiedad _isSpeakingProperty para mantener consistencia
            if (_tts != null) {
                _isSpeakingProperty = _tts.isSpeaking();
            } else {
                _isSpeakingProperty = false;
            }
            event.put("speaking", _isSpeakingProperty);
            event.put("text", _text);
            event.put("voice", _voice);
            fireEvent(eventName, event);
            Log.d(_logName, "event: " + eventName + " fired");
        } else {
            Log.d(_logName, "event: " + eventName + " not found");
        }
    }

    // Variable para mantener el estado de habla, sincronizado con el TTS
    private boolean _isSpeakingProperty = false;
    
    @Kroll.getProperty
    @Kroll.method
    public Boolean isSpeaking() {
        ensureTTSInitialized();
        if (_tts == null) {
            _isSpeakingProperty = false;
            return false;
        } else {
            _isSpeakingProperty = _tts.isSpeaking();
            return _isSpeakingProperty;
        }
    }

    @Kroll.method
    public boolean isLanguageAvailable(String language) {
        ensureTTSInitialized();
        if (_tts == null) {
            return false;
        }
        int check = _tts.isLanguageAvailable(toLocale(language));
        return ((check != TextToSpeech.LANG_MISSING_DATA) && (check != TextToSpeech.LANG_NOT_SUPPORTED));
    }

    @Kroll.method
    @SuppressWarnings({"rawtypes", "unchecked"})
    public void startSpeaking(HashMap hm) {
        ensureTTSInitialized();
        if (_tts == null) {
            Log.e(_logName, "TTS not initialized");
            return;
        }
        
        // ========================================
        // WARMUP AUTOMÁTICO INTEGRADO (v3.0+)
        // ========================================
        // Si TTS no está calentado y está disponible, hacer warmup automáticamente
        if (!_isWarmedUp && !_warmupInProgress && _tts != null) {
            Log.i(_logName, "TTS not warmed up, performing automatic warmup before speech...");
            _warmupInProgress = true;
            
            // Hacer warmup silencioso primero
            try {
                if (android.os.Build.VERSION.SDK_INT >= 21) {
                    Bundle warmupParams = new Bundle();
                    warmupParams.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "WARMUP");
                    warmupParams.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.01f);
                    _tts.speak(".", TextToSpeech.QUEUE_FLUSH, warmupParams, "WARMUP");
                } else {
                    HashMap<String, String> warmupOptions = new HashMap<String, String>();
                    warmupOptions.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "WARMUP");
                    warmupOptions.put(TextToSpeech.Engine.KEY_PARAM_VOLUME, "0.01");
                    @SuppressWarnings("deprecation")
                    int result = _tts.speak(".", TextToSpeech.QUEUE_FLUSH, warmupOptions);
                }
                
                // Esperar warmup y luego ejecutar el speech solicitado
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        _isWarmedUp = true;
                        _warmupInProgress = false;
                        Log.i(_logName, "Warmup completed, now executing requested speech");
                        startSpeaking(hm); // Recursión para ejecutar el speech real
                    }
                }, 1500); // Aumentar tiempo para asegurar warmup completo
                
                return; // Salir aquí, el speech real se ejecutará después del warmup
            } catch (Exception e) {
                Log.e(_logName, "Error during automatic warmup: " + e.getMessage());
                _warmupInProgress = false;
                // Continuar con el speech normal aunque el warmup falle
            }
        }
        
        // ========================================
        // SPEECH NORMAL (después del warmup o si ya está listo)
        // ========================================
        KrollDict args = new KrollDict(hm);
        if (!args.containsKeyAndNotNull("text")) {
            Log.e(_logName, "the text parameter is required");
            return;
        }
        _text = args.getString("text");
        _voice = "auto";
        if (args.containsKeyAndNotNull("voice") || args.containsKeyAndNotNull("language")) {
            if (args.containsKeyAndNotNull("language")) {
                _voice = args.getString("language");
            } else {
                _voice = args.getString("voice");
            }
            if (_voice != "auto") {
                if (isLanguageAvailable(_voice)) {
                    _tts.setLanguage(toLocale(_voice));
                } else {
                    Log.e(_logName, "Unsupported Language provided.");
                }
            }
        }

        if (args.containsKeyAndNotNull("rate")) {
            double dRate = args.getDouble("rate");
            _tts.setSpeechRate((float) (dRate));
        }
        if (args.containsKeyAndNotNull("pitch")) {
            double dPitch = args.getDouble("pitch");
            _tts.setPitch((float) (dPitch));
        }

        // Use modern speak method (API 21+) or alternative for older versions
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            //Need to add this so UtteranceProgressListener will fire
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "FINISHED_PLAYING");
            _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, params, "FINISHED_PLAYING");
            _isSpeakingProperty = true; // Actualizar la propiedad para consistencia entre plataformas
        } else {
            // For older Android versions, use the deprecated method but suppress the warning
            // since it's the only option available for those API levels
            @SuppressWarnings("deprecation")
            HashMap<String, String> options = new HashMap<String, String>();
            options.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "FINISHED_PLAYING");
            @SuppressWarnings("deprecation")
            int result = _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, options);
            if (result == TextToSpeech.ERROR) {
                Log.e(_logName, "Error starting speech synthesis");
            } else {
                _isSpeakingProperty = true; // Actualizar la propiedad para consistencia entre plataformas
            }
        }

        // Note: started event is now handled by UtteranceProgressListener.onStart()

    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void pauseSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        Log.d(_logName, "Android does not support pauseSpeaking, this method is for parity only");
        
        // Disparar evento 'paused' para mantener la consistencia de comportamiento con iOS
        doListener("paused");
    }
    
    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void continueSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        Log.d(_logName, "Android does not support continueSpeaking, this method is for parity only");
        
        // Disparar evento 'continued' para mantener la consistencia de comportamiento con iOS
        doListener("continued");
    }
    
    @Kroll.method
    public void continueSpeaking() {
        Log.d(_logName, "Android does not support continueSpeaking, this method is for parity only");
        
        // Disparar evento 'continued' para mantener la consistencia de comportamiento con iOS
        doListener("continued");
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void stopSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        ensureTTSInitialized();
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
            _isSpeakingProperty = false; // Actualizar la propiedad para consistencia entre plataformas
        }
        doListener("stopped");
    }
    
    @Kroll.method
    public void cancelSpeaking() {
        ensureTTSInitialized();
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
            _isSpeakingProperty = false; // Actualizar la propiedad para consistencia entre plataformas
        }
        // Disparar evento 'canceled' para mantener la consistencia de comportamiento con iOS
        doListener("canceled");
    }


    @Override
    public void onDestroy(Activity arg0) {
        if (_tts != null) {
            if (_tts.isSpeaking()) {
                _tts.stop();
                _isSpeakingProperty = false; // Actualizar la propiedad para consistencia entre plataformas
            }
            _tts.shutdown();
        }
    }


    @Override
    public void onPause(Activity arg0) {
    }

    @Override
    public void onResume(Activity arg0) {
    }


    @Override
    public void onStart(Activity arg0) {
    }


    @Override
    public void onStop(Activity arg0) {
    }


    @Override
    public void listenerAdded(String arg0, int arg1, KrollProxy arg2) {
    }


    @Override
    public void listenerRemoved(String arg0, int arg1, KrollProxy arg2) {    }

    // ========================================
    // Modern APIs leveraging Android API 21+ (v3.0 MVP)
    // ========================================
    
    /**
     * Get available voices using modern Android API 21+ methods
     * @return Array of available voices with detailed information
     */
    @Kroll.method
    public Object[] getModernVoices() {
        ensureTTSInitialized();
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern voices API requires Android API 21+");
            return new Object[0];
        }
        
        // Check if TTS is properly initialized and ready
        if (!_ttsReady) {
            Log.w(_logName, "TTS Engine not yet fully initialized - voices may not be available");
            Log.i(_logName, "Recommendation: Wait a few seconds after creating Speech object before calling getModernVoices()");
        }
        
        try {
            // Use modern getVoices() method available since API 21
            java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
            if (voices == null) {
                Log.w(_logName, "TTS Engine returned null voice set - engine may not be ready");
                Log.i(_logName, "Try calling getModernVoices() again after a few seconds");
                return new Object[0];
            }
            
            Log.i(_logName, "Successfully retrieved " + voices.size() + " voices from TTS engine");
            Object[] result = new Object[voices.size()];
            int index = 0;
            
            for (android.speech.tts.Voice voice : voices) {
                HashMap<String, Object> voiceInfo = new HashMap<>();
                voiceInfo.put("name", voice.getName());
                voiceInfo.put("locale", voice.getLocale().toString());
                voiceInfo.put("quality", voice.getQuality());
                voiceInfo.put("isNetworkConnectionRequired", voice.isNetworkConnectionRequired());
                result[index++] = voiceInfo;
            }
            
            return result;
        } catch (Exception e) {
            Log.e(_logName, "Error getting modern voices: " + e.getMessage());
            return new Object[0];
        }
    }

    /**
     * Get available languages using modern Android API 21+ methods
     * @return Array of available language codes
     */
    @Kroll.method
    public Object[] getModernLanguages() {
        ensureTTSInitialized();
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern languages API requires Android API 21+");
            return new Object[0];
        }
        
        // Check if TTS is properly initialized and ready
        if (!_ttsReady) {
            Log.w(_logName, "TTS Engine not yet fully initialized - languages may not be available");
            Log.i(_logName, "Recommendation: Wait a few seconds after creating Speech object before calling getModernLanguages()");
        }
        
        try {
            // Use modern getAvailableLanguages() method available since API 21
            java.util.Set<java.util.Locale> languages = _tts.getAvailableLanguages();
            if (languages == null) {
                Log.w(_logName, "TTS Engine returned null language set - engine may not be ready");
                Log.i(_logName, "Try calling getModernLanguages() again after a few seconds");
                return new Object[0];
            }
            
            Log.i(_logName, "Successfully retrieved " + languages.size() + " languages from TTS engine");
            Object[] result = new Object[languages.size()];
            int index = 0;
            
            for (java.util.Locale locale : languages) {
                result[index++] = locale.toString();
            }
            
            return result;
        } catch (Exception e) {
            Log.e(_logName, "Error getting modern languages: " + e.getMessage());
            return new Object[0];
        }
    }

    /**
     * Check if TTS engine is fully initialized and ready
     * @return true if TTS is ready, false otherwise
     */
    @Kroll.method
    public boolean isTTSReady() {
        return _tts != null && _ttsReady;
    }

    // ========================================
    // TTS Warm-up y Inicialización Robusta (v3.0+)
    // ========================================
    
    private boolean _isWarmedUp = false;
    private boolean _warmupInProgress = false;
    
    /**
     * Warm up TTS engine to ensure first speech is not lost
     * This is especially important on slow/older Android devices
     */
    @Kroll.method
    public void warmUpTTS() {
        if (_isWarmedUp || _warmupInProgress) {
            Log.d(_logName, "TTS already warmed up or warmup in progress");
            return;
        }
        
        ensureTTSInitialized();
        if (_tts == null || !_ttsReady) {
            Log.w(_logName, "TTS not ready for warmup, will retry when ready");
            return;
        }
        
        _warmupInProgress = true;
        Log.i(_logName, "Starting TTS warmup to prevent first speech loss...");
        
        try {
            // Crear warmup utterance muy corto e inaudible
            if (android.os.Build.VERSION.SDK_INT >= 21) {
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "WARMUP");
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.01f); // Casi silencioso
                
                // Speak un texto muy corto para inicializar el engine
                _tts.speak(".", TextToSpeech.QUEUE_FLUSH, params, "WARMUP");
            } else {
                HashMap<String, String> options = new HashMap<String, String>();
                options.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "WARMUP");
                options.put(TextToSpeech.Engine.KEY_PARAM_VOLUME, "0.01");
                
                @SuppressWarnings("deprecation")
                int result = _tts.speak(".", TextToSpeech.QUEUE_FLUSH, options);
                if (result == TextToSpeech.SUCCESS) {
                    Log.d(_logName, "TTS warmup started successfully");
                }
            }
            
            // Marcar como calentado después de un breve delay
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    _isWarmedUp = true;
                    _warmupInProgress = false;
                    Log.i(_logName, "TTS warmup completed - engine ready for reliable speech");
                }
            }, 1000); // 1 segundo debería ser suficiente
            
        } catch (Exception e) {
            Log.e(_logName, "Error during TTS warmup: " + e.getMessage());
            _warmupInProgress = false;
        }
    }
    
    /**
     * Check if TTS has been warmed up and is ready for reliable speech
     */
    @Kroll.method
    public boolean isTTSWarmedUp() {
        return _tts != null && _ttsReady && _isWarmedUp;
    }
    
    @Override
    public void processProperties(KrollDict arg0) {
    }

    @Override
    public void propertiesChanged(List<KrollPropertyChange> arg0,
                                  KrollProxy arg1) {
    }


    @Override
    public void propertyChanged(String arg0, Object arg1, Object arg2,
                                KrollProxy arg3) {
    }

}
