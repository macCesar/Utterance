/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

@Kroll.proxy(creatableInModule = UtteranceModule.class)
public class SpeechToTextProxy extends KrollProxy implements KrollProxyListener {
    @Kroll.constant
    public static final String LANGUAGE_MODEL_FREE_FORM = RecognizerIntent.LANGUAGE_MODEL_FREE_FORM;
    @Kroll.constant
    public static final String LANGUAGE_MODEL_WEB_SEARCH = RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH;
    private static final String MAX_RESULTS = "maxResults";
    private static final String LANGUAGE_MODEL = "languageModel";
    private static final String LANGUAGE = "language";
    private static final String SILENCE_TIMEOUT = "silenceTimeout";
    private static final String NO_SPEECH_TIMEOUT = "noSpeechTimeout";
    private static final String EVENT_COMPLETED = "completed";
    private static final String EVENT_STARTED = "started";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Boolean _isSupported = true;
    // SpeechRecognizer must be created and used on the main thread, so these two are only touched there
    private SpeechRecognizer recognizer;
    private boolean listening = false;
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

    @SuppressWarnings({"rawtypes", "unchecked"})
    @Kroll.method
    public void startSpeechToText(HashMap hm) {
        final KrollDict args = (hm != null) ? new KrollDict(hm) : new KrollDict();
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                startListening(args);
            }
        });
    }

    @Kroll.method
    public void stopRecording() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (recognizer != null && listening) {
                    // The final result still arrives through onResults
                    recognizer.stopListening();
                }
            }
        });
    }

    @Override
    public void release() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                finishListening();
            }
        });
        super.release();
    }

    private void startListening(KrollDict args) {
        if (!_isSupported) {
            fireFailure("Speech recognition is not supported on this device");
            return;
        }
        if (listening) {
            Log.d(UtteranceModule.MODULE_FULL_NAME, "Speech recognition already in progress");
            return;
        }
        Context context = TiApplication.getInstance();
        if (context.checkCallingOrSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            fireFailure("Microphone permission not granted");
            return;
        }

        try {
            Intent listenIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            listenIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());
            listenIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, args.optString(LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM));
            listenIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, args.optInt(MAX_RESULTS, 10));
            if (args.containsKeyAndNotNull(LANGUAGE)) {
                listenIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, args.getString(LANGUAGE));
            }
            listenIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);

            silenceTimeout = args.containsKeyAndNotNull(SILENCE_TIMEOUT) ? args.getDouble(SILENCE_TIMEOUT) : 0;
            noSpeechTimeout = args.containsKeyAndNotNull(NO_SPEECH_TIMEOUT) ? args.getDouble(NO_SPEECH_TIMEOUT) : 0;
            if (silenceTimeout > 0) {
                // The recognizer may ignore these hints, so the module also ends the session itself
                long silenceMillis = (long) (silenceTimeout * 1000);
                listenIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, silenceMillis);
                listenIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, silenceMillis);
            }

            recognizer = SpeechRecognizer.createSpeechRecognizer(context);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    armEndOfSpeech(noSpeechTimeout);
                    fireStarted();
                }

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> alternatives = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                    finishListening();
                    fireResults(alternatives, scores);
                }

                @Override
                public void onError(int error) {
                    finishListening();
                    fireFailure("Recognition error: " + describeError(error));
                }

                @Override
                public void onBeginningOfSpeech() {
                    // Speech started, so the no-speech timer is over
                    mainHandler.removeCallbacks(endOfSpeech);
                }

                @Override
                public void onRmsChanged(float rmsdB) {
                }

                @Override
                public void onBufferReceived(byte[] buffer) {
                }

                @Override
                public void onEndOfSpeech() {
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> partial = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (partial != null && !partial.isEmpty() && !partial.get(0).isEmpty()) {
                        armEndOfSpeech(silenceTimeout);
                    }
                }

                @Override
                public void onEvent(int eventType, Bundle params) {
                }
            });
            listening = true;
            recognizer.startListening(listenIntent);
        } catch (Exception error) {
            Log.e(UtteranceModule.MODULE_FULL_NAME, String.valueOf(error.getMessage()));
            finishListening();
            fireFailure("Unable to start speech recognition: " + error.getMessage());
        }
    }

    // Ends the session after a pause. A value of 0 or less cancels the timer.
    private void armEndOfSpeech(double seconds) {
        mainHandler.removeCallbacks(endOfSpeech);
        if (seconds > 0 && listening) {
            mainHandler.postDelayed(endOfSpeech, (long) (seconds * 1000));
        }
    }

    private void finishListening() {
        mainHandler.removeCallbacks(endOfSpeech);
        listening = false;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
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

    private void fireStarted() {
        if (hasListeners(EVENT_STARTED)) {
            HashMap<String, Object> event = new HashMap<String, Object>();
            event.put("success", true);
            fireEvent(EVENT_STARTED, event);
        }
    }

    // Same shape as iOS: words are the alternative transcriptions, best first
    private void fireResults(ArrayList<String> alternatives, float[] scores) {
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
        fireEvent(EVENT_COMPLETED, event);
    }

    private void fireFailure(String message) {
        if (!hasListeners(EVENT_COMPLETED)) {
            return;
        }
        HashMap<String, Object> event = new HashMap<String, Object>();
        event.put("success", false);
        event.put("message", message);
        event.put("detectedInput", false);
        event.put("wordCount", 0);
        event.put("words", new Object[0]);
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
