/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.app.Activity;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.TextToSpeech.OnInitListener;
import android.speech.tts.UtteranceProgressListener;
import android.net.Uri;
import android.os.Build;
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
import org.appcelerator.titanium.TiFileProxy;
import org.appcelerator.titanium.TiLifecycle;
import org.appcelerator.titanium.io.TiBaseFile;
import org.appcelerator.titanium.io.TiFileFactory;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class SpeechProxy extends KrollProxy implements TiLifecycle.OnLifecycleEvent, KrollProxyListener, OnInitListener {
    // Add properties for iOS compatability - FIXED VALUES v3.0+
    @Kroll.constant
    public static final float DEFAULT_SPEECH_RATE = 1.0f;
    @Kroll.constant
    public static final float MIN_SPEECH_RATE = 0.1f;
    @Kroll.constant
    public static final float MAX_SPEECH_RATE = 3.0f;
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_IMMEDIATE = 0;
    @Kroll.constant
    public static final int SPEECH_BOUNDARY_WORD = 1;

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

    // Error codes of the "completed" event and of the other events that report a failure. The ones that
    // also exist in speech-to-text have the same value there.
    @Kroll.constant
    public static final String ERROR_NETWORK = "network";
    @Kroll.constant
    public static final String ERROR_AUDIO = "audio";
    @Kroll.constant
    public static final String ERROR_TIMEOUT = "timeout";
    @Kroll.constant
    public static final String ERROR_SERVICE_ERROR = "service_error";
    @Kroll.constant
    public static final String ERROR_INVALID_ARGUMENT = "invalid_argument";
    @Kroll.constant
    public static final String ERROR_INVALID_FILE = "invalid_file";
    @Kroll.constant
    public static final String ERROR_LANGUAGE_UNAVAILABLE = "language_unavailable";
    @Kroll.constant
    public static final String ERROR_CANCELED = "canceled";
    @Kroll.constant
    public static final String ERROR_UNSUPPORTED = "unsupported";
    @Kroll.constant
    public static final String ERROR_UNKNOWN = "unknown";
    @Kroll.constant
    public static final String ERROR_SYNTHESIS = "synthesis";
    @Kroll.constant
    public static final String ERROR_NOT_READY = "not_ready";
    @Kroll.constant
    public static final String ERROR_TEXT_TOO_LONG = "text_too_long";

    private static final int KIND_SPEECH = 0;
    private static final int KIND_SILENCE = 1;
    private static final int KIND_FILE = 3;

    /**
     * One call to startSpeaking(), playSilence(), playEarcon() or synthesizeToFile(). It owns what the events of
     * its utterance report, so a queued text never reports the text of the one queued after it.
     */
    private static final class Request {
        final String id;
        final int kind;
        final KrollDict args;
        // The whole text the caller passed, and where in it the text spoken now starts (a resumed speech starts mid-text)
        final String fullText;
        final int baseOffset;
        final String text;
        volatile String voice = "";
        volatile float rate;
        volatile float pitch;
        // Pieces the engine speaks one after another when the text is longer than it accepts
        volatile int parts = 1;
        // Start, in fullText, of the last word the engine reported; -1 while it reported none
        volatile int lastRange = -1;
        // synthesizeToFile only
        File destination;
        boolean destinationGiven;
        List<File> pieces;
        AtomicInteger piecesDone = new AtomicInteger(0);

        Request(String id, int kind, KrollDict args, String fullText, int baseOffset, String text) {
            this.id = id;
            this.kind = kind;
            this.args = args;
            this.fullText = fullText;
            this.baseOffset = baseOffset;
            this.text = text;
        }
    }

    private static final class Part {
        final Request request;
        final int index;
        final int offset;
        final String text;

        Part(Request request, int index, int offset, String text) {
            this.request = request;
            this.index = index;
            this.offset = offset;
            this.text = text;
        }

        boolean isLast() {
            return index == request.parts - 1;
        }
    }

    private volatile String _voice = "";
    private volatile TextToSpeech _tts = null;
    private final String _logName = UtteranceModule.MODULE_FULL_NAME;
    private final CountDownLatch _initLatch = new CountDownLatch(1);
    private final AtomicBoolean _initSuccess = new AtomicBoolean(false);
    private final Handler _mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicBoolean _isSpeakingProperty = new AtomicBoolean(false);

    // Every call into TextToSpeech that the caller does not need an answer from runs here.
    // TextToSpeech waits on its connection lock while the engine connects; on the main thread
    // that wait is an ANR.
    private final ExecutorService _ttsExecutor = Executors.newSingleThreadExecutor();

    // OPTIMIZATION: Improved state flags for better control
    private final AtomicBoolean _isReady = new AtomicBoolean(false);
    private final AtomicBoolean _isStopping = new AtomicBoolean(false);
    private final AtomicBoolean _isCanceling = new AtomicBoolean(false);
    private final AtomicBoolean _isInitializing = new AtomicBoolean(false);

    // OPTIMIZATION: Utterance counter for unique tracking
    private volatile String _currentUtteranceId = null;
    private final AtomicInteger _utteranceCounter = new AtomicInteger(0);

    // Last request queued by startSpeaking(); null after stop/cancel. Engine callbacks for a request
    // that is not this one (a finished or stopped utterance, the warm-up) must not touch _isSpeakingProperty.
    private volatile String _latestUtteranceId = null;

    // Utterances the engine has not finished, by utterance id, and the speech requests among them in the order queued
    private final Map<String, Part> _parts = new ConcurrentHashMap<String, Part>();
    private final List<Request> _pending = Collections.synchronizedList(new ArrayList<Request>());
    private volatile Request _lastRequest = null;

    // pauseSpeaking() emulation: what was left to say when the speech was paused
    private volatile boolean _paused = false;
    private volatile List<Request> _resume = null;

    // Audio focus held while the speech lasts (audioFocus: true)
    private final Object _focusLock = new Object();
    private Object _focusToken = null;
    private AudioManager.OnAudioFocusChangeListener _focusListener = null;
    private volatile String _audioUsage = null;

    // OPTIMIZATION: Cache for current configuration
    private volatile float _currentPitch = 1.0f;
    private volatile Locale _currentLocale = null;
    private volatile float _currentRate = DEFAULT_SPEECH_RATE;

    // OPTIMIZATION: Timeout limit for operations
    private static final long STOP_TIMEOUT_MS = 500;
    private static final long INIT_TIMEOUT_MS = 2000;

    public SpeechProxy() {
        super();
        _mainHandler.post(new Runnable() {
            @Override
            public void run() {
                initializeTTSOptimized();
            }
        });
    }

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

    private void runOnTTSThread(final Runnable task) {
        try {
            _ttsExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        task.run();
                    } catch (Exception e) {
                        Log.e(_logName, "TTS task failed: " + e.getMessage(), e);
                    }
                }
            });
        } catch (RejectedExecutionException e) {
            Log.w(_logName, "TTS executor is shut down; task dropped");
        }
    }

    private boolean waitForInit(long timeoutMs) {
        try {
            return _initLatch.await(timeoutMs, TimeUnit.MILLISECONDS) && _initSuccess.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private boolean ready() {
        return _tts != null && _isReady.get();
    }

    private boolean isLatestRequest(Request request) {
        return request != null && request.id.equals(_latestUtteranceId);
    }

    private void resetControlFlags() {
        _isStopping.set(false);
        _isCanceling.set(false);
        _currentUtteranceId = null;
    }

    public static Locale toLocale(String str) {
        if (str == null || str.isEmpty()) {
            return Locale.getDefault();
        }

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

        // Handle modern Android format (API 21+)
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

        // Intento de parseo simple
        if (str.length() == 2) {
            return new Locale(str);
        }

        return Locale.getDefault();
    }

    private UtteranceProgressListener createOptimizedUtteranceProgressListener() {
        return new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                Log.d(_logName, "TTS Engine: utterance started - " + utteranceId);
                Part part = utteranceId != null ? _parts.get(utteranceId) : null;
                if (part == null || part.request.kind == KIND_FILE) {
                    return;
                }
                if (part.index > 0) {
                    // Only the first piece of a long text starts it
                    return;
                }
                Request request = part.request;
                if (isLatestRequest(request)) {
                    _isSpeakingProperty.set(true);
                }
                _currentUtteranceId = utteranceId;

                fireEventAsync("started", true, "Speech started", request, null, 0);
            }

            @Override
            public void onDone(String utteranceId) {
                Log.d(_logName, "TTS Engine: utterance completed - " + utteranceId);
                Part part = utteranceId != null ? _parts.remove(utteranceId) : null;
                if (part == null) {
                    Log.d(_logName, "Ignoring onDone for an utterance that is not tracked: " + utteranceId);
                    return;
                }
                Request request = part.request;
                if (request.kind == KIND_FILE) {
                    pieceSynthesized(request);
                    return;
                }
                if (!part.isLast()) {
                    return;
                }

                _pending.remove(request);

                // Only the last request queued reports: with queue:true, "completed" means the
                // whole queue is done.
                if (isLatestRequest(request)) {
                    _isSpeakingProperty.set(false);
                    if (_isCanceling.get()) {
                        fireEventAsync("canceled", true, "Speech canceled", request, null, 0);
                        _isCanceling.set(false);
                    } else if (_isStopping.get()) {
                        fireEventAsync("stopped", true, "Speech stopped", request, null, 0);
                        _isStopping.set(false);
                    } else {
                        fireEventAsync("completed", true, "Speech completed", request, null, 0);
                    }

                    _currentUtteranceId = null;
                } else {
                    Log.d(_logName, "Ignoring onDone for old utterance: " + utteranceId + " (current: " + _latestUtteranceId + ")");
                }
                releaseFocusIfIdle();
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onError(String utteranceId) {
                onErrorInternal(utteranceId, TextToSpeech.ERROR);
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                onErrorInternal(utteranceId, errorCode);
            }

            @Override
            public void onRangeStart(String utteranceId, int start, int end, int frame) {
                Part part = utteranceId != null ? _parts.get(utteranceId) : null;
                if (part == null || part.request.kind == KIND_FILE) {
                    return;
                }
                Request request = part.request;
                int absoluteStart = part.request.baseOffset + part.offset + start;
                request.lastRange = absoluteStart;
                if (!hasListeners("wordstart")) {
                    return;
                }
                int from = Math.max(0, Math.min(start, part.text.length()));
                int to = Math.max(from, Math.min(end, part.text.length()));
                final HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("start", absoluteStart);
                event.put("end", part.request.baseOffset + part.offset + end);
                event.put("word", part.text.substring(from, to));
                event.put("utteranceId", request.id);
                postEvent("wordstart", event);
            }

            private void onErrorInternal(String utteranceId, int errorCode) {
                Log.e(_logName, "TTS Engine: utterance error - " + utteranceId + " (code: " + errorCode + ")");
                Part part = utteranceId != null ? _parts.get(utteranceId) : null;
                if (part == null) {
                    return;
                }
                failRequest(part.request, errorCodeFor(errorCode), errorCode, getErrorMessage(errorCode));
            }
        };
    }

    // An engine failure of a request: drops whatever is left of it and reports it, if it is the one the caller waits for
    private void failRequest(Request request, String code, int nativeCode, String message) {
        for (int i = 0; i < request.parts; i++) {
            _parts.remove(partId(request, i));
        }
        if (request.kind == KIND_FILE) {
            cleanPieces(request);
            fireSynthesized(request, false, null, code, nativeCode, message);
            return;
        }
        _pending.remove(request);
        if (!isLatestRequest(request)) {
            // An earlier part of a queue failed; the last part still reports when it ends.
            releaseFocusIfIdle();
            return;
        }
        _isSpeakingProperty.set(false);

        resetControlFlags();

        fireEventAsync("completed", false, message, request, code, nativeCode);
        releaseFocusIfIdle();
    }

    private static String partId(Request request, int index) {
        return request.parts > 1 ? request.id + "_" + index : request.id;
    }

    private static String errorCodeFor(int errorCode) {
        switch (errorCode) {
            case TextToSpeech.ERROR_SYNTHESIS:
                return ERROR_SYNTHESIS;
            case TextToSpeech.ERROR_SERVICE:
                return ERROR_SERVICE_ERROR;
            case TextToSpeech.ERROR_OUTPUT:
                return ERROR_AUDIO;
            case TextToSpeech.ERROR_NETWORK:
                return ERROR_NETWORK;
            case TextToSpeech.ERROR_NETWORK_TIMEOUT:
                return ERROR_TIMEOUT;
            case TextToSpeech.ERROR_INVALID_REQUEST:
                return ERROR_INVALID_ARGUMENT;
            case TextToSpeech.ERROR_NOT_INSTALLED_YET:
                return ERROR_LANGUAGE_UNAVAILABLE;
            case TextToSpeech.ERROR:
                return ERROR_SYNTHESIS;
            default:
                return ERROR_UNKNOWN;
        }
    }

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

    private void fireEventAsync(final String eventName, final boolean success, final String message) {
        fireEventAsync(eventName, success, message, null, null, 0);
    }

    // The event carries the data of the request it is about, or of the last one when it is about none (stopSpeaking())
    private void fireEventAsync(final String eventName, final boolean success, final String message,
        final Request request, final String code, final int nativeCode) {
        if (!hasListeners(eventName)) {
            return;
        }

        _mainHandler.post(new Runnable() {
            @Override
            public void run() {
                Request about = request != null ? request : _lastRequest;
                HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("success", success);
                event.put("message", message);
                if ("error".equals(eventName)) {
                    event.put("error", message);
                }
                event.put("speaking", _isSpeakingProperty.get());
                event.put("text", about != null ? about.fullText : "");
                event.put("voice", about != null ? about.voice : _voice);
                event.put("rate", about != null ? about.rate : _currentRate);
                event.put("pitch", about != null ? about.pitch : _currentPitch);
                if (request != null) {
                    event.put("utteranceId", request.id);
                }
                if (code != null) {
                    event.put("code", code);
                    event.put("nativeCode", nativeCode);
                }
                fireEvent(eventName, event);
                Log.d(_logName, "Event fired: " + eventName + " - " + message);
            }
        });
    }

    // An event with a payload of its own, fired from the main thread and only if the app listens
    private void postEvent(final String eventName, final HashMap<String, Object> event) {
        if (!hasListeners(eventName)) {
            return;
        }
        _mainHandler.post(new Runnable() {
            @Override
            public void run() {
                fireEvent(eventName, event);
            }
        });
    }

    // A failure that has no request: the call was refused before anything was queued
    private void fireError(String message, String code) {
        // A refused call answers like a failed one, as on iOS: "completed" with success false, then "error"
        fireEventAsync("completed", false, message, null, code, 0);
        fireEventAsync("error", false, message, null, code, 0);
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

                fireEventAsync("error", false, errorMsg, null, errorCodeFor(status), status);
                return;
            }

            if (status == TextToSpeech.SUCCESS) {
                _initSuccess.set(true);
                _isReady.set(true);
                _isInitializing.set(false);

                // Configurar listener optimizado
                _tts.setOnUtteranceProgressListener(createOptimizedUtteranceProgressListener());

                runOnTTSThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            // Configurar voz predeterminada
                            setupDefaultVoice();

                            // OPTIMIZACIÓN: Pre-calentar el motor TTS
                            warmUpTTS();
                        } catch (Exception error) {
                            handleInitError(error);
                        }
                    }
                });

                _initLatch.countDown();
                Log.i(_logName, "TTS initialized successfully");

                fireEventAsync("initialized", true, "TTS ready");
            }
        } catch (Exception error) {
            handleInitError(error);
        }
    }

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

    private void warmUpTTS() {
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            // Síntesis silenciosa para pre-calentar
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.0f);
            _tts.speak("", TextToSpeech.QUEUE_FLUSH, params, "warmup");
        }
    }

    private void handleInitError(Exception error) {
        _initSuccess.set(false);
        _isReady.set(false);
        _isInitializing.set(false);
        _initLatch.countDown();

        String errorMsg = "TTS initialization exception: " + error.getMessage();
        Log.e(_logName, errorMsg, error);
        fireEventAsync("error", false, errorMsg, null, ERROR_SERVICE_ERROR, 0);
    }

    @Kroll.getProperty
    @Kroll.method
    public Boolean isSpeaking() {
        if (_tts == null || !_isReady.get()) {
            return false;
        }

        // No Binder call: the UtteranceProgressListener and the start/stop methods keep this flag.
        return _isSpeakingProperty.get();
    }

    @Kroll.method
    public boolean isPaused() {
        return _paused;
    }

    /**
     * speaking: the engine has text it was asked for. paused: pauseSpeaking() stopped it and continueSpeaking() would
     * resume it. queued: texts waiting behind the one that speaks.
     */
    @Kroll.method
    public KrollDict getState() {
        KrollDict state = new KrollDict();
        boolean speaking = _isSpeakingProperty.get();
        state.put("speaking", speaking);
        state.put("paused", _paused);
        state.put("queued", Math.max(0, _pending.size() - (speaking ? 1 : 0)));
        return state;
    }

    /** The longest text the engine takes in one piece. Longer texts are cut into sentences by startSpeaking(). */
    @Kroll.method
    public int getMaxTextLength() {
        return TextToSpeech.getMaxSpeechInputLength();
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

    // ========================================
    // Speaking
    // ========================================

    @Kroll.method
    @SuppressWarnings({
        "rawtypes",
        "unchecked"
    })
    public void startSpeaking(HashMap hm) {
        final KrollDict args = new KrollDict(hm);

        if (!args.containsKeyAndNotNull("text") || args.getString("text").isEmpty()) {
            Log.e(_logName, "Text parameter is required");
            fireError("Text parameter is required", ERROR_INVALID_ARGUMENT);
            return;
        }

        if (!ready()) {
            Log.e(_logName, "TTS not initialized. Wait for 'initialized' event.");
            fireError("TTS not initialized", ERROR_NOT_READY);
            return;
        }

        if (_isStopping.get() || _isCanceling.get()) {
            resetControlFlags();
        }

        if (!args.optBoolean("queue", false)) {
            // A new text that cuts the old one off also drops what was paused
            _paused = false;
            _resume = null;
        }

        String text = args.getString("text");
        queueRequest(new Request(nextId(), KIND_SPEECH, args, text, 0, text));
    }

    private String nextId() {
        return "utterance_" + _utteranceCounter.incrementAndGet();
    }

    // Speaking from the moment it is queued, so a stopSpeaking() before onStart still stops it.
    private void queueRequest(final Request request) {
        request.voice = _voice;
        request.rate = _currentRate;
        request.pitch = _currentPitch;
        _lastRequest = request;
        _latestUtteranceId = request.id;
        _isSpeakingProperty.set(true);
        _pending.add(request);

        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                performSpeak(request);
            }
        });
    }

    private float rangedFloat(KrollDict args, String key, float min, float max, float fallback) {
        if (!args.containsKeyAndNotNull(key)) {
            return fallback;
        }
        float value = args.getDouble(key).floatValue();
        if (value < min || value > max) {
            Log.w(_logName, "Ignoring " + key + " " + value + ": it must be between " + min + " and " + max);
            return fallback;
        }
        return value;
    }

    // voiceId (a name from the "voices" event) wins; if that voice is no longer installed, fall back to
    // voice/language so the utterance is still spoken. Runs on the TTS thread.
    private void applyVoice(KrollDict args) {
        String requestedVoice = null;
        android.speech.tts.Voice byId = args.containsKeyAndNotNull("voiceId") ? findVoice(args.getString("voiceId")) : null;
        if (byId != null && !byId.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
            requestedVoice = args.getString("voiceId");
        } else if (args.containsKeyAndNotNull("voice") || args.containsKeyAndNotNull("language")) {
            requestedVoice = args.containsKeyAndNotNull("voice") ?
                args.getString("voice") : args.getString("language");

            // bestVoice: the highest-quality installed voice for that language instead of the
            // engine's default one.
            if (args.optBoolean("bestVoice", false)) {
                String best = bestVoiceFor(requestedVoice);
                if (best != null) {
                    requestedVoice = best;
                }
            }
        }

        if (requestedVoice != null && !requestedVoice.equals("auto") && !requestedVoice.equals(_voice)) {
            setVoiceOptimized(requestedVoice);
        }
    }

    // rate and pitch stay set in the engine until a later call changes them. pitchMultiplier is the iOS name of pitch.
    private void applyProsody(KrollDict args) {
        if (args.containsKeyAndNotNull("rate")) {
            double rateDouble = args.getDouble("rate");
            float rate = (float) rateDouble;
            if (rate != _currentRate) {
                _currentRate = rate;
                _tts.setSpeechRate(rate);
            }
        }

        String pitchKey = args.containsKeyAndNotNull("pitch") ? "pitch" :
            args.containsKeyAndNotNull("pitchMultiplier") ? "pitchMultiplier" : null;
        if (pitchKey != null) {
            double pitchDouble = args.getDouble(pitchKey);
            float pitch = (float) pitchDouble;
            if (pitch != _currentPitch) {
                _currentPitch = pitch;
                _tts.setPitch(pitch);
            }
        }
    }

    private static AudioAttributes attributesFor(String usage) {
        int value = AudioAttributes.USAGE_MEDIA;
        if ("notification".equals(usage)) {
            value = AudioAttributes.USAGE_NOTIFICATION;
        } else if ("alarm".equals(usage)) {
            value = AudioAttributes.USAGE_ALARM;
        } else if ("accessibility".equals(usage)) {
            value = AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY;
        } else if ("assistant".equals(usage) && Build.VERSION.SDK_INT >= 26) {
            value = SpeechApi26.USAGE_ASSISTANT;
        }
        return new AudioAttributes.Builder().setUsage(value).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    }

    // audioUsage stays set in the engine until a later call changes it; a call without it goes back to the default (media)
    private void applyAudioUsage(KrollDict args) {
        String usage = args.containsKeyAndNotNull("audioUsage") ? args.getString("audioUsage") : null;
        if (usage == null && _audioUsage == null) {
            return;
        }
        if (usage != null && usage.equals(_audioUsage)) {
            return;
        }
        _tts.setAudioAttributes(attributesFor(usage));
        _audioUsage = usage;
    }

    private void acquireFocus(KrollDict args) {
        if (!args.optBoolean("audioFocus", false)) {
            return;
        }
        synchronized(_focusLock) {
            if (_focusToken != null) {
                return;
            }
            AudioManager manager = (AudioManager) TiApplication.getInstance().getSystemService(Context.AUDIO_SERVICE);
            if (manager == null) {
                return;
            }
            AudioAttributes attributes = attributesFor(args.containsKeyAndNotNull("audioUsage") ? args.getString("audioUsage") : null);
            _focusListener = new AudioManager.OnAudioFocusChangeListener() {
                @Override
                public void onAudioFocusChange(int change) {
                    Log.d(_logName, "Audio focus changed: " + change);
                }
            };
            if (Build.VERSION.SDK_INT >= 26) {
                _focusToken = SpeechApi26.requestDucking(manager, attributes, _focusListener);
            } else {
                @SuppressWarnings("deprecation")
                int result = manager.requestAudioFocus(_focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
                _focusToken = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? Boolean.TRUE : null;
            }
        }
    }

    // Focus is released when nothing the engine was asked for is left
    private void releaseFocusIfIdle() {
        if (!_pending.isEmpty()) {
            return;
        }
        releaseFocus();
    }

    private void releaseFocus() {
        synchronized(_focusLock) {
            if (_focusToken == null) {
                return;
            }
            AudioManager manager = (AudioManager) TiApplication.getInstance().getSystemService(Context.AUDIO_SERVICE);
            if (manager != null) {
                if (Build.VERSION.SDK_INT >= 26) {
                    SpeechApi26.abandon(manager, _focusToken);
                } else {
                    @SuppressWarnings("deprecation")
                    int ignored = manager.abandonAudioFocus(_focusListener);
                }
            }
            _focusToken = null;
            _focusListener = null;
        }
    }

    // volume (0 to 1) and pan (-1 to 1) go with each utterance; the engine ignores a pan it cannot do
    private Bundle speakParams(KrollDict args) {
        Bundle params = new Bundle();
        float volume = rangedFloat(args, "volume", 0f, 1f, -1f);
        if (volume >= 0f) {
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
        }
        if (args.containsKeyAndNotNull("pan")) {
            float pan = rangedFloat(args, "pan", -1f, 1f, 2f);
            if (pan <= 1f) {
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, pan);
            }
        }
        return params;
    }

    private void performSpeak(Request request) {
        if (_tts == null) {
            failRequest(request, ERROR_NOT_READY, 0, "TTS not initialized");
            return;
        }

        final KrollDict args = request.args;

        // queue:true adds this text after the one being spoken instead of cutting it off.
        final boolean queue = args.optBoolean("queue", false);
        if (!queue) {
            if (_tts.isSpeaking()) {
                _tts.stop();
            }
            // The engine has one queue: flushing it also drops the files that were being synthesized
            cancelFileJobs();
            dropRequestsBefore(request);
        }

        applyVoice(args);
        applyProsody(args);
        applyAudioUsage(args);
        request.voice = _voice;
        request.rate = _currentRate;
        request.pitch = _currentPitch;
        acquireFocus(args);

        int result;
        if (request.kind == KIND_SILENCE) {
            long millis = args.getDouble("duration").longValue();
            _parts.put(request.id, new Part(request, 0, 0, ""));
            result = _tts.playSilentUtterance(millis, queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, request.id);
        } else {
            List<String> pieces = splitText(request);
            if (pieces == null) {
                return;
            }
            result = speakPieces(request, pieces, queue, speakParams(args));
        }

        if (result == TextToSpeech.ERROR) {
            Log.e(_logName, "Failed to queue speech");
            failRequest(request, ERROR_SYNTHESIS, TextToSpeech.ERROR, "Failed to queue speech");
        }
    }

    // A text longer than the engine accepts is cut at sentence ends and queued piece by piece, unless the
    // caller asked splitLongText:false. Returns null after reporting that it is too long.
    private List<String> splitText(Request request) {
        int max = TextToSpeech.getMaxSpeechInputLength();
        if (request.text.length() > max && !request.args.optBoolean("splitLongText", true)) {
            failRequest(request, ERROR_TEXT_TOO_LONG, 0, "The text has " + request.text.length() + " characters; the engine accepts " + max);
            return null;
        }
        Locale locale = _currentLocale != null ? _currentLocale : Locale.getDefault();
        return TextSplitter.split(request.text, max, locale);
    }

    private int speakPieces(Request request, List<String> pieces, boolean queue, Bundle params) {
        request.parts = pieces.size();
        Log.i(_logName, "Queueing " + request.id + " as " + pieces.size() + " piece(s) of " + request.text.length() + " characters");
        int offset = 0;
        int result = TextToSpeech.SUCCESS;
        for (int i = 0; i < pieces.size(); i++) {
            String piece = pieces.get(i);
            String id = partId(request, i);
            _parts.put(id, new Part(request, i, offset, piece));
            offset += piece.length();
            Bundle piecewise = new Bundle(params);
            piecewise.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
            int mode = (i == 0 && !queue) ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
            result = _tts.speak(piece, mode, piecewise, id);
            if (result == TextToSpeech.ERROR) {
                if (i > 0) {
                    // The pieces already queued would speak half a text
                    _tts.stop();
                }
                break;
            }
        }
        return result;
    }

    // A queue:false request cuts off everything queued before it
    private void dropRequestsBefore(Request request) {
        synchronized(_pending) {
            while (!_pending.isEmpty() && _pending.get(0) != request) {
                Request old = _pending.remove(0);
                for (int i = 0; i < old.parts; i++) {
                    _parts.remove(partId(old, i));
                }
            }
        }
    }

    /**
     * Silence in the queue, in milliseconds. { queue: true } adds it after what speaks; without it, it replaces it.
     */
    @Kroll.method
    @SuppressWarnings({
        "rawtypes",
        "unchecked"
    })
    public void playSilence(double milliseconds, @Kroll.argument(optional = true) HashMap hm) {
        if (!ready()) {
            fireError("TTS not initialized", ERROR_NOT_READY);
            return;
        }
        if (milliseconds < 0) {
            fireError("playSilence() takes a duration in milliseconds, zero or more", ERROR_INVALID_ARGUMENT);
            return;
        }
        KrollDict args = hm != null ? new KrollDict(hm) : new KrollDict();
        args.put("duration", milliseconds);
        queueRequest(new Request(nextId(), KIND_SILENCE, args, "", 0, ""));
    }

    /**
     * Plays a sound registered with addEarcon() in place of text. The engine reports no progress for an earcon, so
     * there are no started or completed events and it does not count as speaking. { queue: true } adds it after what
     * speaks; without it, it replaces it. A name nobody registered answers with an "error" event.
     */
    @Kroll.method
    @SuppressWarnings({
        "rawtypes",
        "unchecked"
    })
    public void playEarcon(final String name, @Kroll.argument(optional = true) HashMap hm) {
        if (!ready()) {
            fireError("TTS not initialized", ERROR_NOT_READY);
            return;
        }
        if (name == null || name.isEmpty()) {
            fireError("playEarcon() needs the name the earcon was registered with", ERROR_INVALID_ARGUMENT);
            return;
        }
        final KrollDict args = hm != null ? new KrollDict(hm) : new KrollDict();
        final boolean queue = args.optBoolean("queue", false);
        if (!queue) {
            _paused = false;
            _resume = null;
            _isSpeakingProperty.set(false);
            clearQueue();
        }
        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                if (_tts == null) {
                    fireError("TTS not initialized", ERROR_NOT_READY);
                    return;
                }
                applyAudioUsage(args);
                int result = _tts.playEarcon(name, queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, speakParams(args), nextId());
                if (result == TextToSpeech.ERROR) {
                    fireError("No earcon is registered as '" + name + "'", ERROR_INVALID_ARGUMENT);
                }
            }
        });
    }

    private final HashMap<String, String> _bestVoices = new HashMap<String, String>();

    /**
     * Name of the installed, offline voice with the highest quality for a language such as
     * "es_MX": same country first, then any country of that language. Cached per language.
     */
    private String bestVoiceFor(String language) {
        if (android.os.Build.VERSION.SDK_INT < 21 || _tts == null || language == null) {
            return null;
        }
        if (_bestVoices.containsKey(language)) {
            return _bestVoices.get(language);
        }

        Locale wanted = toLocale(language);
        java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
        android.speech.tts.Voice best = null;
        int bestScore = -1;

        if (voices != null) {
            for (android.speech.tts.Voice voice: voices) {
                if (voice.isNetworkConnectionRequired()
                    || voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
                    || !voice.getLocale().getLanguage().equals(wanted.getLanguage())) {
                    continue;
                }
                boolean sameCountry = voice.getLocale().getCountry().equalsIgnoreCase(wanted.getCountry());
                int score = (sameCountry ? 1000 : 0) + voice.getQuality();
                if (score > bestScore) {
                    bestScore = score;
                    best = voice;
                }
            }
        }

        String name = best != null ? best.getName() : null;
        _bestVoices.put(language, name);
        return name;
    }

    private android.speech.tts.Voice findVoice(String name) {
        if (android.os.Build.VERSION.SDK_INT < 21 || _tts == null || name == null) {
            return null;
        }
        java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
        if (voices == null) {
            return null;
        }
        for (android.speech.tts.Voice voice: voices) {
            if (voice.getName().equals(name)) {
                return voice;
            }
        }
        return null;
    }

    private static String qualityName(int quality) {
        return quality >= android.speech.tts.Voice.QUALITY_VERY_HIGH ? "premium" :
            quality >= android.speech.tts.Voice.QUALITY_HIGH ? "enhanced" : "default";
    }

    private static String latencyName(int latency) {
        if (latency <= android.speech.tts.Voice.LATENCY_VERY_LOW) {
            return "very_low";
        } else if (latency <= android.speech.tts.Voice.LATENCY_LOW) {
            return "low";
        } else if (latency <= android.speech.tts.Voice.LATENCY_NORMAL) {
            return "normal";
        } else if (latency <= android.speech.tts.Voice.LATENCY_HIGH) {
            return "high";
        }
        return "very_high";
    }

    /**
     * Installed, offline voices, delivered in a "voices" event. { includeNetwork: true } adds the voices that need
     * the network, { includeNotInstalled: true } the ones whose data is not on the device yet. Runs on the TTS thread
     * because getVoices() waits for the engine connection like every other TextToSpeech call.
     */
    @Kroll.method
    @SuppressWarnings({
        "rawtypes",
        "unchecked"
    })
    public void requestVoices(@Kroll.argument(optional = true) HashMap hm) {
        final KrollDict args = hm != null ? new KrollDict(hm) : new KrollDict();
        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                final List<KrollDict> list = new ArrayList<KrollDict>();
                boolean includeNetwork = args.optBoolean("includeNetwork", false);
                boolean includeNotInstalled = args.optBoolean("includeNotInstalled", false);

                if (android.os.Build.VERSION.SDK_INT >= 21 && waitForInit(INIT_TIMEOUT_MS) && _tts != null) {
                    java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
                    if (voices != null) {
                        for (android.speech.tts.Voice voice: voices) {
                            boolean installed = !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
                            if ((voice.isNetworkConnectionRequired() && !includeNetwork) || (!installed && !includeNotInstalled)) {
                                continue;
                            }
                            KrollDict info = new KrollDict();
                            info.put("id", voice.getName());
                            // Android voices have no first name; the language and the engine's own name tell them apart
                            info.put("name", voice.getLocale().getDisplayName() + " (" + voice.getName() + ")");
                            info.put("language", voice.getLocale().toLanguageTag());
                            info.put("quality", qualityName(voice.getQuality()));
                            info.put("networkRequired", voice.isNetworkConnectionRequired());
                            info.put("installed", installed);
                            info.put("latency", latencyName(voice.getLatency()));
                            info.put("features", voice.getFeatures().toArray(new String[0]));
                            list.add(info);
                        }
                    }
                }

                _mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        KrollDict event = new KrollDict();
                        event.put("voices", list.toArray());
                        fireEvent("voices", event);
                    }
                });
            }
        });
    }

    private void setVoiceOptimized(String requestedVoice) {
        _voice = requestedVoice;

        if (android.os.Build.VERSION.SDK_INT >= 21) {
            // Intentar establecer voz por nombre primero
            java.util.Set<android.speech.tts.Voice> voices = _tts.getVoices();
            if (voices != null) {
                for (android.speech.tts.Voice voice: voices) {
                    if (voice.getName().equals(requestedVoice)) {
                        _tts.setVoice(voice);
                        _currentLocale = voice.getLocale();
                        return;
                    }
                }
            }
        }

        // Fallback: set by locale
        Locale locale = toLocale(requestedVoice);
        if (_tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
            _tts.setLanguage(locale);
            _currentLocale = locale;
        } else {
            Log.w(_logName, "Requested voice/language not available: " + requestedVoice);
        }
    }

    // ========================================
    // Pause and resume
    // ========================================

    /**
     * Android's TextToSpeech has no pause, so it is emulated: the speech stops and the rest of the text, from the
     * word that was being said, is kept for continueSpeaking(). It works only when the engine reports the word it is
     * saying; without that, the answer is a "paused" event with success false and code "unsupported".
     */
    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void pauseSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        if (_paused) {
            fireEventAsync("paused", false, "Already paused", null, ERROR_INVALID_ARGUMENT, 0);
            return;
        }
        List<Request> unfinished;
        synchronized(_pending) {
            unfinished = new ArrayList<Request>(_pending);
        }
        if (!_isSpeakingProperty.get() || unfinished.isEmpty()) {
            fireEventAsync("paused", false, "Nothing is speaking", null, ERROR_INVALID_ARGUMENT, 0);
            return;
        }
        Request current = unfinished.get(0);
        if (current.kind != KIND_SPEECH || current.lastRange < 0) {
            Log.d(_logName, "Pause needs the engine to report the word it says");
            fireEventAsync("paused", false, "The speech engine does not report word positions, so pause is not available", current, ERROR_UNSUPPORTED, 0);
            return;
        }

        // The rest of the text of the request that speaks, from the word being said, and the requests waiting behind it
        final List<Request> remaining = new ArrayList<Request>();
        int from = Math.min(current.lastRange, current.fullText.length());
        remaining.add(new Request(null, KIND_SPEECH, current.args, current.fullText, from, current.fullText.substring(from)));
        for (int i = 1; i < unfinished.size(); i++) {
            Request waiting = unfinished.get(i);
            if (waiting.kind == KIND_SPEECH) {
                remaining.add(new Request(null, KIND_SPEECH, waiting.args, waiting.fullText, waiting.baseOffset, waiting.text));
            }
        }

        _paused = true;
        _resume = remaining;
        clearQueue();
        _isSpeakingProperty.set(false);
        final Request about = current;

        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                if (_tts != null) {
                    _tts.stop();
                }
                fireEventAsync("paused", true, "Speech paused", about, null, 0);
            }
        });
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void pauseSpeaking() {
        pauseSpeaking(null);
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void continueSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        final List<Request> remaining = _resume;
        if (!_paused || remaining == null || remaining.isEmpty()) {
            fireEventAsync("continued", false, "Nothing is paused", null, ERROR_INVALID_ARGUMENT, 0);
            return;
        }
        _paused = false;
        _resume = null;

        Request first = null;
        for (int i = 0; i < remaining.size(); i++) {
            Request saved = remaining.get(i);
            KrollDict args = new KrollDict(saved.args);
            args.put("text", saved.text);
            // The first one replaces whatever the engine has; the rest queue behind it, as they did
            args.put("queue", i > 0);
            Request resumed = new Request(nextId(), KIND_SPEECH, args, saved.fullText, saved.baseOffset, saved.text);
            if (first == null) {
                first = resumed;
            }
            queueRequest(resumed);
        }
        fireEventAsync("continued", true, "Speech continued", first, null, 0);
    }

    @Kroll.method
    public void continueSpeaking() {
        continueSpeaking(null);
    }

    // Forgets what the engine was asked for, without touching the engine
    private void clearQueue() {
        _latestUtteranceId = null;
        _pending.clear();
        cancelFileJobs();
        for (Map.Entry<String, Part> entry : _parts.entrySet()) {
            if (entry.getValue().request.kind != KIND_FILE) {
                _parts.remove(entry.getKey());
            }
        }
        releaseFocus();
    }

    @Kroll.method
    @SuppressWarnings("rawtypes")
    public void stopSpeaking(@Kroll.argument(optional = true) HashMap hm) {
        if (_tts == null) {
            fireEventAsync("stopped", true, "Already stopped");
            return;
        }

        final boolean wasSpeaking = _isSpeakingProperty.getAndSet(false);
        _paused = false;
        _resume = null;
        clearQueue();

        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                if (_tts == null) {
                    fireEventAsync("stopped", true, "Already stopped");
                    return;
                }

                // The flag was cleared on the caller's thread; a startSpeaking() queued after this
                // stop has already set it again, so it is not touched here.
                _isStopping.set(true);
                _tts.stop();
                _currentUtteranceId = null;

                fireEventAsync("stopped", true, wasSpeaking ? "Speech stopped" : "Already stopped");

                _isStopping.set(false);
            }
        });
    }

    @Kroll.method
    public void cancelSpeaking() {
        if (_tts == null) {
            fireEventAsync("canceled", true, "Already canceled");
            return;
        }

        final boolean wasSpeaking = _isSpeakingProperty.getAndSet(false);
        _paused = false;
        _resume = null;
        clearQueue();

        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                if (_tts == null) {
                    fireEventAsync("canceled", true, "Already canceled");
                    return;
                }

                // Same as stopSpeaking(): the flag belongs to whatever was queued after this.
                _isCanceling.set(true);
                _tts.stop();
                _currentUtteranceId = null;

                fireEventAsync("canceled", true, wasSpeaking ? "Speech canceled" : "Already canceled");

                _isCanceling.set(false);
            }
        });
    }

    // ========================================
    // Synthesis to a file
    // ========================================

    /**
     * Synthesizes a text into a WAV file and answers with the "synthesized" event. Options: text, file (a path, a
     * URL Titanium understands or a Ti.Filesystem.File; without it the file goes to the cache), voice, voiceId,
     * bestVoice, language, rate and pitch. The engine has one queue, so the file is made after what speaks, and a
     * speech with queue:false, stopSpeaking() or cancelSpeaking() cancels it.
     */
    @Kroll.method
    @SuppressWarnings({
        "rawtypes",
        "unchecked"
    })
    public void synthesizeToFile(HashMap hm) {
        final KrollDict args = new KrollDict(hm);
        String text = args.containsKeyAndNotNull("text") ? args.getString("text") : "";
        final Request request = new Request(nextId(), KIND_FILE, args, text, 0, text);
        request.voice = _voice;
        request.rate = _currentRate;
        request.pitch = _currentPitch;

        if (text.isEmpty()) {
            fireSynthesized(request, false, null, ERROR_INVALID_ARGUMENT, 0, "Text parameter is required");
            return;
        }
        if (!ready()) {
            fireSynthesized(request, false, null, ERROR_NOT_READY, 0, "TTS not initialized");
            return;
        }
        try {
            request.destinationGiven = args.containsKeyAndNotNull("file");
            if (request.destinationGiven) {
                request.destination = resolveDestination(args.get("file"));
            } else {
                request.destination = new File(TiApplication.getInstance().getCacheDir(), "utterance-" + System.currentTimeMillis() + ".wav");
            }
            File folder = request.destination.getParentFile();
            if (folder != null && !folder.exists() && !folder.mkdirs()) {
                throw new IOException("Unable to create " + folder);
            }
        } catch (IOException e) {
            fireSynthesized(request, false, null, ERROR_INVALID_FILE, 0, "Unable to write the file: " + e.getMessage());
            return;
        }

        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                performSynthesize(request);
            }
        });
    }

    // A Ti.Filesystem.File, a path, a file:// URL, or a Titanium URL. A path with no scheme is relative to the app's data folder.
    private File resolveDestination(Object value) throws IOException {
        File destination = null;
        if (value instanceof TiFileProxy) {
            destination = ((TiFileProxy) value).getBaseFile().getNativeFile();
        } else if (value instanceof String) {
            String path = (String) value;
            if (path.startsWith("/")) {
                destination = new File(path);
            } else if (path.startsWith("file://")) {
                destination = new File(Uri.parse(path).getPath());
            } else {
                TiBaseFile base = TiFileFactory.createTitaniumFile(path.contains("://") ? path : "appdata-private://" + path, false);
                destination = base != null ? base.getNativeFile() : null;
            }
        }
        if (destination == null) {
            throw new IOException("that location cannot be written");
        }
        if (destination.isDirectory()) {
            throw new IOException(destination + " is a folder");
        }
        return destination;
    }

    private void performSynthesize(Request request) {
        if (_tts == null) {
            failRequest(request, ERROR_NOT_READY, 0, "TTS not initialized");
            return;
        }
        applyVoice(request.args);
        applyProsody(request.args);
        request.voice = _voice;
        request.rate = _currentRate;
        request.pitch = _currentPitch;

        List<String> pieces = splitText(request);
        if (pieces == null) {
            return;
        }
        request.parts = pieces.size();
        Log.i(_logName, "Synthesizing " + request.id + " as " + pieces.size() + " piece(s) of " + request.text.length() + " characters");
        if (pieces.size() > 1) {
            request.pieces = new ArrayList<File>();
            for (int i = 0; i < pieces.size(); i++) {
                request.pieces.add(new File(TiApplication.getInstance().getCacheDir(), "utterance-" + request.id + "-" + i + ".wav"));
            }
        }
        int offset = 0;
        for (int i = 0; i < pieces.size(); i++) {
            String piece = pieces.get(i);
            String id = partId(request, i);
            _parts.put(id, new Part(request, i, offset, piece));
            offset += piece.length();
            File target = pieces.size() > 1 ? request.pieces.get(i) : request.destination;
            int result = _tts.synthesizeToFile(piece, new Bundle(), target, id);
            if (result == TextToSpeech.ERROR) {
                failRequest(request, ERROR_SYNTHESIS, TextToSpeech.ERROR, "The engine refused to synthesize the text");
                return;
            }
        }
    }

    // One piece of the text is written; when all of them are, the file is ready
    private void pieceSynthesized(final Request request) {
        if (request.piecesDone.incrementAndGet() < request.parts) {
            return;
        }
        // Joining the pieces reads and writes files: not on the engine's callback thread
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (request.pieces != null) {
                        WavFile.concat(request.pieces, request.destination);
                    }
                    WavFile info = WavFile.read(request.destination);
                    cleanPieces(request);
                    fireSynthesized(request, true, info, null, 0, null);
                } catch (IOException e) {
                    Log.e(_logName, "synthesizeToFile failed: " + e.getMessage());
                    cleanPieces(request);
                    request.destination.delete();
                    fireSynthesized(request, false, null, ERROR_SYNTHESIS, 0, "The engine wrote no audio: " + e.getMessage());
                }
            }
        }, "utterance-synth").start();
    }

    private void cleanPieces(Request request) {
        if (request.pieces != null) {
            for (File piece : request.pieces) {
                piece.delete();
            }
        }
    }

    // The engine drops these when its queue is flushed, so they are reported instead of left waiting
    private void cancelFileJobs() {
        java.util.LinkedHashSet<Request> jobs = new java.util.LinkedHashSet<Request>();
        for (Part part : _parts.values()) {
            if (part.request.kind == KIND_FILE) {
                jobs.add(part.request);
            }
        }
        for (Request job : jobs) {
            for (int i = 0; i < job.parts; i++) {
                _parts.remove(partId(job, i));
            }
            cleanPieces(job);
            if (job.destination != null && job.pieces == null) {
                job.destination.delete();
            }
            fireSynthesized(job, false, null, ERROR_CANCELED, 0, "Synthesis canceled because the speech queue was cleared");
        }
    }

    private void fireSynthesized(Request request, boolean success, WavFile info, String code, int nativeCode, String message) {
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", success);
        event.put("utteranceId", request.id);
        event.put("text", request.fullText);
        if (success) {
            event.put("file", request.destination.getAbsolutePath());
            event.put("duration", info.durationSeconds());
            event.put("format", "wav");
            event.put("sampleRate", info.sampleRate);
            event.put("channels", info.channels);
            event.put("bitsPerSample", info.bitsPerSample);
        } else {
            event.put("code", code);
            event.put("nativeCode", nativeCode);
            event.put("message", message);
            if (request.destination != null && request.destinationGiven) {
                event.put("file", request.destination.getAbsolutePath());
            }
        }
        postEvent("synthesized", event);
    }

    // ========================================
    // Recorded audio in place of text
    // ========================================

    /**
     * Registers an audio file to play when the text is spoken. The source is the name of a file in the app's
     * platform/android/res/raw folder, without the extension. The speech engine runs in another app and cannot open
     * the app's own files, so a path is refused. The answer is the "registered" event.
     */
    @Kroll.method
    public void addSpeech(final String text, final Object source) {
        registerSound(false, text, source);
    }

    /** Registers an audio file under a name that playEarcon() plays. Same source as addSpeech(). */
    @Kroll.method
    public void addEarcon(final String name, final Object source) {
        registerSound(true, name, source);
    }

    private void registerSound(final boolean earcon, final String key, final Object source) {
        final String kind = earcon ? "earcon" : "speech";
        if (key == null || key.isEmpty() || !(source instanceof String) || ((String) source).isEmpty()) {
            fireRegistered(kind, key, false, ERROR_INVALID_ARGUMENT, 0, "A name and the name of a file in res/raw are required");
            return;
        }
        if (!ready()) {
            fireRegistered(kind, key, false, ERROR_NOT_READY, 0, "TTS not initialized");
            return;
        }
        final String resourceName = (String) source;
        if (resourceName.contains("/") || resourceName.contains(".") || resourceName.contains(":")) {
            fireRegistered(kind, key, false, ERROR_INVALID_ARGUMENT, 0,
                "The speech engine cannot open the app's files. Put the audio in platform/android/res/raw and pass its name without the extension");
            return;
        }
        Context context = TiApplication.getInstance();
        final int resourceId = context.getResources().getIdentifier(resourceName, "raw", context.getPackageName());
        if (resourceId == 0) {
            fireRegistered(kind, key, false, ERROR_INVALID_FILE, 0, "There is no res/raw/" + resourceName + " in the app");
            return;
        }
        final String packageName = context.getPackageName();
        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                if (_tts == null) {
                    fireRegistered(kind, key, false, ERROR_NOT_READY, 0, "TTS not initialized");
                    return;
                }
                int result = earcon ? _tts.addEarcon(key, packageName, resourceId) : _tts.addSpeech(key, packageName, resourceId);
                if (result == TextToSpeech.SUCCESS) {
                    fireRegistered(kind, key, true, null, 0, null);
                } else {
                    fireRegistered(kind, key, false, ERROR_SYNTHESIS, result, "The engine refused the audio");
                }
            }
        });
    }

    private void fireRegistered(String kind, String key, boolean success, String code, int nativeCode, String message) {
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", success);
        event.put("kind", kind);
        event.put("key", key != null ? key : "");
        if (!success) {
            event.put("code", code);
            event.put("nativeCode", nativeCode);
            event.put("message", message);
        }
        postEvent("registered", event);
    }

    // ========================================
    // Lifecycle Methods
    // ========================================

    @Override
    public void onDestroy(Activity activity) {
        if (_tts != null) {
            runOnTTSThread(new Runnable() {
                @Override
                public void run() {
                    shutdownTTS();
                    Log.d(_logName, "TTS resources released");
                }
            });
        }
        _ttsExecutor.shutdown();
    }

    @Override
    public void onPause(Activity activity) {
        if (_tts != null && _isSpeakingProperty.getAndSet(false)) {
            clearQueue();
            runOnTTSThread(new Runnable() {
                @Override
                public void run() {
                    if (_tts != null) {
                        _tts.stop();
                    }
                }
            });
            fireEventAsync("paused", true, "Speech paused due to app pause");
        }
    }

    @Override
    public void onResume(Activity activity) {
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
        if (_tts != null && _isSpeakingProperty.getAndSet(false)) {
            clearQueue();
            runOnTTSThread(new Runnable() {
                @Override
                public void run() {
                    if (_tts != null) {
                        _tts.stop();
                    }
                }
            });
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
    public void propertiesChanged(List < KrollPropertyChange > changes, KrollProxy proxy) {
        // No-op
    }

    @Override
    public void propertyChanged(String key, Object oldValue, Object newValue, KrollProxy proxy) {
        // No-op
    }

    // ========================================
    // Modern APIs (API 21+)
    // ========================================

    @Kroll.method
    public Object[] getModernVoices() {
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21) {
            Log.w(_logName, "Modern voices API requires Android API 21+ and initialized TTS");
            return new Object[0];
        }

        if (!waitForInit(1000)) {
            Log.w(_logName, "TTS not ready. Call this method after 'initialized' event");
            return new Object[0];
        }

        try {
            java.util.Set < android.speech.tts.Voice > voices = _tts.getVoices();

            if (voices == null || voices.isEmpty()) {
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

            for (android.speech.tts.Voice voice: voices) {
                HashMap < String, Object > voiceInfo = new HashMap < > ();
                voiceInfo.put("name", voice.getName());
                voiceInfo.put("locale", voice.getLocale().toString());
                voiceInfo.put("quality", voice.getQuality());
                voiceInfo.put("isNetworkConnectionRequired", voice.isNetworkConnectionRequired());

                voiceInfo.put("language", voice.getLocale().getLanguage());
                voiceInfo.put("country", voice.getLocale().getCountry());

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
            java.util.Set < java.util.Locale > languages = _tts.getAvailableLanguages();

            if (languages == null || languages.isEmpty()) {
                Log.w(_logName, "No languages available");
                return new Object[0];
            }

            Object[] result = new Object[languages.size()];
            int index = 0;

            for (java.util.Locale locale: languages) {
                HashMap < String, Object > langInfo = new HashMap < > ();
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

    @Kroll.method
    public boolean isTTSReady() {
        return _tts != null && _isReady.get();
    }

    @Kroll.method
    public HashMap < String, Object > getEngineInfo() {
        HashMap < String, Object > info = new HashMap < > ();

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
                    HashMap < String, Object > voiceInfo = new HashMap < > ();
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

    @Kroll.method
    public void setEngine(final String enginePackage) {
        // Shut down on the TTS thread, then create on the main thread, in that order.
        runOnTTSThread(new Runnable() {
            @Override
            public void run() {
                shutdownTTS();

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
        });
    }

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
                _bestVoices.clear();
                _parts.clear();
                _pending.clear();
                releaseFocus();
            }
        }
    }

    @Kroll.method
    public void preloadVoiceData(final String language) {
        if (_tts == null || !_isReady.get()) {
            Log.w(_logName, "TTS not ready for preload");
            return;
        }

        if (android.os.Build.VERSION.SDK_INT >= 21) {
            runOnTTSThread(new Runnable() {
                @Override
                public void run() {
                    if (_tts == null) {
                        return;
                    }
                    Locale locale = toLocale(language);
                    Bundle params = new Bundle();
                    params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.0f);
                    _tts.setLanguage(locale);
                    _tts.speak(" ", TextToSpeech.QUEUE_ADD, params, "preload_" + language);
                    Log.d(_logName, "Preloading voice data for: " + language);
                }
            });
        }
    }

    @Kroll.method
    public int getEstimatedDuration(String text, float rate) {
        if (text == null || text.isEmpty()) {
            return 0;
        }

        String[] words = text.trim().split("\\s+");
        int wordCount = words.length;

        float adjustedRate = rate > 0 ? rate : 1.0f;

        int estimatedMs = (int)((wordCount / 2.5f) * 1000 / adjustedRate);

        int punctuationCount = text.length() - text.replace(".", "").replace(",", "")
            .replace("!", "").replace("?", "").length();
        estimatedMs += punctuationCount * 200;

        return estimatedMs;
    }

    @Kroll.method
    public boolean isNetworkRequired(String language) {
        if (_tts == null || android.os.Build.VERSION.SDK_INT < 21 || !_isReady.get()) {
            return false;
        }

        try {
            java.util.Set < android.speech.tts.Voice > voices = _tts.getVoices();
            if (voices != null) {
                Locale targetLocale = toLocale(language);
                for (android.speech.tts.Voice voice: voices) {
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

    @Kroll.method
    public HashMap < String, Object > getDiagnostics() {
        HashMap < String, Object > diagnostics = new HashMap < > ();

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
