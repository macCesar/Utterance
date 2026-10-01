/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Writes PCM audio into the write end of the pipe whose read end the recognizer receives as EXTRA_AUDIO_SOURCE.
 * Writes run on one thread of their own, because a full pipe blocks the writer until the recognizer reads.
 */
final class AudioFeeder {
    private final ParcelFileDescriptor.AutoCloseOutputStream out;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean closed = false;

    AudioFeeder(ParcelFileDescriptor writeEnd) {
        out = new ParcelFileDescriptor.AutoCloseOutputStream(writeEnd);
    }

    void write(final byte[] data) {
        if (closed || data == null || data.length == 0) {
            return;
        }
        executor.execute(new Runnable() {
            @Override
            public void run() {
                if (closed) {
                    return;
                }
                try {
                    out.write(data);
                } catch (IOException error) {
                    Log.d(UtteranceModule.MODULE_FULL_NAME, "Audio pipe closed: " + error.getMessage());
                    closed = true;
                }
            }
        });
    }

    /** The audio queued so far is written first, then the recognizer sees the end of the stream. */
    void finish() {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                closeQuietly();
            }
        });
        executor.shutdown();
    }

    /** Drops what is queued and closes the pipe. */
    void abort() {
        closed = true;
        executor.shutdownNow();
        closeQuietly();
    }

    private void closeQuietly() {
        closed = true;
        try {
            out.close();
        } catch (IOException ignored) {
        }
    }
}
