/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.List;

/**
 * The part of a PCM WAV file that synthesizeToFile() needs: the format, the length of the audio, and joining the
 * files the engine writes for the pieces of a long text into one.
 */
final class WavFile {
    final int audioFormat;
    final int channels;
    final int sampleRate;
    final int bitsPerSample;
    final long dataOffset;
    final long dataLength;

    private WavFile(int audioFormat, int channels, int sampleRate, int bitsPerSample, long dataOffset, long dataLength) {
        this.audioFormat = audioFormat;
        this.channels = channels;
        this.sampleRate = sampleRate;
        this.bitsPerSample = bitsPerSample;
        this.dataOffset = dataOffset;
        this.dataLength = dataLength;
    }

    double durationSeconds() {
        long bytesPerSecond = (long) sampleRate * channels * (bitsPerSample / 8);
        return bytesPerSecond > 0 ? (double) dataLength / bytesPerSecond : 0;
    }

    static WavFile read(File file) throws IOException {
        RandomAccessFile in = new RandomAccessFile(file, "r");
        try {
            byte[] riff = new byte[12];
            in.readFully(riff);
            if (!tag(riff, 0, "RIFF") || !tag(riff, 8, "WAVE")) {
                throw new IOException("Not a WAV file");
            }
            int audioFormat = 0, channels = 0, sampleRate = 0, bits = 0;
            boolean haveFormat = false;
            long position = 12;
            while (position + 8 <= in.length()) {
                in.seek(position);
                byte[] header = new byte[8];
                in.readFully(header);
                long size = le32(header, 4) & 0xFFFFFFFFL;
                long body = position + 8;
                if (tag(header, 0, "fmt ")) {
                    byte[] fmt = new byte[16];
                    in.readFully(fmt);
                    audioFormat = le16(fmt, 0);
                    channels = le16(fmt, 2);
                    sampleRate = le32(fmt, 4);
                    bits = le16(fmt, 14);
                    haveFormat = true;
                } else if (tag(header, 0, "data")) {
                    if (!haveFormat) {
                        throw new IOException("WAV data before its format");
                    }
                    long available = in.length() - body;
                    // A header that was never finished says 0 or 0xFFFFFFFF: the audio is whatever follows
                    long length = (size == 0 || size > available) ? available : size;
                    return new WavFile(audioFormat, channels, sampleRate, bits, body, length);
                }
                position = body + size + (size & 1);
            }
            throw new IOException("WAV file has no audio");
        } finally {
            in.close();
        }
    }

    /** Writes the audio of all the files, which must share one format, into one WAV file. */
    static WavFile concat(List<File> parts, File destination) throws IOException {
        WavFile first = read(parts.get(0));
        long total = 0;
        WavFile[] infos = new WavFile[parts.size()];
        for (int i = 0; i < parts.size(); i++) {
            infos[i] = read(parts.get(i));
            if (infos[i].sampleRate != first.sampleRate || infos[i].channels != first.channels || infos[i].bitsPerSample != first.bitsPerSample) {
                throw new IOException("The pieces of the text came out in different formats");
            }
            total += infos[i].dataLength;
        }
        OutputStream out = new FileOutputStream(destination);
        try {
            out.write(header(first, total));
            byte[] chunk = new byte[16384];
            for (int i = 0; i < parts.size(); i++) {
                InputStream in = new FileInputStream(parts.get(i));
                try {
                    long skipped = 0;
                    while (skipped < infos[i].dataOffset) {
                        long s = in.skip(infos[i].dataOffset - skipped);
                        if (s <= 0) {
                            throw new IOException("Unable to read " + parts.get(i));
                        }
                        skipped += s;
                    }
                    long left = infos[i].dataLength;
                    while (left > 0) {
                        int count = in.read(chunk, 0, (int) Math.min(chunk.length, left));
                        if (count < 0) {
                            break;
                        }
                        out.write(chunk, 0, count);
                        left -= count;
                    }
                } finally {
                    in.close();
                }
            }
        } finally {
            out.close();
        }
        return read(destination);
    }

    private static byte[] header(WavFile format, long dataLength) {
        byte[] h = new byte[44];
        put(h, 0, "RIFF");
        put32(h, 4, (int) (36 + dataLength));
        put(h, 8, "WAVE");
        put(h, 12, "fmt ");
        put32(h, 16, 16);
        put16(h, 20, format.audioFormat);
        put16(h, 22, format.channels);
        put32(h, 24, format.sampleRate);
        put32(h, 28, format.sampleRate * format.channels * (format.bitsPerSample / 8));
        put16(h, 32, format.channels * (format.bitsPerSample / 8));
        put16(h, 34, format.bitsPerSample);
        put(h, 36, "data");
        put32(h, 40, (int) dataLength);
        return h;
    }

    private static boolean tag(byte[] b, int at, String name) {
        for (int i = 0; i < 4; i++) {
            if (b[at + i] != (byte) name.charAt(i)) {
                return false;
            }
        }
        return true;
    }

    private static int le16(byte[] b, int at) {
        return (b[at] & 0xFF) | ((b[at + 1] & 0xFF) << 8);
    }

    private static int le32(byte[] b, int at) {
        return le16(b, at) | (le16(b, at + 2) << 16);
    }

    private static void put(byte[] b, int at, String name) {
        for (int i = 0; i < 4; i++) {
            b[at + i] = (byte) name.charAt(i);
        }
    }

    private static void put16(byte[] b, int at, int v) {
        b[at] = (byte) v;
        b[at + 1] = (byte) (v >> 8);
    }

    private static void put32(byte[] b, int at, int v) {
        put16(b, at, v);
        put16(b, at + 2, v >> 16);
    }
}
