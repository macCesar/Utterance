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
}

@property(nonatomic, strong) SFSpeechRecognizer *speechRecognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *recognitionRequest;
@property(nonatomic, strong) SFSpeechRecognitionTask *recognitionTask;
@property(nonatomic, strong) AVAudioEngine *audioEngine;

// Public API Methods (matching Android API for consistency)
- (NSNumber *)isSupported:(id)unused;
- (void)startSpeechToText:(id)args;
- (void)stopRecording:(id)unused;

// Permission handling
- (void)requestPermissions:(void (^)(BOOL granted))completion;

// Constants for cross-platform compatibility
- (NSString *)LANGUAGE_MODEL_FREE_FORM;
- (NSString *)LANGUAGE_MODEL_WEB_SEARCH;

@end
