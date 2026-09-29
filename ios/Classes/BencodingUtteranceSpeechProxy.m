/**
 * Copyright (c) 2013 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache 2.0 License
 * Please see the LICENSE included with this distribution for details.
 *
 * Available at https://github.com/benbahrenburg/Utterance
 *
 */

#import "BencodingUtteranceSpeechProxy.h"
#import "TiUtils.h"
#import <AVFoundation/AVFoundation.h>

@implementation BencodingUtteranceSpeechProxy

int const cSpeechBoundaryImmeiate = 0;
int const cSpeechBoundaryWord = 1;


-(void)_configure
{
    _isSupported = NO;
    
    if(NSClassFromString(@"AVSpeechSynthesizer"))
    {
        _isSupported=YES;
        self.speechSynthesizer = [AVSpeechSynthesizer new];
        self.speechSynthesizer.delegate = self;
    }
    
	[super _configure];
}

-(void)_destroy
{
    if(self.speechSynthesizer!=nil){
        self.speechSynthesizer.delegate = nil;
        self.speechSynthesizer = nil;
    }
    _text = nil;
    _voice = nil;
    
	[super _destroy];
}

/**
 * Language detection taken from Eric Wolfe's contribution to Hark https://github.com/kgn/Hark
 */
- (NSString *)voiceLanguageForText:(NSString *)text
{
    CFRange range = CFRangeMake(0, MIN(400, text.length));
    NSString *currentLanguage = [AVSpeechSynthesisVoice currentLanguageCode];
    NSString *language = (NSString *)CFBridgingRelease(CFStringTokenizerCopyBestStringLanguage((CFStringRef)text, range));
    if(language && ![currentLanguage hasPrefix:language]){
        NSArray *availableLanguages = [[AVSpeechSynthesisVoice speechVoices] valueForKeyPath:@"language"];
        if([availableLanguages containsObject:language]){
            return language;
        }
        
        // TODO: also support Cantonese (zh-HK)
        // Language code translations for simplified and traditional Chinese
        if([language isEqualToString:@"zh-Hans"]){
            return @"zh-CN";
        }
        if([language isEqualToString:@"zh-Hant"]){
            return @"zh-TW";
        }
        
        // Fall back to searching for languages starting with the current language code
        NSString *languageCode = [[language componentsSeparatedByString:@"-"] firstObject];
        for(NSString *language in availableLanguages){
            if([language hasPrefix:languageCode]){
                NSLog(@"[DEBUG] using default: %@", language);
                return language;
            }
        }
    }
    
    return currentLanguage;
}

#pragma Public APIs

-(NSNumber*) isSupported:(id)unused
{
    return NUMBOOL(_isSupported);
}

