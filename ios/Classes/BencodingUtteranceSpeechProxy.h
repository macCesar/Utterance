/**
 * Copyright (c) 2013 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache 2.0 License
 * Please see the LICENSE included with this distribution for details.
 *
 * Available at https://github.com/benbahrenburg/Utterance
 *
 */
#import "TiProxy.h"

#import <AVFoundation/AVFoundation.h>
@interface BencodingUtteranceSpeechProxy : TiProxy <AVSpeechSynthesizerDelegate>
{

@private
  BOOL _isSupported;
}
@property(strong, nonatomic) AVSpeechSynthesizer *speechSynthesizer;

// v3.0 Unification: Add method version for Android compatibility
- (NSNumber *)isSpeaking:(id)args;

// State
- (NSNumber *)isPaused:(id)unused;
- (NSDictionary *)getState:(id)unused;
- (NSNumber *)getMaxTextLength:(id)unused;

// Speaking
- (void)playSilence:(id)args;
- (void)warmUp:(id)unused;

// Synthesis to a file
- (void)synthesizeToFile:(id)args;

// Voices
- (void)requestVoices:(id)args;

// iOS only: Personal Voice (iOS 17)
- (void)requestPersonalVoiceAuthorization:(id)unused;
- (NSString *)getPersonalVoiceStatus:(id)unused;

// Android only: answer with the "unsupported" code
- (void)addSpeech:(id)args;
- (void)addEarcon:(id)args;
- (void)playEarcon:(id)args;

@end
