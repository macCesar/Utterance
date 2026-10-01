/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import java.text.BreakIterator;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Cuts a text into consecutive pieces of at most max characters, at sentence ends when it can and at a space when it
 * cannot. The pieces joined give back the original text exactly, so an offset inside a piece plus the length of the
 * pieces before it is the offset in the original.
 */
final class TextSplitter {
    private TextSplitter() {
    }

    static List<String> split(String text, int max, Locale locale) {
        List<String> parts = new ArrayList<String>();
        if (text.length() <= max) {
            parts.add(text);
            return parts;
        }

        StringBuilder current = new StringBuilder();
        BreakIterator sentences = BreakIterator.getSentenceInstance(locale);
        sentences.setText(text);
        int start = sentences.first();
        for (int end = sentences.next(); end != BreakIterator.DONE; start = end, end = sentences.next()) {
            String sentence = text.substring(start, end);
            if (sentence.length() > max) {
                flush(parts, current);
                cutLong(parts, sentence, max);
                continue;
            }
            if (current.length() + sentence.length() > max) {
                flush(parts, current);
            }
            current.append(sentence);
        }
        flush(parts, current);
        return parts;
    }

    private static void flush(List<String> parts, StringBuilder current) {
        if (current.length() > 0) {
            parts.add(current.toString());
            current.setLength(0);
        }
    }

    // A sentence longer than max: cut after the last space inside the limit, or at the limit when there is none.
    private static void cutLong(List<String> parts, String sentence, int max) {
        int from = 0;
        while (sentence.length() - from > max) {
            int limit = from + max;
            int cut = -1;
            for (int i = limit; i > from + max / 2; i--) {
                if (Character.isWhitespace(sentence.charAt(i - 1))) {
                    cut = i;
                    break;
                }
            }
            if (cut < 0) {
                cut = limit;
                if (Character.isHighSurrogate(sentence.charAt(cut - 1))) {
                    cut--;
                }
            }
            parts.add(sentence.substring(from, cut));
            from = cut;
        }
        if (from < sentence.length()) {
            parts.add(sentence.substring(from));
        }
    }
}
