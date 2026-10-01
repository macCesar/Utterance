/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.content.Intent;
import android.os.Bundle;
import android.speech.AlternativeSpan;
import android.speech.AlternativeSpans;
import android.speech.ModelDownloadListener;
import android.speech.RecognitionPart;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Everything that needs a class added in API 34. Kept apart so the main proxy never loads these classes on an older device.
 * Callers check Build.VERSION.SDK_INT first.
 */
final class SpeechApi34 {
    private SpeechApi34() {
    }

    /**
     * Word level parts of the best result, in the same shape as iOS segments. Android reports timestamps in
     * milliseconds (iOS in seconds), has no duration, and gives confidence as a level, so confidence is level / 5 and
     * confidenceLevel carries the name. start and end are found by scanning the text, and are left out if the part is not in it.
     */
    static Object[] segments(Bundle results, String text) {
        ArrayList<RecognitionPart> parts = results.getParcelableArrayList(SpeechRecognizer.RECOGNITION_PARTS, RecognitionPart.class);
        if (parts == null) {
            return null;
        }
        Object[] segments = new Object[parts.size()];
        int cursor = 0;
        for (int iLoop = 0; iLoop < segments.length; iLoop++) {
            RecognitionPart part = parts.get(iLoop);
            String partText = part.getFormattedText();
            HashMap<String, Object> segment = new HashMap<String, Object>();
            segment.put("text", partText);
            segment.put("rawText", part.getRawText());
            segment.put("timestamp", part.getTimestampMillis() / 1000.0);
            segment.put("confidence", part.getConfidenceLevel() / 5.0);
            segment.put("confidenceLevel", confidenceName(part.getConfidenceLevel()));
            int start = (text != null && partText != null) ? text.indexOf(partText, cursor) : -1;
            if (start >= 0) {
                segment.put("start", start);
                segment.put("end", start + partText.length());
                cursor = start + partText.length();
            }
            segments[iLoop] = segment;
        }
        return segments;
    }

    private static String confidenceName(int level) {
        switch (level) {
            case RecognitionPart.CONFIDENCE_LEVEL_LOW:
                return "low";
            case RecognitionPart.CONFIDENCE_LEVEL_MEDIUM_LOW:
                return "mediumlow";
            case RecognitionPart.CONFIDENCE_LEVEL_MEDIUM:
                return "medium";
            case RecognitionPart.CONFIDENCE_LEVEL_MEDIUM_HIGH:
                return "mediumhigh";
            case RecognitionPart.CONFIDENCE_LEVEL_HIGH:
                return "high";
            default:
                return "unknown";
        }
    }

    /** Alternatives per span of the best result, the same as iOS alternativeSubstrings. */
    static Object[] alternatives(Bundle results) {
        ArrayList<AlternativeSpans> all = results.getParcelableArrayList(SpeechRecognizer.RESULTS_ALTERNATIVES, AlternativeSpans.class);
        if (all == null || all.isEmpty()) {
            return null;
        }
        List<AlternativeSpan> spans = all.get(0).getSpans();
        Object[] result = new Object[spans.size()];
        for (int iLoop = 0; iLoop < result.length; iLoop++) {
            AlternativeSpan span = spans.get(iLoop);
            HashMap<String, Object> item = new HashMap<String, Object>();
            item.put("start", span.getStartPosition());
            item.put("end", span.getEndPosition());
            item.put("alternatives", span.getAlternatives().toArray());
            result[iLoop] = item;
        }
        return result;
    }

    /** Fields of the onLanguageDetection bundle, and of any result bundle that carries a detected language. */
    static void languageInfo(Bundle bundle, HashMap<String, Object> event) {
        if (bundle.containsKey(SpeechRecognizer.DETECTED_LANGUAGE)) {
            event.put("language", bundle.getString(SpeechRecognizer.DETECTED_LANGUAGE));
        }
        if (bundle.containsKey(SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL)) {
            switch (bundle.getInt(SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL)) {
                case SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL_NOT_CONFIDENT:
                    event.put("confidence", "notconfident");
                    break;
                case SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL_CONFIDENT:
                    event.put("confidence", "confident");
                    break;
                case SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL_HIGHLY_CONFIDENT:
                    event.put("confidence", "highlyconfident");
                    break;
                default:
                    event.put("confidence", "unknown");
            }
        }
        ArrayList<String> alternatives = bundle.getStringArrayList(SpeechRecognizer.TOP_LOCALE_ALTERNATIVES);
        if (alternatives != null) {
            event.put("alternatives", alternatives.toArray());
        }
        if (bundle.containsKey(SpeechRecognizer.LANGUAGE_SWITCH_RESULT)) {
            switch (bundle.getInt(SpeechRecognizer.LANGUAGE_SWITCH_RESULT)) {
                case SpeechRecognizer.LANGUAGE_SWITCH_RESULT_SUCCEEDED:
                    event.put("switchResult", "succeeded");
                    break;
                case SpeechRecognizer.LANGUAGE_SWITCH_RESULT_FAILED:
                    event.put("switchResult", "failed");
                    break;
                case SpeechRecognizer.LANGUAGE_SWITCH_RESULT_SKIPPED_NO_MODEL:
                    event.put("switchResult", "skippednomodel");
                    break;
                default:
                    event.put("switchResult", "notattempted");
            }
        }
    }

    /** Callbacks for a model download, handed the event name to report them under. */
    interface DownloadReporter {
        void report(String state, int progress, int errorCode);
    }

    static void triggerModelDownload(SpeechRecognizer recognizer, Intent intent, Executor executor, final DownloadReporter reporter) {
        recognizer.triggerModelDownload(intent, executor, new ModelDownloadListener() {
            @Override
            public void onProgress(int completedPercent) {
                reporter.report("progress", completedPercent, 0);
            }

            @Override
            public void onSuccess() {
                reporter.report("success", 100, 0);
            }

            @Override
            public void onScheduled() {
                reporter.report("scheduled", 0, 0);
            }

            @Override
            public void onError(int error) {
                reporter.report("error", 0, error);
            }
        });
    }
}
