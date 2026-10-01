/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;

/**
 * Everything that needs a class added in API 26. Kept apart so the main proxy never loads these classes on an older device.
 * Callers check Build.VERSION.SDK_INT first.
 */
final class SpeechApi26 {
    private SpeechApi26() {
    }

    /** USAGE_ASSISTANT exists from API 26. */
    static final int USAGE_ASSISTANT = AudioAttributes.USAGE_ASSISTANT;

    /** A transient focus request that lets other audio keep playing at a lower volume while the speech lasts. */
    static Object requestDucking(AudioManager manager, AudioAttributes attributes, AudioManager.OnAudioFocusChangeListener listener) {
        AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener(listener)
            .build();
        int result = manager.requestAudioFocus(request);
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? request : null;
    }

    static void abandon(AudioManager manager, Object request) {
        manager.abandonAudioFocusRequest((AudioFocusRequest) request);
    }
}