-(void)startSpeaking:(id)args
{
    ENSURE_SINGLE_ARG(args,NSDictionary);
    ENSURE_UI_THREAD(startSpeaking,args);
    
    if(!_isSupported){
        if ([self _hasListeners:@"errored"]) {
            NSDictionary *errorEvent = [NSDictionary dictionaryWithObjectsAndKeys:
                                        @"iOS 7 or greater is required for this feature",@"error",
                                        nil
                                        ];
            
            [self fireEvent:@"errored" withObject:errorEvent];
        }
        return;
    }
    
    // queue:true adds this text after the one being spoken; AVSpeechSynthesizer queues it.
    BOOL queue = [TiUtils boolValue:@"queue" properties:args def:NO];
    if(_isSpeaking && !queue){
        NSLog(@"[DEBUG] Already speaking");
        return;
    }
    
    if([args valueForKey:@"text"] == nil){
        if ([self _hasListeners:@"errored"]) {
            NSDictionary *errorEvent = [NSDictionary dictionaryWithObjectsAndKeys:
                                        @"text parameter is required",@"error",
                                        nil
                                        ];
            
            [self fireEvent:@"errored" withObject:errorEvent];
        }
        return;
    }
    
    _text = [TiUtils stringValue:@"text" properties:args];
    _voice = [TiUtils stringValue:@"voice" properties:args def:@"auto"];
    
    AVSpeechUtterance *utterance = [AVSpeechUtterance speechUtteranceWithString:_text];
    
    if( [_voice caseInsensitiveCompare:@"auto"] == NSOrderedSame )
    {
        _voice = [self voiceLanguageForText:_text];
    }
    
    // AVSpeechSynthesisVoice expects BCP-47 codes ("es-MX"); accept the Android-style "es_MX" too.
    _voice = [_voice stringByReplacingOccurrencesOfString:@"_" withString:@"-"];

    // voiceId (an identifier from the "voices" event) wins. voiceWithIdentifier: returns nil when the
    // user deleted that voice, and then the language's default voice speaks instead.
    NSString *voiceId = [TiUtils stringValue:@"voiceId" properties:args def:nil];
    AVSpeechSynthesisVoice *chosen = voiceId.length > 0 ? [AVSpeechSynthesisVoice voiceWithIdentifier:voiceId] : nil;
    // bestVoice: the highest-quality installed voice for that language instead of Apple's default one.
    if (chosen == nil && [TiUtils boolValue:@"bestVoice" properties:args def:NO]) {
        chosen = [self bestVoiceFor:_voice];
    }
    utterance.voice = chosen != nil ? chosen : [AVSpeechSynthesisVoice voiceWithLanguage:_voice];
    
    if([args valueForKey:@"rate"] != nil){
        float rate = [TiUtils floatValue:@"rate" properties:args def:AVSpeechUtteranceDefaultSpeechRate];
        if((rate >=AVSpeechUtteranceMinimumSpeechRate)&&(rate<=AVSpeechUtteranceMaximumSpeechRate)){
            utterance.rate = rate;
        }else{
            NSLog(@"[ERROR] provided rate %f must be between %f and %f", rate,AVSpeechUtteranceMinimumSpeechRate,AVSpeechUtteranceMaximumSpeechRate);
        }
    }
    
    if([args valueForKey:@"pitchMultiplier"] != nil){
        float pitchMultiplier = [TiUtils floatValue:@"pitchMultiplier" properties:args def:1];
        if((pitchMultiplier >=0.5f)&&(pitchMultiplier<=2.0f)){
            utterance.pitchMultiplier = pitchMultiplier;
        }else{
            NSLog(@"[ERROR] provided pitchMultiplier %f must be between 0.5 and 2", pitchMultiplier);
        }
    }
    
    if([args valueForKey:@"volume"] != nil){
        float volume = [TiUtils floatValue:@"volume" properties:args def:1];
        if((volume >=0.0f)&&(volume<=1.0f)){
            utterance.volume = volume;
        }else{
            NSLog(@"[ERROR] provided volume %f must be between 0 and 1", volume);
        }
    }
    
    if([args valueForKey:@"preUtteranceDelay"] != nil){
        float preUtteranceDelay = [TiUtils floatValue:@"preUtteranceDelay" properties:args def:0.0f];
        utterance.preUtteranceDelay = [[NSNumber numberWithFloat:preUtteranceDelay] doubleValue];
    }
    
    if([args valueForKey:@"postUtteranceDelay"] != nil){
        float postUtteranceDelay = [TiUtils floatValue:@"postUtteranceDelay" properties:args def:0.0f];
        utterance.postUtteranceDelay = [[NSNumber numberWithFloat:postUtteranceDelay] doubleValue];
    }
    
    [self.speechSynthesizer speakUtterance:utterance];

    _pending++;
    _isSpeaking = YES;
}

