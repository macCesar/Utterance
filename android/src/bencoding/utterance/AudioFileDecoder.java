/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.util.Log;

import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * Decodes an audio file (wav, mp3, m4a, ogg and whatever else MediaExtractor reads) to 16-bit PCM and hands it to an
 * AudioFeeder as 16 kHz mono. probe() reads the file's own format first, because the converter needs it, and the
 * decoding runs later on its own thread.
 */
final class AudioFileDecoder implements Runnable {
    final String path;
    final int sampleRate;
    final int channels;
    private final MediaFormat format;
    private final int track;
    private final AudioFeeder feeder;
    private final PcmConverter converter;
    private volatile boolean stopped = false;
    private Runnable onFinished;

    private AudioFileDecoder(String path, MediaFormat format, int track, AudioFeeder feeder) {
        this.path = path;
        this.format = format;
        this.track = track;
        this.feeder = feeder;
        this.sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        this.channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        this.converter = new PcmConverter(sampleRate, channels);
    }

    /** Called on the decoder thread once all the audio was handed to the feeder. */
    void setOnFinished(Runnable onFinished) {
        this.onFinished = onFinished;
    }

    /** Throws when the file has no audio track or cannot be read. */
    static AudioFileDecoder probe(String path, AudioFeeder feeder) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(path);
            for (int iLoop = 0; iLoop < extractor.getTrackCount(); iLoop++) {
                MediaFormat format = extractor.getTrackFormat(iLoop);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    return new AudioFileDecoder(path, format, iLoop, feeder);
                }
            }
            throw new IOException("The file has no audio track");
        } finally {
            extractor.release();
        }
    }

    void stop() {
        stopped = true;
    }

    @Override
    public void run() {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        try {
            extractor.setDataSource(path);
            extractor.selectTrack(track);
            codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
            codec.configure(format, null, null, 0);
            codec.start();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inputDone = false;
            boolean outputDone = false;
            while (!outputDone && !stopped) {
                if (!inputDone) {
                    int index = codec.dequeueInputBuffer(10000);
                    if (index >= 0) {
                        ByteBuffer buffer = codec.getInputBuffer(index);
                        int size = extractor.readSampleData(buffer, 0);
                        if (size < 0) {
                            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            codec.queueInputBuffer(index, 0, size, extractor.getSampleTime(), 0);
                            extractor.advance();
                        }
                    }
                }
                int out = codec.dequeueOutputBuffer(info, 10000);
                if (out >= 0) {
                    if (info.size > 0) {
                        ByteBuffer buffer = codec.getOutputBuffer(out);
                        byte[] chunk = new byte[info.size];
                        buffer.position(info.offset);
                        buffer.get(chunk);
                        feeder.write(converter.convert(chunk));
                    }
                    codec.releaseOutputBuffer(out, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputDone = true;
                    }
                } else if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat decoded = codec.getOutputFormat();
                    int encoding = decoded.containsKey(MediaFormat.KEY_PCM_ENCODING) ? decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
                    Log.d(UtteranceModule.MODULE_FULL_NAME, "Decoder output: " + decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE) + " Hz, "
                            + decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT) + " channels, encoding " + encoding);
                }
            }
        } catch (Exception error) {
            Log.e(UtteranceModule.MODULE_FULL_NAME, "Audio decoding failed: " + error.getMessage());
        } finally {
            if (codec != null) {
                try {
                    codec.stop();
                } catch (Exception ignored) {
                }
                codec.release();
            }
            extractor.release();
            feeder.finish();
            if (onFinished != null && !stopped) {
                onFinished.run();
            }
        }
    }
}
