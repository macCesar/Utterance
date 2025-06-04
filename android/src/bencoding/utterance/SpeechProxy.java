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
    @Kroll.constant
    public static final float VERY_SLOW_SPEECH_RATE = 0.4f;
    @Kroll.constant
    public static final float SLOW_SPEECH_RATE = 0.6f;
    @Kroll.constant
    public static final float FAST_SPEECH_RATE = 1.3f;
    @Kroll.constant
    public static final float VERY_FAST_SPEECH_RATE = 1.6f;

    // ========================================
    // Mathematical Equivalence Constants (Optional/Advanced)
    // ========================================
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
    private boolean _isInitialized = false;
    private CountDownLatch _initLatch = new CountDownLatch(1);
    private boolean _initSuccess = false;
    private boolean _isSpeakingProperty = false;
    private Handler _mainHandler = new Handler(Looper.getMainLooper());

    public SpeechProxy() {
        super();
    }

    private void initializeTTS() {
        if (_tts == null && !_isInitialized) {
            _isInitialized = true;
            _initLatch = new CountDownLatch(1);
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

        // For Android API 21+, handle modern voice identifiers
        if (android.os.Build.VERSION.SDK_INT >= 21 && str.contains("-x-")) {
            // Modern format: es-us-x-sfb-network
            // Extract only the language part: es_US
            String[] parts = str.split("-x-");
            if (parts.length > 0) {
                String langPart = parts[0];
                String[] langComponents = langPart.split("-");
                if (langComponents.length >= 2) {
                    // Convert es-us to es_US
                    return new Locale(langComponents[0], langComponents[1].toUpperCase());
                } else if (langComponents.length == 1) {
                    return new Locale(langComponents[0]);
                }
            }
        }

        // Original logic for traditional formats
        int len = str.length();
        if (len != 2 && len != 5 && len < 7) {
            // Don't throw exception, try to parse more flexibly
            if (str.contains("_")) {
                String[] parts = str.split("_");
                if (parts.length >= 2) {
                    return new Locale(parts[0], parts[1]);
                } else if (parts.length == 1) {
                    return new Locale(parts[0]);
                }
            }
            return Locale.getDefault();
        }

        char ch0 = str.charAt(0);
        char ch1 = str.charAt(1);
        if (ch0 < 'a' || ch0 > 'z' || ch1 < 'a' || ch1 > 'z') {
            // Don't throw exception, use default locale
            return Locale.getDefault();
        }

        if (len == 2) {
            return new Locale(str, "");
        } else {
            if (str.charAt(2) != '_') {
                // Don't throw exception, use default locale
                return Locale.getDefault();
            }
            char ch3 = str.charAt(3);
            if (ch3 == '_') {
                return new Locale(str.substring(0, 2), "", str.substring(4));
            }
            char ch4 = str.charAt(4);
            if (ch3 < 'A' || ch3 > 'Z' || ch4 < 'A' || ch4 > 'Z') {
                // Don't throw exception, use default locale
                return Locale.getDefault();
            }
            if (len == 5) {
                return new Locale(str.substring(0, 2), str.substring(3, 5));
            } else {
                if (str.charAt(5) != '_') {
                    // Don't throw exception, use default locale
                    return Locale.getDefault();
                }
                return new Locale(str.substring(0, 2), str.substring(3, 5), str.substring(6));
            }
        }
    }

    private UtteranceProgressListener createUtteranceProgressListener() {
        return new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                Log.d(_logName, "utterance started");
                _isSpeakingProperty = true;
                doListener("started");
            }

            @Override
            public void onDone(String utteranceId) {
                Log.d(_logName, "utterance completed");
                _isSpeakingProperty = false;
                doListener("completed");
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onError(String utteranceId) {
                Log.e(_logName, "utterance error");
                _isSpeakingProperty = false;
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
            if (status == TextToSpeech.LANG_MISSING_DATA || status == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e(_logName, "This Language is not supported");
                _initSuccess = false;
                _initLatch.countDown();

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
                _initSuccess = true;
                _tts.setOnUtteranceProgressListener(createUtteranceProgressListener());

                // Get default voice information
                if (android.os.Build.VERSION.SDK_INT >= 21) {
                    android.speech.tts.Voice defaultVoice = _tts.getVoice();
                    if (defaultVoice != null) {
                        _voice = defaultVoice.getLocale().toString();
                    }
                } else {
                    _voice = Locale.getDefault().toString();
                }

                _initLatch.countDown();
                Log.i(_logName, "TTS initialized successfully");
            }
        } catch (Exception error) {
            _initSuccess = false;
            _initLatch.countDown();

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

        final KrollDict args = new KrollDict(hm);
        if (!args.containsKeyAndNotNull("text")) {
            Log.e(_logName, "the text parameter is required");
            return;
        }

        // If TTS is not ready, wait on a separate thread
        if (!_initSuccess || _initLatch.getCount() > 0) {
            Log.i(_logName, "TTS not ready, queuing speech request...");

            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        // Esperar hasta 5 segundos para la inicialización
                        boolean initialized = _initLatch.await(5, TimeUnit.SECONDS);
                        if (initialized && _initSuccess) {
                            // Ejecutar en el hilo principal
                            _mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    doStartSpeaking(args);
                                }
                            });
                        } else {
                            Log.e(_logName, "TTS initialization failed or timed out");
                        }
                    } catch (InterruptedException e) {
                        Log.e(_logName, "Interrupted while waiting for TTS initialization");
                        Thread.currentThread().interrupt();
                    }
                }
            }).start();
        } else {
            // TTS ya está listo, ejecutar inmediatamente
            doStartSpeaking(args);
        }
    }

    private void doStartSpeaking(KrollDict args) {
        _text = args.getString("text");
        _voice = "auto";

        if (args.containsKeyAndNotNull("voice") || args.containsKeyAndNotNull("language")) {
            if (args.containsKeyAndNotNull("language")) {
                _voice = args.getString("language");
            } else {
                _voice = args.getString("voice");
            }

            if (_voice != "auto") {
                // Para API 21+, intentar establecer la voz directamente por nombre
                if (android.os.Build.VERSION.SDK_INT >= 21) {
                    try {
                        java.util.Set<android.speech.tts.Voice> availableVoices = _tts.getVoices();
                        if (availableVoices != null) {
                            boolean voiceFound = false;
                            for (android.speech.tts.Voice voice : availableVoices) {
                                if (voice.getName().equals(_voice)) {
                                    _tts.setVoice(voice);
                                    Log.d(_logName, "Voice set successfully: " + _voice);
                                    voiceFound = true;
                                    break;
                                }
                            }
                            if (!voiceFound) {
                                // Fallback: intentar establecer por locale
                                if (isLanguageAvailable(_voice)) {
                                    _tts.setLanguage(toLocale(_voice));
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.w(_logName, "Could not set voice by name, falling back to locale: " + e.getMessage());
                        // Fallback: intentar establecer por locale
                        if (isLanguageAvailable(_voice)) {
                            _tts.setLanguage(toLocale(_voice));
                        }
                    }
                } else {
                    // API < 21: usar el método tradicional
                    if (isLanguageAvailable(_voice)) {
                        _tts.setLanguage(toLocale(_voice));
                    } else {
                        Log.e(_logName, "Unsupported Language provided.");
                    }
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
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "FINISHED_PLAYING");
            _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, params, "FINISHED_PLAYING");
            _isSpeakingProperty = true;
        } else {
            @SuppressWarnings("deprecation")
            HashMap<String, String> options = new HashMap<String, String>();
            options.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "FINISHED_PLAYING");
            @SuppressWarnings("deprecation")
            int result = _tts.speak(_text, TextToSpeech.QUEUE_FLUSH, options);
            if (result == TextToSpeech.ERROR) {
                Log.e(_logName, "Error starting speech synthesis");
            } else {
                _isSpeakingProperty = true;
            }
        }
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void pauseSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        Log.d(_logName, "Android does not support pauseSpeaking, this method is for parity only");
        doListener("paused");
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void continueSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        Log.d(_logName, "Android does not support continueSpeaking, this method is for parity only");
        doListener("continued");
    }

    @Kroll.method
    public void continueSpeaking() {
        Log.d(_logName, "Android does not support continueSpeaking, this method is for parity only");
        doListener("continued");
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void stopSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        ensureTTSInitialized();
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
            _isSpeakingProperty = false;
        }
        doListener("stopped");
    }

    @Kroll.method
    public void cancelSpeaking() {
        ensureTTSInitialized();
        if (_tts != null && _tts.isSpeaking()) {
            _tts.stop();
            _isSpeakingProperty = false;
        }
        doListener("canceled");
    }

    @Override
    public void onDestroy(Activity arg0) {
        if (_tts != null) {
            if (_tts.isSpeaking()) {
                _tts.stop();
                _isSpeakingProperty = false;
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
    public void listenerRemoved(String arg0, int arg1, KrollProxy arg2) {
    }

    // ========================================
    // Modern APIs leveraging Android API 21+ (v3.0 MVP)
    // ========================================

    /**
     * Get available voices using modern Android API 21+ methods
     * This method properly waits for TTS initialization before attempting to get voices
     * @return Array of available voices with detailed information
     */
    @Kroll.method
    public Object[] getModernVoices() {
        ensureTTSInitialized();
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern voices API requires Android API 21+");
            return new Object[0];
        }

        // Wait for TTS initialization on a background thread
        try {
            boolean initialized = _initLatch.await(3, TimeUnit.SECONDS);
            if (!initialized || !_initSuccess) {
                Log.w(_logName, "TTS Engine not yet fully initialized - voices may not be available");
                Log.i(_logName, "Recommendation: Wait a few seconds after creating Speech object before calling getModernVoices()");
                return new Object[0];
            }
        } catch (InterruptedException e) {
            Log.e(_logName, "Interrupted while waiting for TTS initialization");
            Thread.currentThread().interrupt();
            return new Object[0];
        }

        try {
            // Get voices with a small retry mechanism in case voices aren't immediately available
            java.util.Set<android.speech.tts.Voice> voices = null;
            for (int retry = 0; retry < 3; retry++) {
                voices = _tts.getVoices();
                if (voices != null && !voices.isEmpty()) {
                    break;
                }
                // Small delay between retries
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

            if (voices == null || voices.isEmpty()) {
                Log.w(_logName, "TTS Engine returned empty voice set");
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

        // Wait for TTS initialization
        try {
            boolean initialized = _initLatch.await(3, TimeUnit.SECONDS);
            if (!initialized || !_initSuccess) {
                Log.w(_logName, "TTS Engine not yet fully initialized - languages may not be available");
                return new Object[0];
            }
        } catch (InterruptedException e) {
            Log.e(_logName, "Interrupted while waiting for TTS initialization");
            Thread.currentThread().interrupt();
            return new Object[0];
        }

        try {
            java.util.Set<java.util.Locale> languages = _tts.getAvailableLanguages();
            if (languages == null || languages.isEmpty()) {
                Log.w(_logName, "TTS Engine returned empty language set");
                return new Object[0];
            }

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
        return _tts != null && _initSuccess && _initLatch.getCount() == 0;
    }

    @Override
    public void processProperties(KrollDict arg0) {
    }

    @Override
    public void propertiesChanged(List<KrollPropertyChange> arg0, KrollProxy arg1) {
    }

    @Override
    public void propertyChanged(String arg0, Object arg1, Object arg2, KrollProxy arg3) {
    }
}