-(void)continueSpeaking:(id)unused
{
    if(!_isSpeaking){
        [self.speechSynthesizer continueSpeaking];
    }
    _isSpeaking = YES;
}
-(void)pauseSpeaking:(id)value
{
    if(_isSpeaking){
        if(value !=nil){
            ENSURE_SINGLE_ARG(value, NSNumber);
            if([value integerValue] == cSpeechBoundaryWord){
                [self.speechSynthesizer pauseSpeakingAtBoundary:AVSpeechBoundaryWord];
                NSLog(@"[DEBUG] pausing at word boundary");
            }else{
                [self.speechSynthesizer pauseSpeakingAtBoundary:AVSpeechBoundaryImmediate];
                NSLog(@"[DEBUG] pausing immediately");
            }
        }else{
            [self.speechSynthesizer pauseSpeakingAtBoundary:AVSpeechBoundaryImmediate];
        }
    }
    _isSpeaking = NO;
}
-(void)stopSpeaking:(id)value
{
    if(_isSpeaking){
        if(value !=nil){
            ENSURE_SINGLE_ARG(value, NSNumber);
            if([value integerValue] == cSpeechBoundaryWord){
                [self.speechSynthesizer stopSpeakingAtBoundary:AVSpeechBoundaryWord];
                NSLog(@"[DEBUG] stopped at word boundary");
            }else{
                [self.speechSynthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
                NSLog(@"[DEBUG] stopped immediately");
            }
        }else{
            [self.speechSynthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
        }
    }
    _pending = 0;
    [self doCallListener:@"stopped"];
    _isSpeaking = NO;
}

-(id)isSpeaking
{
	return NUMBOOL(_isSpeaking);
}

// v3.0 Unified API: Method version for Android compatibility
- (NSNumber *)isSpeaking:(id)args
{
    return NUMBOOL(_isSpeaking);
}

-(void) doCallListener:(NSString*)name
{
    if ([self _hasListeners:name]) {
        NSDictionary *event = [NSDictionary dictionaryWithObjectsAndKeys:
                               NUMBOOL(YES),@"success",
                               NUMBOOL(_isSpeaking),@"speaking",
                               _text,@"text",
                               _voice,@"voice",
                               nil
                               ];
        [self fireEvent:name withObject:event];
    }
}
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didCancelSpeechUtterance:(AVSpeechUtterance *)utterance{
    if (_pending > 0) { _pending--; }
    _isSpeaking = NO;
    [self doCallListener:@"canceled"];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didContinueSpeechUtterance:(AVSpeechUtterance *)utterance{
    _isSpeaking = YES;
    [self doCallListener:@"continued"];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didFinishSpeechUtterance:(AVSpeechUtterance *)utterance{
    if (_pending > 0) { _pending--; }
    // With queue:true, "completed" means the whole queue is done, as on Android.
    if (_pending > 0) { return; }
    _isSpeaking = NO;
    [self doCallListener:@"completed"];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didPauseSpeechUtterance:(AVSpeechUtterance *)utterance{
    _isSpeaking = NO;
    [self doCallListener:@"paused"];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didStartSpeechUtterance:(AVSpeechUtterance *)utterance{
    _isSpeaking = YES;
    [self doCallListener:@"started"];
}

// iOS Speech Rate Constants - Direct implementation (required for correct evaluation)
-(NSNumber*)DEFAULT_SPEECH_RATE
{
    return [NSNumber numberWithFloat:AVSpeechUtteranceDefaultSpeechRate];
}

-(NSNumber*)MIN_SPEECH_RATE
{
    return [NSNumber numberWithFloat:AVSpeechUtteranceMinimumSpeechRate];
}

-(NSNumber*)MAX_SPEECH_RATE
{
    return [NSNumber numberWithFloat:AVSpeechUtteranceMaximumSpeechRate];
}

MAKE_SYSTEM_PROP(SPEECH_BOUNDARY_IMMEDIATE,cSpeechBoundaryImmeiate);
MAKE_SYSTEM_PROP(SPEECH_BOUNDARY_WORD,cSpeechBoundaryWord);

// ========================================
// v3.0+ Cross-Platform Speech Rate Constants (Perceptually Equivalent)
// ========================================
// These constants provide perceptually equivalent speech rates across iOS/Android
// Optimized for real-world user experience rather than mathematical equivalence
// iOS range: 0.0-1.0 | Android range: 0.1-3.0
// Users can use these directly with the 'rate' property without platform conditionals

-(NSNumber*)VERY_SLOW_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.25f]; // Reduced from 0.3f - perceptually equivalent to Android 0.4f
}

-(NSNumber*)SLOW_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.35f];  // Reduced from 0.45f - perceptually equivalent to Android 0.6f
}

-(NSNumber*)FAST_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.55f];  // Reduced from 0.75f - perceptually equivalent to Android 1.3f
}

-(NSNumber*)VERY_FAST_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.65f]; // Reduced from 0.9f - perceptually equivalent to Android 1.6f
}

// ========================================
// Mathematical Equivalence Constants (Optional/Advanced)
// ========================================
// For developers who prefer mathematical precision over perceptual equivalence
// Formula: ios_value = (android_value - 0.1) ÷ 2.9

-(NSNumber*)MATH_VERY_SLOW_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.125f]; // Exact math equivalent to Android 0.475f
}

-(NSNumber*)MATH_SLOW_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.25f];  // Exact math equivalent to Android 0.825f
}

