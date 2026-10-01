/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.content.Intent;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.SpeechRecognizer;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Everything that needs a class added in API 33. Kept apart so the main proxy never loads these classes on an older device.
 * Callers check Build.VERSION.SDK_INT first.
 */
final class SpeechApi33 {
    private SpeechApi33() {
    }

    interface LanguagesReporter {
        void report(Object[] languages, int errorCode);
    }

    /** One entry per language, merged from the four lists the recognizer reports. */
    static void checkSupport(SpeechRecognizer recognizer, Intent intent, Executor executor, final LanguagesReporter reporter) {
        recognizer.checkRecognitionSupport(intent, executor, new RecognitionSupportCallback() {
            @Override
            public void onSupportResult(RecognitionSupport support) {
                LinkedHashMap<String, HashMap<String, Object>> byLanguage = new LinkedHashMap<String, HashMap<String, Object>>();
                mark(byLanguage, support.getOnlineLanguages(), "online");
                mark(byLanguage, support.getSupportedOnDeviceLanguages(), "onDevice");
                mark(byLanguage, support.getInstalledOnDeviceLanguages(), "installed");
                mark(byLanguage, support.getPendingOnDeviceLanguages(), "pending");
                for (HashMap<String, Object> entry : byLanguage.values()) {
                    // An installed model is, by definition, supported on the device
                    if (Boolean.TRUE.equals(entry.get("installed"))) {
                        entry.put("onDevice", true);
                    }
                }
                reporter.report(byLanguage.values().toArray(), 0);
            }

            @Override
            public void onError(int error) {
                reporter.report(new Object[0], error);
            }
        });
    }

    private static void mark(LinkedHashMap<String, HashMap<String, Object>> byLanguage, List<String> languages, String flag) {
        if (languages == null) {
            return;
        }
        for (String language : languages) {
            HashMap<String, Object> entry = byLanguage.get(language);
            if (entry == null) {
                entry = new HashMap<String, Object>();
                entry.put("language", language);
                entry.put("online", false);
                entry.put("onDevice", false);
                entry.put("installed", false);
                entry.put("pending", false);
                byLanguage.put(language, entry);
            }
            entry.put(flag, true);
        }
    }

    static void triggerModelDownload(SpeechRecognizer recognizer, Intent intent) {
        recognizer.triggerModelDownload(intent);
    }
}
