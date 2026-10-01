/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import org.appcelerator.kroll.KrollDict;
import org.appcelerator.kroll.KrollPropertyChange;
import org.appcelerator.kroll.KrollProxy;
import org.appcelerator.kroll.KrollProxyListener;
import org.appcelerator.kroll.annotations.Kroll;
import org.appcelerator.titanium.TiApplication;
import org.appcelerator.titanium.TiBaseActivity;
import org.appcelerator.titanium.TiBlob;
import org.appcelerator.titanium.TiFileProxy;
import org.appcelerator.titanium.io.TiBaseFile;
import org.appcelerator.titanium.io.TiFileFactory;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class SpeechToTextProxy extends KrollProxy implements KrollProxyListener {
    @Kroll.constant
    public static final String LANGUAGE_MODEL_FREE_FORM = RecognizerIntent.LANGUAGE_MODEL_FREE_FORM;
    @Kroll.constant
    public static final String LANGUAGE_MODEL_WEB_SEARCH = RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH;

    @Kroll.constant
    public static final String TASK_HINT_DICTATION = "dictation";
    @Kroll.constant
    public static final String TASK_HINT_SEARCH = "search";
    @Kroll.constant
    public static final String TASK_HINT_CONFIRMATION = "confirmation";
    @Kroll.constant
    public static final String TASK_HINT_UNSPECIFIED = "unspecified";

    @Kroll.constant
    public static final String ERROR_NO_SPEECH = "no_speech";
    @Kroll.constant
    public static final String ERROR_PERMISSION_DENIED = "permission_denied";
    @Kroll.constant
    public static final String ERROR_NETWORK = "network";
    @Kroll.constant
    public static final String ERROR_AUDIO = "audio";
    @Kroll.constant
    public static final String ERROR_BUSY = "busy";
    @Kroll.constant
    public static final String ERROR_UNAVAILABLE = "unavailable";
    @Kroll.constant
    public static final String ERROR_LANGUAGE_UNSUPPORTED = "language_unsupported";
    @Kroll.constant
    public static final String ERROR_LANGUAGE_UNAVAILABLE = "language_unavailable";
    @Kroll.constant
    public static final String ERROR_ON_DEVICE_UNAVAILABLE = "on_device_unavailable";
    @Kroll.constant
    public static final String ERROR_TOO_MANY_REQUESTS = "too_many_requests";
    @Kroll.constant
    public static final String ERROR_DISABLED = "disabled";
    @Kroll.constant
    public static final String ERROR_SERVICE_ERROR = "service_error";
    @Kroll.constant
    public static final String ERROR_CANCELED = "canceled";
    @Kroll.constant
    public static final String ERROR_TIMEOUT = "timeout";
    @Kroll.constant
    public static final String ERROR_INVALID_ARGUMENT = "invalid_argument";
    @Kroll.constant
    public static final String ERROR_INVALID_FILE = "invalid_file";
    @Kroll.constant
    public static final String ERROR_LANGUAGE_MODEL_INVALID = "language_model_invalid";
    @Kroll.constant
    public static final String ERROR_UNSUPPORTED = "unsupported";
    @Kroll.constant
    public static final String ERROR_UNKNOWN = "unknown";

    private static final String LOG_TAG = UtteranceModule.MODULE_FULL_NAME;
    private static final String MAX_RESULTS = "maxResults";
    private static final String LANGUAGE_MODEL = "languageModel";
    private static final String LANGUAGE = "language";
    private static final String SILENCE_TIMEOUT = "silenceTimeout";
    private static final String NO_SPEECH_TIMEOUT = "noSpeechTimeout";
    private static final String EVENT_COMPLETED = "completed";
    private static final String EVENT_STARTED = "started";
    private static final String SOURCE_MICROPHONE = "microphone";
    private static final String SOURCE_BUFFER = "buffer";
    private static final String SOURCE_FILE = "file";
    // Only the lower 16 bits of a request code reach onRequestPermissionsResult
    private static final int PERMISSION_REQUEST_CODE = 0x5554;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Executor mainExecutor = new Executor() {
        @Override
        public void execute(Runnable command) {
            mainHandler.post(command);
        }
    };
    private Boolean _isSupported = true;

    // Everything below is only touched on the main thread, which SpeechRecognizer needs anyway.
    // The session is what makes a late callback from a recognizer that was already replaced or canceled harmless.
    private SpeechRecognizer recognizer;
    private SpeechRecognizer downloadRecognizer;
    private boolean listening = false;
    private boolean permissionRequestPending = false;
    private int sessionCounter = 0;
    private Session session;
    // Seconds, or 0 when the app did not ask for one (the recognizer then decides)
    private double silenceTimeout = 0;
    private double noSpeechTimeout = 0;
    private final Runnable endOfSpeech = new Runnable() {
        @Override
        public void run() {
            if (recognizer != null && listening) {
                recognizer.stopListening();
            }
        }
    };

    private static final class Session {
        final int id;
        final KrollDict options;
        final String source;
        String language;
        boolean partialEvents = true;
        boolean wantSegments = false;
        boolean wantAlternatives = false;
        boolean preferOffline = false;
        boolean segmented = false;
        long levelIntervalMillis = 100;
        long lastLevelMillis = 0;
        String lastPartial;
        ArrayList<String> segmentTexts = new ArrayList<String>();
        AudioFeeder feeder;
        PcmConverter converter;
        AudioFileDecoder decoder;
        ParcelFileDescriptor readEnd;
        File temporaryFile;

        Session(int id, KrollDict options, String source) {
            this.id = id;
            this.options = options;
            this.source = source;
        }
    }

    public SpeechToTextProxy() {
        super();
        _isSupported = SpeechRecognizer.isRecognitionAvailable(TiApplication.getInstance());
    }

    @Kroll.method
    @Kroll.getProperty
    public Boolean isSupported() {
        return _isSupported;
    }

    @Kroll.method
    @Deprecated
    public Boolean isSupport() {
        return isSupported();
    }

    // The recognizer service can change a language's availability at any moment and Android has no way to ask about a
    // single language synchronously, so the argument is accepted and ignored.
    @Kroll.method
    public Boolean isAvailable(@Kroll.argument(optional = true) String language) {
        return _isSupported;
    }

    @Kroll.method
    public Boolean supportsOnDevice(@Kroll.argument(optional = true) String language) {
        return Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(TiApplication.getInstance());
    }

    @Kroll.method
    public KrollDict getPermissionStatus() {
        return permissionSnapshot();
    }

    @Kroll.method
    public void requestPermissions() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (hasMicrophonePermission()) {
                    firePermissions();
                    return;
                }
                if (permissionRequestPending) {
                    return;
                }
                Activity activity = TiApplication.getAppCurrentActivity();
                if (activity == null) {
                    firePermissions();
                    return;
                }
                permissionRequestPending = true;
                TiBaseActivity.registerPermissionRequestCallback(PERMISSION_REQUEST_CODE, new TiBaseActivity.OnRequestPermissionsResultCallback() {
                    @Override
                    public void onRequestPermissionsResult(TiBaseActivity activity, int requestCode, String[] permissions, int[] grantResults) {
                        TiBaseActivity.unregisterPermissionRequestCallback(PERMISSION_REQUEST_CODE);
                        permissionRequestPending = false;
                        firePermissions();
                    }
                });
                activity.requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, PERMISSION_REQUEST_CODE);
            }
        });
    }

    // Android 13 and later report the languages; older versions answer with checked false and an empty list
    @Kroll.method
    public void requestSupportedLanguages() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT < 33 || !_isSupported) {
                    HashMap<String, Object> event = new HashMap<String, Object>();
                    event.put("success", true);
                    event.put("checked", false);
                    event.put("languages", new Object[0]);
                    fire("languages", event);
                    return;
                }
                final SpeechRecognizer checker = SpeechRecognizer.createSpeechRecognizer(TiApplication.getInstance());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                // On the OPPO CPH2639 one call got error 14 (cannot check support) and then two successful answers.
                // The first success wins and later calls are ignored; an error is held for a moment in case a success follows.
                final boolean[] answered = { false };
                final Runnable[] pendingFailure = { null };
                SpeechApi33.checkSupport(checker, intent, mainExecutor, new SpeechApi33.LanguagesReporter() {
                    @Override
                    public void report(final Object[] languages, final int errorCode) {
                        if (answered[0]) {
                            return;
                        }
                        if (errorCode != 0) {
                            if (pendingFailure[0] == null) {
                                pendingFailure[0] = new Runnable() {
                                    @Override
                                    public void run() {
                                        if (answered[0]) {
                                            return;
                                        }
                                        answered[0] = true;
                                        checker.destroy();
                                        HashMap<String, Object> event = new HashMap<String, Object>();
                                        event.put("success", false);
                                        event.put("checked", false);
                                        event.put("code", codeForError(errorCode));
                                        event.put("nativeCode", errorCode);
                                        event.put("message", "Unable to check language support: " + describeError(errorCode));
                                        event.put("languages", new Object[0]);
                                        fire("languages", event);
                                    }
                                };
                                mainHandler.postDelayed(pendingFailure[0], 3000);
                            }
                            return;
                        }
                        answered[0] = true;
                        if (pendingFailure[0] != null) {
                            mainHandler.removeCallbacks(pendingFailure[0]);
                        }
                        checker.destroy();
                        HashMap<String, Object> event = new HashMap<String, Object>();
                        event.put("success", true);
                        event.put("checked", true);
                        event.put("languages", languages);
                        fire("languages", event);
                    }
                });
            }
        });
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    @Kroll.method
    public void startSpeechToText(HashMap hm) {
        final KrollDict args = (hm != null) ? new KrollDict(hm) : new KrollDict();
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                startListening(args, audioSourceOf(args), null);
            }
        });
    }

    private static String audioSourceOf(KrollDict args) {
        return SOURCE_BUFFER.equals(args.optString("audioSource", SOURCE_MICROPHONE)) ? SOURCE_BUFFER : SOURCE_MICROPHONE;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    @Kroll.method
    public void transcribeFile(final Object file, @Kroll.argument(optional = true) HashMap hm) {
        final KrollDict args = (hm != null) ? new KrollDict(hm) : new KrollDict();
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                startListening(args, SOURCE_FILE, file);
            }
        });
    }

    // PCM 16-bit little endian in the sampleRate and channels given to startSpeechToText()
    @Kroll.method
    public void appendAudio(Object data) {
        final byte[] bytes;
        if (data instanceof TiBlob) {
            bytes = ((TiBlob) data).getBytes();
        } else if (data instanceof ti.modules.titanium.BufferProxy) {
            bytes = ((ti.modules.titanium.BufferProxy) data).getBuffer();
        } else {
            return;
        }
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (session != null && listening && SOURCE_BUFFER.equals(session.source) && session.feeder != null) {
                    session.feeder.write(session.converter.convert(bytes));
                } else {
                    Log.d(LOG_TAG, "appendAudio ignored: no buffer session is waiting for audio");
                }
            }
        });
    }

    // Speech recognizers read PCM 16-bit; 16 kHz mono is what they use natively
    @Kroll.method
    public KrollDict getNativeAudioFormat() {
        KrollDict format = new KrollDict();
        format.put("sampleRate", 16000);
        format.put("channels", 1);
        return format;
    }

    @Kroll.method
    public KrollDict getState() {
        KrollDict state = new KrollDict();
        state.put("state", listening ? "running" : "idle");
        state.put("listening", listening);
        return state;
    }

    @Kroll.method
    public void stopRecording() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (session != null && session.feeder != null) {
                    // The recognizer sees the end of the audio after what was already queued
                    session.feeder.finish();
                }
                if (recognizer != null && listening) {
                    // The final result still arrives through onResults
                    recognizer.stopListening();
                }
            }
        });
    }

    // Unlike stopRecording(), the result is discarded and completed never fires
    @Kroll.method
    public void cancelRecording() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                finishListening();
                HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("success", true);
                fire("canceled", event);
            }
        });
    }

    // The model for a language is downloaded by the system's speech service. API 34 reports progress; 33 only starts it.
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Kroll.method
    public void downloadLanguage(HashMap hm) {
        final KrollDict args = (hm != null) ? new KrollDict(hm) : new KrollDict();
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                final String language = args.optString(LANGUAGE, Locale.getDefault().toLanguageTag());
                if (Build.VERSION.SDK_INT < 33 || !_isSupported) {
                    fireDownload(language, "error", 0, "unsupported", 0, "Language downloads need Android 13");
                    return;
                }
                if (downloadRecognizer != null) {
                    downloadRecognizer.destroy();
                }
                Context context = TiApplication.getInstance();
                downloadRecognizer = (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context))
                        ? SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                        : SpeechRecognizer.createSpeechRecognizer(context);
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                try {
                    if (Build.VERSION.SDK_INT >= 34) {
                        SpeechApi34.triggerModelDownload(downloadRecognizer, intent, mainExecutor, new SpeechApi34.DownloadReporter() {
                            @Override
                            public void report(String state, int progress, int errorCode) {
                                if ("error".equals(state)) {
                                    fireDownload(language, state, progress, codeForError(errorCode), errorCode, "Language download failed: " + describeError(errorCode));
                                } else {
                                    fireDownload(language, state, progress, null, 0, null);
                                }
                                if ("success".equals(state) || "error".equals(state)) {
                                    destroyDownloadRecognizer();
                                }
                            }
                        });
                    } else {
                        SpeechApi33.triggerModelDownload(downloadRecognizer, intent);
                        fireDownload(language, "requested", 0, null, 0, null);
                    }
                } catch (Exception error) {
                    destroyDownloadRecognizer();
                    fireDownload(language, "error", 0, "service_error", 0, "Language download failed: " + error.getMessage());
                }
            }
        });
    }

    // Custom language models are an iOS feature
    @SuppressWarnings({"rawtypes"})
    @Kroll.method
    public void prepareCustomLanguageModel(@Kroll.argument(optional = true) HashMap hm) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("success", false);
                event.put("code", "unsupported");
                event.put("message", "Custom language models are only available on iOS");
                fire("languagemodel", event);
            }
        });
    }

    @Override
    public void release() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                finishListening();
                destroyDownloadRecognizer();
            }
        });
        super.release();
    }

    private void destroyDownloadRecognizer() {
        if (downloadRecognizer != null) {
            downloadRecognizer.destroy();
            downloadRecognizer = null;
        }
    }

    private boolean hasMicrophonePermission() {
        return TiApplication.getInstance().checkCallingOrSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private KrollDict permissionSnapshot() {
        boolean granted = hasMicrophonePermission();
        KrollDict snapshot = new KrollDict();
        snapshot.put("granted", granted);
        // Android cannot tell "never asked" from "denied" without an activity, so there is no undetermined here
        snapshot.put("status", granted ? "granted" : "denied");
        snapshot.put("microphone", granted ? "granted" : "denied");
        return snapshot;
    }

    private void firePermissions() {
        KrollDict event = permissionSnapshot();
        event.put("success", true);
        fire("permissions", event);
    }

    // Events fire only when the app has a listener at that moment
    private void fire(String name, HashMap<String, Object> payload) {
        if (hasListeners(name)) {
            fireEvent(name, payload);
        }
    }

    private void fireDownload(String language, String state, int progress, String code, int nativeCode, String message) {
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", !"error".equals(state));
        event.put("language", language);
        event.put("state", state);
        event.put("progress", progress);
        if (code != null) {
            event.put("code", code);
            event.put("nativeCode", nativeCode);
            event.put("message", message);
        }
        fire("download", event);
    }

    private ArrayList<String> stringList(KrollDict args, String key) {
        Object value = args.get(key);
        if (!(value instanceof Object[])) {
            return null;
        }
        ArrayList<String> list = new ArrayList<String>();
        for (Object item : (Object[]) value) {
            if (item != null) {
                list.add(String.valueOf(item));
            }
        }
        return list;
    }

    // The one place that turns the options into an intent. Each extra is guarded by the API level that introduced it
    // and logged, so a logcat shows which options reached the recognizer.
    private Intent buildIntent(KrollDict args, Session s, Context context) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());

        String taskHint = args.optString("taskHint", null);
        String model;
        if (taskHint != null) {
            model = TASK_HINT_SEARCH.equals(taskHint) ? RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH : RecognizerIntent.LANGUAGE_MODEL_FREE_FORM;
        } else {
            model = args.optString(LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        }
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, model);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, args.optInt(MAX_RESULTS, 10));
        if (args.containsKeyAndNotNull(LANGUAGE)) {
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, args.getString(LANGUAGE));
        }

        // Partial results are also what the silence timers listen to, so they stay on while either timer is set
        s.partialEvents = args.optBoolean("partialResults", true);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, s.partialEvents || silenceTimeout > 0 || noSpeechTimeout > 0);

        if (silenceTimeout > 0) {
            // The recognizer may ignore these hints, so the module also ends the session itself
            long silenceMillis = (long) (silenceTimeout * 1000);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, silenceMillis);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, silenceMillis);
        }
        if (args.containsKeyAndNotNull("minimumLength")) {
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, args.getDouble("minimumLength").longValue());
        }

        Object onDevice = args.get("onDevice");
        if ("prefer".equals(onDevice) || (onDevice != null && args.optBoolean("onDevice", false))) {
            // Before API 31 there is no on-device recognizer to ask for, so this is only a preference
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            s.preferOffline = "prefer".equals(onDevice);
        }

        if (Build.VERSION.SDK_INT >= 33) {
            ArrayList<String> strings = stringList(args, "contextualStrings");
            if (strings != null && !strings.isEmpty()) {
                intent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, strings);
            }
            if (args.optBoolean("punctuation", false)) {
                intent.putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY);
                intent.putExtra(RecognizerIntent.EXTRA_HIDE_PARTIAL_TRAILING_PUNCTUATION, true);
            }
            if (args.optBoolean("maskOffensiveWords", false)) {
                intent.putExtra(RecognizerIntent.EXTRA_MASK_OFFENSIVE_WORDS, true);
            }
            if (args.optBoolean("segmentedSession", false)) {
                intent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, true);
                s.segmented = true;
                // Segments end at a pause, so the recognizer needs a pause length even when the app gave none
                if (silenceTimeout <= 0) {
                    intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
                }
            }
            if (args.optBoolean("biasDeviceContext", false)) {
                intent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
            }
        }

        if (Build.VERSION.SDK_INT >= 34) {
            if (s.wantSegments) {
                intent.putExtra(RecognizerIntent.EXTRA_REQUEST_WORD_TIMING, true);
                intent.putExtra(RecognizerIntent.EXTRA_REQUEST_WORD_CONFIDENCE, true);
            }
            ArrayList<String> allowed = stringList(args, "allowedLanguages");
            if (args.optBoolean("detectLanguage", false)) {
                intent.putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true);
                if (allowed != null) {
                    intent.putStringArrayListExtra(RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES, allowed);
                }
            }
            Object switchLanguages = args.get("switchLanguages");
            if (switchLanguages != null && !Boolean.FALSE.equals(switchLanguages)) {
                String sensitivity = RecognizerIntent.LANGUAGE_SWITCH_BALANCED;
                if ("highPrecision".equals(switchLanguages)) {
                    sensitivity = RecognizerIntent.LANGUAGE_SWITCH_HIGH_PRECISION;
                } else if ("quickResponse".equals(switchLanguages)) {
                    sensitivity = RecognizerIntent.LANGUAGE_SWITCH_QUICK_RESPONSE;
                }
                intent.putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH, sensitivity);
                if (allowed != null) {
                    intent.putStringArrayListExtra(RecognizerIntent.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES, allowed);
                }
            }
        }
        if (Build.VERSION.SDK_INT >= 35) {
            if (args.containsKeyAndNotNull("maxLanguageSwitches")) {
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_SWITCH_MAX_SWITCHES, args.getInt("maxLanguageSwitches"));
            }
            if (args.containsKeyAndNotNull("languageSwitchInitialDuration")) {
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_SWITCH_INITIAL_ACTIVE_DURATION_TIME_MILLIS, args.getDouble("languageSwitchInitialDuration").longValue());
            }
        }
        return intent;
    }

    // Opens the recognizer. The source is the microphone, a pipe the app feeds (buffer) or a decoded file.
    private void startListening(KrollDict args, String source, Object file) {
        if (!_isSupported) {
            fireFailure(null, "Speech recognition is not supported on this device", "unsupported", 0);
            return;
        }
        if (listening) {
            Log.d(LOG_TAG, "Speech recognition already in progress");
            return;
        }
        Context context = TiApplication.getInstance();
        if (!hasMicrophonePermission()) {
            fireFailure(null, "Microphone permission not granted", "permission_denied", 0);
            return;
        }

        Session s = new Session(++sessionCounter, args, source);
        s.wantSegments = args.optBoolean("segments", false);
        s.wantAlternatives = args.optBoolean("alternatives", false);
        s.levelIntervalMillis = Math.max(10, (long) args.optInt("audioLevelInterval", 100));
        s.language = args.containsKeyAndNotNull(LANGUAGE) ? args.getString(LANGUAGE) : Locale.getDefault().toLanguageTag();
        // The timers listen to the audio the microphone hears, so a buffer or file session only gets them when the app asks
        silenceTimeout = args.containsKeyAndNotNull(SILENCE_TIMEOUT) ? args.getDouble(SILENCE_TIMEOUT) : 0;
        noSpeechTimeout = args.containsKeyAndNotNull(NO_SPEECH_TIMEOUT) ? args.getDouble(NO_SPEECH_TIMEOUT) : 0;

        try {
            Intent intent = buildIntent(args, s, context);

            if (!SOURCE_MICROPHONE.equals(source)) {
                if (Build.VERSION.SDK_INT < 33) {
                    fireFailure(s, "Audio that does not come from the microphone needs Android 13", "unsupported", 0);
                    return;
                }
                ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
                s.readEnd = pipe[0];
                s.feeder = new AudioFeeder(pipe[1]);
                if (SOURCE_FILE.equals(source)) {
                    File audio = materializeFile(s, file);
                    if (audio == null) {
                        discardAudio(s);
                        fireFailure(s, "The audio file does not exist", "invalid_file", 0);
                        return;
                    }
                    try {
                        s.decoder = AudioFileDecoder.probe(audio.getPath(), s.feeder);
                    } catch (IOException error) {
                        discardAudio(s);
                        fireFailure(s, "The audio file cannot be read: " + error.getMessage(), "invalid_file", 0);
                        return;
                    }
                    final Session decoding = s;
                    s.decoder.setOnFinished(new Runnable() {
                        @Override
                        public void run() {
                            mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    watchForResult(decoding);
                                }
                            });
                        }
                    });
                } else {
                    s.converter = new PcmConverter(args.optInt("sampleRate", PcmConverter.TARGET_RATE), args.optInt("channels", 1));
                }
                // The recognizer only answered 16 kHz mono, so the audio is converted to that before it enters the pipe
                intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, s.readEnd);
                intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
                intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
                intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, PcmConverter.TARGET_RATE);
            }
            Log.d(LOG_TAG, "Speech recognition extras: " + intent.getExtras());

            Object onDevice = args.get("onDevice");
            boolean requireOnDevice = onDevice != null && !"prefer".equals(onDevice) && args.optBoolean("onDevice", false);
            if (requireOnDevice && Build.VERSION.SDK_INT >= 31) {
                if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
                    discardAudio(s);
                    fireFailure(s, "On-device recognition is not available on this device", "on_device_unavailable", 0);
                    return;
                }
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context);
            } else {
                recognizer = SpeechRecognizer.createSpeechRecognizer(context);
            }
            session = s;
            recognizer.setRecognitionListener(new SessionListener(s));
            listening = true;
            recognizer.startListening(intent);
            if (s.decoder != null) {
                new Thread(s.decoder, "utterance-decoder").start();
            }
        } catch (Exception error) {
            Log.e(LOG_TAG, String.valueOf(error.getMessage()));
            session = s;
            finishListening();
            fireFailure(s, "Unable to start speech recognition: " + error.getMessage(), "service_error", 0);
        }
    }

    // A file proxy, a path, a URL Titanium understands, or a blob. The decoder needs a real file, so anything that
    // is not one (an app asset, a blob) is copied to the cache and removed when the session ends.
    private File materializeFile(Session s, Object file) throws IOException {
        Context context = TiApplication.getInstance();
        TiBaseFile base = null;
        if (file instanceof TiFileProxy) {
            base = ((TiFileProxy) file).getBaseFile();
        } else if (file instanceof String) {
            String path = (String) file;
            if (path.startsWith("/")) {
                File plain = new File(path);
                return plain.exists() ? plain : null;
            }
            // A path with no scheme is relative to the app's Resources folder, like in Ti.Filesystem.getFile()
            base = TiFileFactory.createTitaniumFile(path.contains("://") ? path : "app://" + path, false);
        }
        InputStream in = null;
        if (file instanceof TiBlob) {
            in = ((TiBlob) file).getInputStream();
        } else if (base != null) {
            File native_ = base.getNativeFile();
            if (native_ != null && native_.exists() && native_.canRead()) {
                return native_;
            }
            if (!base.exists()) {
                return null;
            }
            in = base.getInputStream();
        }
        if (in == null) {
            return null;
        }
        File copy = File.createTempFile("utterance-", ".audio", context.getCacheDir());
        OutputStream out = new FileOutputStream(copy);
        try {
            byte[] chunk = new byte[16384];
            int count;
            while ((count = in.read(chunk)) > 0) {
                out.write(chunk, 0, count);
            }
        } finally {
            out.close();
            in.close();
        }
        s.temporaryFile = copy;
        return copy;
    }

    private void discardAudio(Session s) {
        if (s.feeder != null) {
            s.feeder.abort();
            s.feeder = null;
        }
        if (s.decoder != null) {
            s.decoder.stop();
            s.decoder = null;
        }
        if (s.readEnd != null) {
            try {
                s.readEnd.close();
            } catch (IOException ignored) {
            }
            s.readEnd = null;
        }
        if (s.temporaryFile != null) {
            s.temporaryFile.delete();
            s.temporaryFile = null;
        }
    }

    // Once the whole file is in the pipe the recognizer owes a result. If none comes, the session would wait forever.
    private static final long FILE_RESULT_TIMEOUT_MILLIS = 20000;

    private void watchForResult(final Session s) {
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (session == s && listening) {
                    finishListening();
                    fireFailure(s, "The recognizer did not answer after the whole file was sent", "timeout", 0);
                }
            }
        }, FILE_RESULT_TIMEOUT_MILLIS);
    }

    // Ends the session after a pause. A value of 0 or less cancels the timer.
    private void armEndOfSpeech(double seconds) {
        mainHandler.removeCallbacks(endOfSpeech);
        // A segmented session lasts until stopRecording(), so the module's own pause timers stay out of it
        if (seconds > 0 && listening && !(session != null && session.segmented)) {
            mainHandler.postDelayed(endOfSpeech, (long) (seconds * 1000));
        }
    }

    // The only way out of a session: completed, failed, canceled and released all end here. It can run twice.
    private void finishListening() {
        mainHandler.removeCallbacks(endOfSpeech);
        listening = false;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        if (session != null) {
            discardAudio(session);
            session = null;
        }
    }

    private final class SessionListener implements RecognitionListener {
        private final Session mine;

        SessionListener(Session mine) {
            this.mine = mine;
        }

        // A recognizer that was replaced, canceled or destroyed can still deliver a callback
        private boolean current() {
            return session == mine;
        }

        @Override
        public void onReadyForSpeech(Bundle params) {
            if (!current()) {
                return;
            }
            armEndOfSpeech(noSpeechTimeout);
            fireStarted(mine);
        }

        @Override
        public void onBeginningOfSpeech() {
            if (!current()) {
                return;
            }
            // Speech started, so the no-speech timer is over
            mainHandler.removeCallbacks(endOfSpeech);
            fire("speechstart", new HashMap<String, Object>());
        }

        @Override
        public void onRmsChanged(float rmsdB) {
            if (!current() || !hasListeners("audiolevel")) {
                return;
            }
            long now = android.os.SystemClock.uptimeMillis();
            if (now - mine.lastLevelMillis < mine.levelIntervalMillis) {
                return;
            }
            mine.lastLevelMillis = now;
            // The recognizer reports roughly -2 to 10 dB; the scale is not calibrated against a reference
            float level = Math.min(Math.max((rmsdB + 2f) / 12f, 0f), 1f);
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("level", level);
            event.put("decibels", rmsdB);
            fire("audiolevel", event);
        }

        @Override
        public void onBufferReceived(byte[] buffer) {
        }

        @Override
        public void onEndOfSpeech() {
            if (!current()) {
                return;
            }
            fire("speechend", new HashMap<String, Object>());
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            if (!current()) {
                return;
            }
            ArrayList<String> partial = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (partial == null || partial.isEmpty() || partial.get(0).isEmpty()) {
                return;
            }
            String text = partial.get(0);
            armEndOfSpeech(silenceTimeout);
            if (mine.partialEvents && !text.equals(mine.lastPartial)) {
                mine.lastPartial = text;
                HashMap<String, Object> event = new HashMap<String, Object>();
                event.put("text", text);
                event.put("words", new Object[] { text });
                fire("partial", event);
            }
        }

        @Override
        public void onResults(Bundle results) {
            if (!current()) {
                return;
            }
            ArrayList<String> alternatives = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
            Log.d(LOG_TAG, "Final results: " + alternatives + ", keys " + results.keySet());
            if ((alternatives == null || alternatives.isEmpty()) && mine.lastPartial != null) {
                // Some recognizers close an injected audio stream with an empty final result after real partials
                alternatives = new ArrayList<String>();
                alternatives.add(mine.lastPartial);
            }
            Session finished = mine;
            finishListening();
            fireResults(finished, alternatives, scores, results);
        }

        @Override
        public void onSegmentResults(Bundle segmentResults) {
            if (!current()) {
                return;
            }
            ArrayList<String> alternatives = segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            float[] scores = segmentResults.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
            String text = (alternatives != null && !alternatives.isEmpty()) ? alternatives.get(0) : "";
            mine.segmentTexts.add(text);
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("text", text);
            event.put("words", alternatives != null ? alternatives.toArray() : new Object[0]);
            event.put("confidence", (scores != null && scores.length > 0) ? scores[0] : 0f);
            fire("segmentresult", event);
        }

        @Override
        public void onEndOfSegmentedSession() {
            if (!current()) {
                return;
            }
            Session finished = mine;
            finishListening();
            StringBuilder joined = new StringBuilder();
            for (String piece : finished.segmentTexts) {
                if (joined.length() > 0) {
                    joined.append(' ');
                }
                joined.append(piece);
            }
            ArrayList<String> alternatives = new ArrayList<String>();
            if (joined.length() > 0) {
                alternatives.add(joined.toString());
            }
            fireResults(finished, alternatives, null, null);
        }

        @Override
        public void onLanguageDetection(Bundle results) {
            if (!current() || Build.VERSION.SDK_INT < 34) {
                return;
            }
            HashMap<String, Object> event = new HashMap<String, Object>();
            SpeechApi34.languageInfo(results, event);
            fire("languagedetected", event);
        }

        @Override
        public void onError(int error) {
            if (!current()) {
                return;
            }
            Session finished = mine;
            finishListening();
            if (finished.preferOffline && SOURCE_MICROPHONE.equals(finished.source)
                    && (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
                // "prefer" means local when possible: with no local model for the language, listen online instead
                KrollDict online = new KrollDict(finished.options);
                online.put("onDevice", false);
                startListening(online, finished.source, null);
                return;
            }
            fireFailure(finished, "Recognition error: " + describeError(error), codeForError(error), error);
        }

        @Override
        public void onEvent(int eventType, Bundle params) {
        }
    }

    private String codeForError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no_speech";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission_denied";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            case SpeechRecognizer.ERROR_TOO_MANY_REQUESTS:
                return "too_many_requests";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
                return "language_unsupported";
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return "language_unavailable";
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_CLIENT:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
            case SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT:
            case SpeechRecognizer.ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS:
                return "service_error";
            default:
                return "unknown";
        }
    }

    private String describeError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "No speech detected";
            case SpeechRecognizer.ERROR_AUDIO:
                return "Audio recording error";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network error";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Microphone permission not granted";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Recognizer busy";
            default:
                return "Error code " + error;
        }
    }

    private void fireStarted(Session s) {
        if (hasListeners(EVENT_STARTED)) {
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("success", true);
            event.put("language", s.language);
            event.put("source", s.source);
            fireEvent(EVENT_STARTED, event);
        }
    }

    // Same shape as iOS: words are the alternative transcriptions, best first
    private void fireResults(Session s, ArrayList<String> alternatives, float[] scores, Bundle results) {
        if (!hasListeners(EVENT_COMPLETED)) {
            return;
        }
        int wordCount = (alternatives != null) ? alternatives.size() : 0;
        Object[] words = new Object[wordCount];
        for (int iLoop = 0; iLoop < wordCount; iLoop++) {
            words[iLoop] = alternatives.get(iLoop);
        }
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", true);
        event.put("detectedInput", wordCount > 0);
        event.put("wordCount", wordCount);
        event.put("words", words);
        event.put("text", wordCount > 0 ? words[0] : "");
        event.put("confidence", (scores != null && scores.length > 0) ? scores[0] : 0f);
        event.put("language", s.language);
        event.put("source", s.source);
        if (results != null && Build.VERSION.SDK_INT >= 34) {
            String text = wordCount > 0 ? (String) words[0] : "";
            if (s.wantSegments) {
                Object[] segments = SpeechApi34.segments(results, text);
                if (segments != null) {
                    event.put("segments", segments);
                }
            }
            if (s.wantAlternatives) {
                Object[] spans = SpeechApi34.alternatives(results);
                if (spans != null) {
                    event.put("alternatives", spans);
                }
            }
            HashMap<String, Object> detected = new HashMap<String, Object>();
            SpeechApi34.languageInfo(results, detected);
            if (detected.containsKey("language")) {
                event.put("detectedLanguage", detected.get("language"));
            }
        }
        fireEvent(EVENT_COMPLETED, event);
    }

    private void fireFailure(Session s, String message, String code, int nativeCode) {
        if (!hasListeners(EVENT_COMPLETED)) {
            return;
        }
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", false);
        event.put("message", message);
        event.put("code", code);
        if (nativeCode != 0) {
            event.put("nativeCode", nativeCode);
        }
        event.put("detectedInput", false);
        event.put("wordCount", 0);
        event.put("words", new Object[0]);
        if (s != null) {
            event.put("language", s.language);
            event.put("source", s.source);
        }
        fireEvent(EVENT_COMPLETED, event);
    }

    @Override
    public void listenerAdded(String arg0, int arg1, KrollProxy arg2) {
    }

    @Override
    public void listenerRemoved(String arg0, int arg1, KrollProxy arg2) {
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