-(NSNumber*)MATH_FAST_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.625f]; // Exact math equivalent to Android 1.875f
}

-(NSNumber*)MATH_VERY_FAST_SPEECH_RATE
{
    return [NSNumber numberWithFloat:0.75f];  // Exact math equivalent to Android 2.275f
}

/**
 * Highest-quality installed voice for a BCP-47 language such as "es-MX": same region first, then
 * any region of that language. Novelty voices are skipped.
 */
- (AVSpeechSynthesisVoice *)bestVoiceFor:(NSString *)language
{
    // speechVoices is not free; the answer for a language does not change while the app runs.
    static NSMutableDictionary<NSString *, NSString *> *cache = nil;
    if (cache == nil) {
        cache = [NSMutableDictionary dictionary];
    }
    NSString *cached = cache[language];
    if (cached != nil) {
        return cached.length > 0 ? [AVSpeechSynthesisVoice voiceWithIdentifier:cached] : nil;
    }

    NSString *base = [[language componentsSeparatedByString:@"-"] firstObject];
    AVSpeechSynthesisVoice *best = nil;
    NSInteger bestScore = -1;

    for (AVSpeechSynthesisVoice *voice in [AVSpeechSynthesisVoice speechVoices]) {
        if (@available(iOS 17.0, *)) {
            if (voice.voiceTraits & AVSpeechSynthesisVoiceTraitIsNoveltyVoice) {
                continue;
            }
        }
        NSString *voiceBase = [[voice.language componentsSeparatedByString:@"-"] firstObject];
        if (![voiceBase isEqualToString:base]) {
            continue;
        }
        NSInteger score = ([voice.language isEqualToString:language] ? 1000 : 0) + voice.quality;
        if (score > bestScore) {
            bestScore = score;
            best = voice;
        }
    }

    cache[language] = best != nil ? best.identifier : @"";
    return best;
}

/**
 * Installed voices, delivered in a "voices" event with the same shape as on Android:
 * { id, name, language, quality: "default" | "enhanced" | "premium" }. Novelty voices are left out.
 */
-(void)requestVoices:(id)unused
{
    NSMutableArray *list = [NSMutableArray array];

    for (AVSpeechSynthesisVoice *voice in [AVSpeechSynthesisVoice speechVoices]) {
        if (@available(iOS 17.0, *)) {
            if (voice.voiceTraits & AVSpeechSynthesisVoiceTraitIsNoveltyVoice) {
                continue;
            }
        }

        NSString *quality = @"default";
        if (voice.quality == AVSpeechSynthesisVoiceQualityEnhanced) {
            quality = @"enhanced";
        } else if (@available(iOS 16.0, *)) {
            if (voice.quality == AVSpeechSynthesisVoiceQualityPremium) {
                quality = @"premium";
            }
        }

        [list addObject:@{
            @"id": voice.identifier,
            @"name": voice.name ? voice.name : @"",
            @"language": voice.language ? voice.language : @"",
            @"quality": quality
        }];
    }

    [self fireEvent:@"voices" withObject:@{ @"voices": list }];
}

/**
 * Get available voices using modern iOS AVSpeechSynthesisVoice API
 * @return Array of available voice information
 */
-(NSArray*)getModernVoices:(id)unused
{
    NSArray *voices = [AVSpeechSynthesisVoice speechVoices];
    NSMutableArray *result = [NSMutableArray arrayWithCapacity:[voices count]];
    
    for (AVSpeechSynthesisVoice *voice in voices) {
        NSDictionary *voiceInfo = @{
            @"name": voice.name ? voice.name : @"Unknown",
            @"language": voice.language ? voice.language : @"Unknown",
            @"identifier": voice.identifier ? voice.identifier : @"Unknown",
            @"quality": @(voice.quality)
        };
        [result addObject:voiceInfo];
    }
    
    return result;
}

/**
 * Get available languages using modern iOS AVSpeechSynthesisVoice API
 * @return Array of available language codes
 */
-(NSArray*)getModernLanguages:(id)unused
{
    NSArray *voices = [AVSpeechSynthesisVoice speechVoices];
    NSMutableSet *languageSet = [NSMutableSet set];
    
    for (AVSpeechSynthesisVoice *voice in voices) {
        if (voice.language) {
            [languageSet addObject:voice.language];
        }
    }
    
    return [languageSet allObjects];
}

@end
