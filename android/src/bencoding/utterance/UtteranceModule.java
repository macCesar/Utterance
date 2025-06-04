/**
 * Utterance Speech to Text and Text to Speech
 * Copyright (c) 2010-2014 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */
package bencoding.utterance;

import android.os.Build;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.speech.RecognizerIntent;

import org.appcelerator.kroll.KrollModule;
import org.appcelerator.kroll.annotations.Kroll;
import org.appcelerator.titanium.TiApplication;

import java.util.List;

@Kroll.module(name = "Utterance", id = "bencoding.utterance")
public class UtteranceModule extends KrollModule {

    public static final String MODULE_FULL_NAME = "bencoding.utterance";

    // Module version
    @Kroll.constant
    public static final String MODULE_VERSION = "3.0.0";

    // Minimum API levels for features
    @Kroll.constant
    public static final int API_LEVEL_SPEECH_RECOGNITION = 8;  // Android 2.2
    @Kroll.constant
    public static final int API_LEVEL_TTS_BASIC = 4;          // Android 1.6
    @Kroll.constant
    public static final int API_LEVEL_TTS_MODERN = 21;        // Android 5.0 (Lollipop)

    public UtteranceModule() {
        super();
    }

    @Kroll.onAppCreate
    public static void onAppCreate(TiApplication app) {
        // Module initialization code
    }

    /**
     * Check if the module is supported on this device
     * The module supports Android 4.0+ (API 14+) for basic functionality
     * @return true if supported
     */
    @Kroll.getProperty
    @Kroll.method
    public Boolean isSupported() {
        // The module works from Android 4.0 (API 14)
        // Basic TTS works from API 4, but we need API 14 for
        // full module functionality
        return (Build.VERSION.SDK_INT >= 14);
    }

    /**
     * Check if modern TTS features are supported (API 21+)
     * Features like getVoices(), voice quality, etc.
     * @return true if modern features are supported
     */
    @Kroll.method
    public Boolean isModernTTSSupported() {
        return (Build.VERSION.SDK_INT >= API_LEVEL_TTS_MODERN);
    }

    /**
     * Check if speech recognition is available on this device
     * @return true if speech recognition is available
     */
    @Kroll.method
    public Boolean isSpeechRecognitionAvailable() {
        Context context = TiApplication.getInstance().getApplicationContext();
        PackageManager pm = context.getPackageManager();

        // Check for speech recognition service
        List<ResolveInfo> activities = pm.queryIntentActivities(
            new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0);

        return (activities != null && activities.size() > 0);
    }

    /**
     * Get the current Android API level
     * @return API level
     */
    @Kroll.method
    public int getApiLevel() {
        return Build.VERSION.SDK_INT;
    }

    /**
     * Get the Android version name
     * @return Version name (e.g., "7.0", "8.1", etc.)
     */
    @Kroll.method
    public String getAndroidVersion() {
        return Build.VERSION.RELEASE;
    }
}
