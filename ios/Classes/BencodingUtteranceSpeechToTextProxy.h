/**
 * Copyright (c) 2013 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache 2.0 License
 * Please see the LICENSE included with this distribution for details.
 *
 * Available at https://github.com/benbahrenburg/Utterance
 *
 */
#import "TiProxy.h"
#import <Speech/Speech.h>
#import <AVFoundation/AVFoundation.h>

@interface BencodingUtteranceSpeechToTextProxy : TiProxy <SFSpeechRecognizerDelegate>
{
@private
  BOOL _isSupported;
  BOOL _isRecording;
  BOOL _permissionsGranted;
  NSString *_locale;
  double _silenceTimeout;
  double _noSpeechTimeout;
  BOOL _audioSessionChanged;
  NSString *_previousCategory;
  NSString *_previousMode;
  AVAudioSessionCategoryOptions _previousOptions;
}

@property(nonatomic, strong) SFSpeechRecognizer *speechRecognizer;
@property(nonatomic, strong) SFSpeechRecognitionRequest *recognitionRequest;
@property(nonatomic, strong) SFSpeechRecognitionTask *recognitionTask;
@property(nonatomic, strong) AVAudioEngine *audioEngine;
@property(nonatomic, strong) NSTimer *endOfSpeechTimer;
@property(nonatomic, strong) NSTimer *levelTimer;

// Public API Methods (matching Android API for consistency)
- (NSNumber *)isSupported:(id)unused;
- (void)startSpeechToText:(id)args;
- (void)stopRecording:(id)unused;
- (void)cancelRecording:(id)unused;

// Availability and permissions
- (NSNumber *)isAvailable:(id)args;
- (NSNumber *)supportsOnDevice:(id)args;
- (NSDictionary *)getPermissionStatus:(id)unused;
- (void)requestPermissions:(id)unused;
- (void)requestSupportedLanguages:(id)unused;
- (void)downloadLanguage:(id)args;

// Audio that does not come from the microphone
- (void)transcribeFile:(id)args;
- (void)appendAudio:(id)args;
- (NSDictionary *)getNativeAudioFormat:(id)unused;

// iOS only
- (NSDictionary *)getState:(id)unused;
- (void)prepareCustomLanguageModel:(id)args;

// Constants for cross-platform compatibility
- (NSString *)LANGUAGE_MODEL_FREE_FORM;
- (NSString *)LANGUAGE_MODEL_WEB_SEARCH;

@end
