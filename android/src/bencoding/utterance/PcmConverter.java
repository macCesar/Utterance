/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import java.util.Arrays;

/**
 * Turns 16-bit little endian PCM of any sample rate and channel count into 16 kHz mono, the format the speech
 * recognizer reads from EXTRA_AUDIO_SOURCE (a 22.05 kHz stream got no answer at all). It keeps the state between calls,
 * so audio can arrive in chunks of any size, even in the middle of a frame.
 * Channels are averaged. Down-sampling averages the input samples each output sample covers, which is enough for speech.
 */
final class PcmConverter {
    static final int TARGET_RATE = 16000;

    private final int channels;
    private final double ratio;
    private final boolean passthrough;
    private float[] buffer = new float[4096];
    private int length = 0;
    // Absolute index (in mono input samples) of buffer[0], and the input position of the next output sample
    private long base = 0;
    private double position = 0;
    private final byte[] spare;
    private int spareLength = 0;

    PcmConverter(int sampleRate, int channels) {
        this.channels = Math.max(1, channels);
        this.ratio = (double) sampleRate / TARGET_RATE;
        this.passthrough = sampleRate == TARGET_RATE && this.channels == 1;
        this.spare = new byte[2 * this.channels];
    }

    byte[] convert(byte[] data) {
        if (data == null || data.length == 0) {
            return new byte[0];
        }
        if (passthrough) {
            return data;
        }
        int frameSize = 2 * channels;
        // Bytes left over from the last call that did not make a whole frame go first
        byte[] input = data;
        if (spareLength > 0) {
            input = new byte[spareLength + data.length];
            System.arraycopy(spare, 0, input, 0, spareLength);
            System.arraycopy(data, 0, input, spareLength, data.length);
        }
        int frames = input.length / frameSize;
        spareLength = input.length - frames * frameSize;
        System.arraycopy(input, frames * frameSize, spare, 0, spareLength);

        if (length + frames > buffer.length) {
            buffer = Arrays.copyOf(buffer, Math.max(buffer.length * 2, length + frames));
        }
        int at = 0;
        for (int frame = 0; frame < frames; frame++) {
            float sum = 0;
            for (int channel = 0; channel < channels; channel++) {
                sum += (short) ((input[at + 1] << 8) | (input[at] & 0xff));
                at += 2;
            }
            buffer[length++] = sum / channels / 32768f;
        }

        byte[] out = new byte[(int) (frames / ratio + 4) * 2];
        int written = 0;
        while (true) {
            int start = (int) Math.floor(position - base);
            int end = ratio > 1 ? (int) Math.ceil(position + ratio - base) : start + 2;
            if (end > length) {
                break;
            }
            float value;
            if (ratio > 1) {
                float sum = 0;
                for (int i = start; i < end; i++) {
                    sum += buffer[i];
                }
                value = sum / (end - start);
            } else {
                float fraction = (float) (position - Math.floor(position));
                value = buffer[start] * (1 - fraction) + buffer[start + 1] * fraction;
            }
            short sample = (short) Math.max(-32768, Math.min(32767, Math.round(value * 32768f)));
            if (written + 2 > out.length) {
                out = Arrays.copyOf(out, out.length * 2);
            }
            out[written++] = (byte) (sample & 0xff);
            out[written++] = (byte) ((sample >> 8) & 0xff);
            position += ratio;
        }
        int keepFrom = (int) Math.floor(position - base);
        if (keepFrom > 0 && keepFrom <= length) {
            System.arraycopy(buffer, keepFrom, buffer, 0, length - keepFrom);
            length -= keepFrom;
            base += keepFrom;
        }
        return Arrays.copyOf(out, written);
    }
}
