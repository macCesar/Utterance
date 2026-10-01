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
#import "TiBlob.h"
#import <AVFoundation/AVFoundation.h>

static NSString *const kErrorDomain = @"BencodingUtterance";

// The best voice for a language does not change while the app runs, except when the system reports new voices.
static NSMutableDictionary<NSString *, NSString *> *gBestVoiceCache = nil;

// The first utterance of the process reconfigures the audio session (the IO buffer goes from 23.2 ms to 5 ms), and
// that is what clicks. One silent utterance per process takes the reconfiguration out of the first real one.
static BOOL gAudioPrepared = NO;

// Seconds without a buffer from the synthesizer before synthesizeToFile gives up
static const CFTimeInterval kSynthesisIdleLimit = 20.0;
// The speaker hardware stops about 2.1 s after the last sound and starts cold with the next, and a cold start under the
// first word clicks. After more than kSpeakerIdleLimit of silence the speech waits for a silence that wakes the speaker.
static const CFTimeInterval kSpeakerIdleLimit = 1.8;
static const float kSpeakerWakeDelay = 0.2f;

static inline void UtteranceOnMain(dispatch_block_t block)
{
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_async(dispatch_get_main_queue(), block);
    }
}

#pragma mark Per-utterance context

// What an event needs to say about one utterance. Callbacks of the synthesizer arrive for a specific utterance, so the
// text and the voice come from here and not from whatever was spoken last.
@interface BencodingUtteranceContext : NSObject
@property(nonatomic, copy) NSString *identifier;
@property(nonatomic, copy) NSString *text;
@property(nonatomic, copy) NSString *voice;
// Cut off by a newer utterance: its callbacks no longer touch the state or fire events
@property(nonatomic, assign) BOOL superseded;
@property(nonatomic, strong) AVSpeechUtterance *utterance;
// A silence is a pause of silenceMs that the proxy times itself: the synthesizer delays are not reliable
@property(nonatomic, assign) BOOL silence;
@property(nonatomic, assign) double silenceMs;
// Handed to the synthesizer and not finished or canceled yet
@property(nonatomic, assign) BOOL fed;
// Seconds of silence that wake a speaker that went idle before this utterance speaks; 0 speaks at once
@property(nonatomic, assign) float wakeDelay;
@end

@implementation BencodingUtteranceContext
@end

#pragma mark Synthesis job

@interface BencodingUtteranceSynthesisJob : NSObject
@property(nonatomic, copy) NSString *identifier;
@property(nonatomic, strong) NSURL *url;
@property(nonatomic, strong) AVSpeechSynthesizer *synthesizer;
@property(nonatomic, strong) AVAudioFile *file;
@property(nonatomic, strong) AVAudioConverter *converter;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *markers;
@property(nonatomic, assign) BOOL wantMarkers;
@property(nonatomic, assign) BOOL finished;
@property(nonatomic, assign) AVAudioFramePosition frames;
@property(nonatomic, assign) double sampleRate;
// Bytes per frame of the buffers the synthesizer delivers: marker offsets are counted in those bytes
@property(nonatomic, assign) UInt32 bytesPerFrame;
@property(atomic, assign) CFAbsoluteTime lastActivity;
@property(nonatomic, strong) dispatch_queue_t queue;
@end

@implementation BencodingUtteranceSynthesisJob
@end

@interface BencodingUtteranceSpeechProxy () {
    // Utterances queued or speaking, oldest first. Only the main queue touches these.
    NSMutableArray<BencodingUtteranceContext *> *_active;
    NSMapTable *_contexts; // AVSpeechUtterance -> context, by identity
    BencodingUtteranceContext *_latest; // the last one queued: the only one that reports "canceled"
    BencodingUtteranceContext *_last; // the last one that spoke, for events with no utterance of their own ("stopped")
    NSMutableSet<BencodingUtteranceSynthesisJob *> *_jobs;
    // Not handed to the synthesizer yet: whatever waits behind a silence, and the silence itself until its turn
    NSMutableArray<BencodingUtteranceContext *> *_held;
    BencodingUtteranceContext *_silenceCtx; // the silence that is playing now
    NSInteger _fedCount; // utterances inside the synthesizer
    AVSpeechUtterance *_warmUtterance;
    id _voicesObserver;
    AVAudioPlayer *_wakePlayer; // plays silence, in a loop, from the wake until the speech ends
    BOOL _waking; // the first utterance waits for the speaker to wake
    NSUInteger _wakeToken; // a timer of an earlier wake that no longer applies compares unequal
    CFAbsoluteTime _lastAudioEnd; // when the speech or the silence last ended: the speaker idles from then
}
// Written on the main queue, read from any thread
@property(atomic, assign) BOOL speakingFlag;
@property(atomic, assign) BOOL pausedFlag;
@property(atomic, assign) NSInteger pendingCount;
@end

@implementation BencodingUtteranceSpeechProxy

int const cSpeechBoundaryImmeiate = 0;
int const cSpeechBoundaryWord = 1;


-(void)_configure
{
    _isSupported = NO;
    _active = [NSMutableArray array];
    _contexts = [NSMapTable mapTableWithKeyOptions:(NSPointerFunctionsStrongMemory | NSPointerFunctionsObjectPointerPersonality)
                                      valueOptions:NSPointerFunctionsStrongMemory];
    _jobs = [NSMutableSet set];
    _held = [NSMutableArray array];

    if(NSClassFromString(@"AVSpeechSynthesizer"))
    {
        _isSupported=YES;
        self.speechSynthesizer = [AVSpeechSynthesizer new];
        self.speechSynthesizer.delegate = self;

        if (@available(iOS 17.0, *)) {
            __weak BencodingUtteranceSpeechProxy *weakSelf = self;
            _voicesObserver = [[NSNotificationCenter defaultCenter] addObserverForName:AVSpeechSynthesisAvailableVoicesDidChangeNotification
                                                                                object:nil
                                                                                 queue:[NSOperationQueue mainQueue]
                                                                            usingBlock:^(NSNotification *note) {
                gBestVoiceCache = nil;
                [weakSelf fire:@"voiceschanged" payload:@{ @"success": @YES }];
            }];
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            [self prepareAudioForFirstUtterance];
        });
    }

	[super _configure];
}

-(void)_destroy
{
    if (_voicesObserver != nil) {
        [[NSNotificationCenter defaultCenter] removeObserver:_voicesObserver];
        _voicesObserver = nil;
    }
    for (BencodingUtteranceSynthesisJob *job in _jobs) {
        job.finished = YES;
        [job.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
    [_jobs removeAllObjects];
    if(self.speechSynthesizer!=nil){
        self.speechSynthesizer.delegate = nil;
        self.speechSynthesizer = nil;
    }
    [_active removeAllObjects];
    [_held removeAllObjects];
    [_contexts removeAllObjects];
    _latest = nil;
    _last = nil;
    _silenceCtx = nil;
    _warmUtterance = nil;
    [self endWake];

	[super _destroy];
}

#pragma mark Audio warm-up

/**
 * One silent utterance per process, with the default voice. It makes the first real utterance start with the audio
 * session already configured, so it neither clicks nor loses its first syllable. It touches no counter, fires no event
 * and has no context: the delegate callbacks recognize it by pointer and return at once.
 */
-(void)prepareAudioForFirstUtterance
{
    if (!_isSupported || gAudioPrepared) {
        return;
    }
    gAudioPrepared = YES;
    if (self.speechSynthesizer.speaking) {
        return; // something is already playing, so the audio is configured
    }
    AVSpeechUtterance *warm = [AVSpeechUtterance speechUtteranceWithString:@" "];
    warm.volume = 0;
    _warmUtterance = warm;
    [self.speechSynthesizer speakUtterance:warm];
}

// Public and idempotent: for apps that create the proxy late. Creating the proxy already warms up.
-(void)warmUp:(id)unused
{
    ENSURE_UI_THREAD(warmUp,unused);
    [self prepareAudioForFirstUtterance];
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

#pragma mark Events

// Events fire only when the app has a listener at that moment, and never inside the call that caused them: a method
// that answers at once (an invalid option, an empty queue) would otherwise fire before its caller could wait for the
// event. Android posts to its main handler for the same reason.
- (void)fire:(NSString *)name payload:(NSDictionary *)payload
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if ([self _hasListeners:name]) {
            [self fireEvent:name withObject:payload];
        }
    });
}

- (NSMutableDictionary *)payloadForContext:(BencodingUtteranceContext *)ctx success:(BOOL)success
{
    return [@{
        @"success": @(success),
        @"speaking": @(self.speakingFlag),
        @"text": ctx.text ?: @"",
        @"voice": ctx.voice ?: @"",
        @"utteranceId": ctx.identifier ?: @""
    } mutableCopy];
}

- (void)fireLifecycle:(NSString *)name context:(BencodingUtteranceContext *)ctx
{
    [self fire:name payload:[self payloadForContext:ctx success:YES]];
}

/**
 * A failure reaches the app as "completed" with success false, as on Android, and also as the "error" event Android
 * fires. "errored" is the name this proxy used before and stays for the apps that listen to it.
 */
- (void)failWithCode:(NSString *)code message:(NSString *)message nativeError:(NSError *)nativeError context:(BencodingUtteranceContext *)ctx
{
    NSMutableDictionary *event = [self payloadForContext:ctx success:NO];
    event[@"code"] = code;
    event[@"message"] = message;
    if (nativeError) {
        event[@"nativeCode"] = @(nativeError.code);
        event[@"nativeDomain"] = nativeError.domain;
    }
    [self fire:@"completed" payload:event];
    NSDictionary *errorEvent = @{ @"success": @NO, @"error": message, @"message": message, @"code": code };
    [self fire:@"error" payload:errorEvent];
    [self fire:@"errored" payload:errorEvent];
}

- (void)failWithFailure:(NSDictionary *)failure context:(BencodingUtteranceContext *)ctx
{
    [self failWithCode:failure[@"code"] message:failure[@"message"] nativeError:nil context:ctx];
}

#pragma mark Building an utterance

- (NSString *)plainTextFromSSML:(NSString *)ssml
{
    return [ssml stringByReplacingOccurrencesOfString:@"<[^>]*>" withString:@" " options:NSRegularExpressionSearch range:NSMakeRange(0, ssml.length)];
}

/**
 * The utterance and its context from the options of startSpeaking and synthesizeToFile. On failure returns nil and
 * fills failure with { code, message }.
 */
- (AVSpeechUtterance *)utteranceFromOptions:(NSDictionary *)args context:(BencodingUtteranceContext *)ctx failure:(NSDictionary **)failure
{
    NSString *text = [args objectForKey:@"text"] != nil ? [TiUtils stringValue:@"text" properties:args] : nil;
    if (text == nil) {
        *failure = @{ @"code": @"invalid_argument", @"message": @"text parameter is required" };
        return nil;
    }
    if ([[text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] length] == 0) {
        *failure = @{ @"code": @"invalid_argument", @"message": @"text is empty" };
        return nil;
    }
    ctx.text = text;
    ctx.wakeDelay = MAX([TiUtils floatValue:@"speakerWakeDelay" properties:args def:kSpeakerWakeDelay], 0.0f);
    BOOL ssml = [TiUtils boolValue:@"ssml" properties:args def:NO];

    NSString *voice = [TiUtils stringValue:@"voice" properties:args def:@"auto"];
    if( [voice caseInsensitiveCompare:@"auto"] == NSOrderedSame )
    {
        voice = [self voiceLanguageForText:(ssml ? [self plainTextFromSSML:text] : text)];
    }
    // AVSpeechSynthesisVoice expects BCP-47 codes ("es-MX"); accept the Android-style "es_MX" too.
    voice = [voice stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
    ctx.voice = voice;

    AVSpeechUtterance *utterance = nil;
    if (ssml) {
        if (@available(iOS 16.0, *)) {
            utterance = [AVSpeechUtterance speechUtteranceWithSSMLRepresentation:text];
            if (utterance == nil) {
                *failure = @{ @"code": @"invalid_argument", @"message": @"The SSML could not be parsed" };
                return nil;
            }
        } else {
            *failure = @{ @"code": @"unsupported", @"message": @"SSML needs iOS 16" };
            return nil;
        }
    } else {
        NSArray *pronunciations = [args objectForKey:@"pronunciations"];
        if ([pronunciations isKindOfClass:[NSArray class]] && pronunciations.count > 0) {
            NSMutableAttributedString *attributed = [[NSMutableAttributedString alloc] initWithString:text];
            for (id item in pronunciations) {
                NSInteger start = [item isKindOfClass:[NSDictionary class]] ? [TiUtils intValue:@"start" properties:item def:-1] : -1;
                NSInteger end = [item isKindOfClass:[NSDictionary class]] ? [TiUtils intValue:@"end" properties:item def:-1] : -1;
                NSString *ipa = [item isKindOfClass:[NSDictionary class]] ? [TiUtils stringValue:@"ipa" properties:item def:nil] : nil;
                if (start < 0 || end <= start || end > (NSInteger)attributed.length || ipa.length == 0) {
                    *failure = @{ @"code": @"invalid_argument", @"message": @"Each pronunciation needs start, end and ipa, and the range must lie inside the text" };
                    return nil;
                }
                [attributed addAttribute:AVSpeechSynthesisIPANotationAttribute value:ipa range:NSMakeRange(start, end - start)];
            }
            utterance = [AVSpeechUtterance speechUtteranceWithAttributedString:attributed];
        } else {
            utterance = [AVSpeechUtterance speechUtteranceWithString:text];
        }
    }

    // voiceId (an identifier from the "voices" event) wins. voiceWithIdentifier: returns nil when the
    // user deleted that voice, and then the language's default voice speaks instead.
    NSString *voiceId = [TiUtils stringValue:@"voiceId" properties:args def:nil];
    AVSpeechSynthesisVoice *chosen = voiceId.length > 0 ? [AVSpeechSynthesisVoice voiceWithIdentifier:voiceId] : nil;
    // bestVoice: the highest-quality installed voice for that language instead of Apple's default one.
    if (chosen == nil && [TiUtils boolValue:@"bestVoice" properties:args def:NO]) {
        chosen = [self bestVoiceFor:voice];
    }
    utterance.voice = chosen != nil ? chosen : [AVSpeechSynthesisVoice voiceWithLanguage:voice];

    if([args valueForKey:@"rate"] != nil){
        float rate = [TiUtils floatValue:@"rate" properties:args def:AVSpeechUtteranceDefaultSpeechRate];
        if((rate >=AVSpeechUtteranceMinimumSpeechRate)&&(rate<=AVSpeechUtteranceMaximumSpeechRate)){
            utterance.rate = rate;
        }else{
            NSLog(@"[ERROR] provided rate %f must be between %f and %f", rate,AVSpeechUtteranceMinimumSpeechRate,AVSpeechUtteranceMaximumSpeechRate);
        }
    }

    // pitch is the Android name for the same thing
    NSString *pitchKey = [args valueForKey:@"pitchMultiplier"] != nil ? @"pitchMultiplier" : ([args valueForKey:@"pitch"] != nil ? @"pitch" : nil);
    if(pitchKey != nil){
        float pitchMultiplier = [TiUtils floatValue:pitchKey properties:args def:1];
        if((pitchMultiplier >=0.5f)&&(pitchMultiplier<=2.0f)){
            utterance.pitchMultiplier = pitchMultiplier;
        }else{
            NSLog(@"[ERROR] provided %@ %f must be between 0.5 and 2", pitchKey, pitchMultiplier);
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

    if([args valueForKey:@"prefersAssistiveTechnologySettings"] != nil){
        utterance.prefersAssistiveTechnologySettings = [TiUtils boolValue:@"prefersAssistiveTechnologySettings" properties:args def:NO];
    }

    return utterance;
}

#pragma mark Audio session options

// usesApplicationAudioSession and mixToTelephonyUplink belong to the synthesizer, so they stay set after the call.
// audioUsage sets the category and mode of the app's own session, which only matters while the synthesizer uses it.
- (void)applySessionOptions:(NSDictionary *)args
{
    if([args valueForKey:@"usesApplicationAudioSession"] != nil){
        self.speechSynthesizer.usesApplicationAudioSession = [TiUtils boolValue:@"usesApplicationAudioSession" properties:args def:YES];
    }
    if([args valueForKey:@"mixToTelephonyUplink"] != nil){
        self.speechSynthesizer.mixToTelephonyUplink = [TiUtils boolValue:@"mixToTelephonyUplink" properties:args def:NO];
    }

    NSString *usage = [TiUtils stringValue:@"audioUsage" properties:args def:nil];
    if (usage.length == 0 || !self.speechSynthesizer.usesApplicationAudioSession) {
        return;
    }
    NSString *category = AVAudioSessionCategoryPlayback;
    NSString *mode = AVAudioSessionModeDefault;
    if ([usage isEqualToString:@"assistant"] || [usage isEqualToString:@"accessibility"]) {
        mode = AVAudioSessionModeSpokenAudio;
    } else if ([usage isEqualToString:@"notification"]) {
        category = AVAudioSessionCategoryAmbient;
    } else if (![usage isEqualToString:@"media"] && ![usage isEqualToString:@"alarm"]) {
        NSLog(@"[ERROR] audioUsage '%@' is not one of media, assistant, notification, alarm, accessibility", usage);
        return;
    }
    NSError *error = nil;
    if (![[AVAudioSession sharedInstance] setCategory:category mode:mode options:0 error:&error]) {
        NSLog(@"[ERROR] could not set the audio session for audioUsage '%@': %@", usage, error.localizedDescription);
    }
}

#pragma mark Speaking

/**
 * Cuts off whatever sounds or waits: startSpeaking without queue:true replaces the current speech, as on Android.
 * The cut-off utterances answer silently, so their callbacks cannot touch the state of the utterance that follows.
 */
- (void)cutOffCurrent
{
    for (BencodingUtteranceContext *ctx in _active) {
        ctx.superseded = YES;
        ctx.fed = NO;
    }
    [_active removeAllObjects];
    [_held removeAllObjects];
    _silenceCtx = nil;
    _fedCount = 0;
    _waking = NO;
    _wakeToken++;
    [self.speechSynthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    self.pendingCount = 0;
    self.speakingFlag = NO;
    self.pausedFlag = NO;
}

- (void)enqueue:(BencodingUtteranceContext *)ctx
{
    [_active addObject:ctx];
    _latest = ctx;
    _last = ctx;
    self.pendingCount = _active.count;
    self.speakingFlag = YES;
    [_held addObject:ctx];
    [self releaseHeld];
}

/**
 * Hands what is waiting to the synthesizer, in order, up to the next silence. A silence starts when everything before
 * it has finished, and nothing behind it moves until it ends.
 */
- (void)releaseHeld
{
    while (_held.count > 0 && _silenceCtx == nil && !_waking) {
        BencodingUtteranceContext *next = _held.firstObject;
        if (!next.silence && _fedCount == 0 && [self speakerNeedsWake:next.wakeDelay] && [self wakeSpeakerFor:next.wakeDelay]) {
            return;
        }
        [_held removeObjectAtIndex:0];
        if (next.silence) {
            if (_fedCount > 0) {
                [_held insertObject:next atIndex:0];
                return;
            }
            [self startSilence:next];
            return;
        }
        next.fed = YES;
        _fedCount++;
        [_contexts setObject:next forKey:next.utterance];
        [self.speechSynthesizer speakUtterance:next.utterance];
    }
}

#pragma mark Speaker wake

// One second of 16-bit mono silence at 44.1 kHz as a WAV, which AVAudioPlayer loops
static NSData *UtteranceSilentWAV(void)
{
    static NSData *wav;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        const uint32_t rate = 44100, bytes = rate * 2;
        NSMutableData *data = [NSMutableData dataWithLength:44 + bytes];
        uint8_t *p = data.mutableBytes;
        uint32_t u32[] = { OSSwapHostToLittleInt32(36 + bytes), OSSwapHostToLittleInt32(16), OSSwapHostToLittleInt32(rate), OSSwapHostToLittleInt32(rate * 2), OSSwapHostToLittleInt32(bytes) };
        uint16_t u16[] = { OSSwapHostToLittleInt16(1), OSSwapHostToLittleInt16(1), OSSwapHostToLittleInt16(2), OSSwapHostToLittleInt16(16) };
        memcpy(p, "RIFF", 4); memcpy(p + 4, &u32[0], 4); memcpy(p + 8, "WAVEfmt ", 8); memcpy(p + 16, &u32[1], 4);
        memcpy(p + 20, &u16[0], 2); memcpy(p + 22, &u16[1], 2); memcpy(p + 24, &u32[2], 4); memcpy(p + 28, &u32[3], 4);
        memcpy(p + 32, &u16[2], 2); memcpy(p + 34, &u16[3], 2); memcpy(p + 36, "data", 4); memcpy(p + 40, &u32[4], 4);
        wav = data;
    });
    return wav;
}

// The built-in speaker, idle for longer than it takes to power down, and nothing of ours already playing through it
- (BOOL)speakerNeedsWake:(float)delay
{
    if (delay <= 0 || _wakePlayer.playing || CFAbsoluteTimeGetCurrent() - _lastAudioEnd < kSpeakerIdleLimit) {
        return NO;
    }
    for (AVAudioSessionPortDescription *port in [AVAudioSession sharedInstance].currentRoute.outputs) {
        if ([port.portType isEqualToString:AVAudioSessionPortBuiltInSpeaker]) {
            return YES;
        }
    }
    return NO;
}

// Starts the silence and holds the queue for delay seconds. NO when the silence could not start: the speech goes on at once.
- (BOOL)wakeSpeakerFor:(float)delay
{
    NSError *error = nil;
    AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithData:UtteranceSilentWAV() fileTypeHint:AVFileTypeWAVE error:&error];
    player.numberOfLoops = -1;
    if (player == nil || ![player prepareToPlay] || ![player play]) {
        NSLog(@"[DEBUG] the speaker wake could not start: %@", error.localizedDescription);
        _lastAudioEnd = CFAbsoluteTimeGetCurrent();
        return NO;
    }
    _wakePlayer = player;
    _waking = YES;
    NSUInteger token = ++_wakeToken;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (token != self->_wakeToken) {
            return;
        }
        self->_waking = NO;
        [self releaseHeld];
    });
    return YES;
}

// The queue is empty or stopped: the silence ends, and the speaker idles from now
- (void)endWake
{
    _waking = NO;
    _wakeToken++;
    [_wakePlayer stop];
    _wakePlayer = nil;
    _lastAudioEnd = CFAbsoluteTimeGetCurrent();
}

- (void)startSilence:(BencodingUtteranceContext *)ctx
{
    _silenceCtx = ctx;
    _last = ctx;
    self.speakingFlag = YES;
    [self fireLifecycle:@"started" context:ctx];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(ctx.silenceMs * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        [self silenceDidEnd:ctx];
    });
}

- (void)silenceDidEnd:(BencodingUtteranceContext *)ctx
{
    if (ctx.superseded || _silenceCtx != ctx) {
        return;
    }
    _silenceCtx = nil;
    [_active removeObject:ctx];
    self.pendingCount = _active.count;
    [self releaseHeld];
    // "completed" means the whole queue is done, as with speech
    if (_active.count == 0) {
        self.speakingFlag = NO;
        self.pausedFlag = NO;
        [self fireLifecycle:@"completed" context:ctx];
    }
}

-(void)startSpeaking:(id)args
{
    ENSURE_SINGLE_ARG(args,NSDictionary);
    ENSURE_UI_THREAD(startSpeaking,args);

    BencodingUtteranceContext *ctx = [BencodingUtteranceContext new];
    ctx.identifier = [[NSUUID UUID] UUIDString];

    if(!_isSupported){
        [self failWithCode:@"unsupported" message:@"AVSpeechSynthesizer is not available" nativeError:nil context:ctx];
        return;
    }

    NSDictionary *failure = nil;
    AVSpeechUtterance *utterance = [self utteranceFromOptions:args context:ctx failure:&failure];
    if (utterance == nil) {
        [self failWithFailure:failure context:ctx];
        return;
    }

    // queue:true adds this text after the one being spoken; AVSpeechSynthesizer queues it.
    BOOL queue = [TiUtils boolValue:@"queue" properties:args def:NO];
    if (!queue && (_active.count > 0 || self.speechSynthesizer.speaking || self.speechSynthesizer.paused)) {
        [self cutOffCurrent];
    }

    [self applySessionOptions:args];
    ctx.utterance = utterance;
    [self enqueue:ctx];
}

/**
 * Silence of ms milliseconds, timed by the proxy: the synthesizer's preUtteranceDelay and postUtteranceDelay changed
 * nothing that could be measured on the iOS 27 simulator. It fires started and completed like an utterance with an
 * empty text. With queue:true it waits its turn; without it, it replaces what is playing, like startSpeaking.
 */
-(void)playSilence:(id)args
{
    ENSURE_UI_THREAD(playSilence,args);

    BencodingUtteranceContext *ctx = [BencodingUtteranceContext new];
    ctx.identifier = [[NSUUID UUID] UUIDString];
    ctx.text = @"";
    ctx.voice = @"";

    NSNumber *ms = [args isKindOfClass:[NSArray class]] && [args count] > 0 ? [args objectAtIndex:0] : nil;
    NSDictionary *options = [args isKindOfClass:[NSArray class]] && [args count] > 1 && [[args objectAtIndex:1] isKindOfClass:[NSDictionary class]] ? [args objectAtIndex:1] : @{};
    if (!_isSupported) {
        [self failWithCode:@"unsupported" message:@"AVSpeechSynthesizer is not available" nativeError:nil context:ctx];
        return;
    }
    if (![ms isKindOfClass:[NSNumber class]] || [ms doubleValue] < 0) {
        [self failWithCode:@"invalid_argument" message:@"playSilence needs a duration in milliseconds" nativeError:nil context:ctx];
        return;
    }

    ctx.silence = YES;
    ctx.silenceMs = [ms doubleValue];

    BOOL queue = [TiUtils boolValue:@"queue" properties:options def:NO];
    if (!queue && (_active.count > 0 || self.speechSynthesizer.speaking || self.speechSynthesizer.paused)) {
        [self cutOffCurrent];
    }
    [self enqueue:ctx];
}

-(void)continueSpeaking:(id)unused
{
    ENSURE_UI_THREAD(continueSpeaking,unused);
    if(self.pausedFlag || self.speechSynthesizer.paused){
        [self.speechSynthesizer continueSpeaking];
        self.speakingFlag = YES;
        self.pausedFlag = NO;
    }
}

-(void)pauseSpeaking:(id)value
{
    ENSURE_UI_THREAD(pauseSpeaking,value);
    if(self.speakingFlag){
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
    self.speakingFlag = NO;
}

-(void)stopSpeaking:(id)value
{
    ENSURE_UI_THREAD(stopSpeaking,value);
    // Also stops a paused speech: while paused the synthesizer is not speaking, but it still holds the queue
    if(self.speakingFlag || self.pausedFlag || _active.count > 0 || self.speechSynthesizer.speaking || self.speechSynthesizer.paused){
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
    // The utterances stay in the map: their "canceled" callbacks still arrive and the latest one reports. A latest
    // one that never reached the synthesizer (a silence, or something held behind it) has no callback, so it reports here.
    BOOL reportCanceled = _latest != nil && !_latest.fed && [_active containsObject:_latest];
    for (BencodingUtteranceContext *ctx in _active) {
        ctx.fed = NO;
    }
    [_active removeAllObjects];
    [_held removeAllObjects];
    _silenceCtx = nil;
    _fedCount = 0;
    self.pendingCount = 0;
    self.speakingFlag = NO;
    self.pausedFlag = NO;
    [self endWake];
    [self fireLifecycle:@"stopped" context:_last ?: [BencodingUtteranceContext new]];
    if (reportCanceled) {
        [self fireLifecycle:@"canceled" context:_latest];
    }
}

#pragma mark State

-(id)isSpeaking
{
	return NUMBOOL(self.speakingFlag);
}

// v3.0 Unified API: Method version for Android compatibility
- (NSNumber *)isSpeaking:(id)args
{
    return NUMBOOL(self.speakingFlag);
}

- (NSNumber *)isPaused:(id)unused
{
    return NUMBOOL(self.pausedFlag);
}

// queued: utterances waiting behind the one that sounds
- (NSDictionary *)getState:(id)unused
{
    NSInteger pending = self.pendingCount;
    NSInteger queued = pending - ((self.speakingFlag || self.pausedFlag) && pending > 0 ? 1 : 0);
    return @{ @"speaking": @(self.speakingFlag), @"paused": @(self.pausedFlag), @"queued": @(MAX(queued, 0)) };
}

// 0: AVSpeechSynthesizer has no limit on the length of a text
- (NSNumber *)getMaxTextLength:(id)unused
{
    return @0;
}

#pragma mark AVSpeechSynthesizerDelegate

// Callbacks arrive on whichever queue the synthesizer uses. The state and the contexts belong to the main queue, so
// every callback hops there before it touches anything.

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didStartSpeechUtterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        if (utterance == self->_warmUtterance) {
            return;
        }
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        if (ctx == nil || ctx.superseded) {
            return;
        }
        self.speakingFlag = YES;
        self.pausedFlag = NO;
        self->_last = ctx;
        [self fireLifecycle:@"started" context:ctx];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didFinishSpeechUtterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        if (utterance == self->_warmUtterance) {
            self->_warmUtterance = nil;
            return;
        }
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        [self->_contexts removeObjectForKey:utterance];
        if (ctx == nil || ctx.superseded) {
            return;
        }
        if (ctx.fed) {
            ctx.fed = NO;
            self->_fedCount = MAX(self->_fedCount - 1, 0);
        }
        [self->_active removeObject:ctx];
        self.pendingCount = self->_active.count;
        // With queue:true, "completed" means the whole queue is done, as on Android.
        if (self->_active.count > 0) {
            [self releaseHeld];
            return;
        }
        self.speakingFlag = NO;
        self.pausedFlag = NO;
        [self endWake];
        [self fireLifecycle:@"completed" context:ctx];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didCancelSpeechUtterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        if (utterance == self->_warmUtterance) {
            self->_warmUtterance = nil;
            return;
        }
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        [self->_contexts removeObjectForKey:utterance];
        if (ctx == nil || ctx.superseded) {
            return;
        }
        if (ctx.fed) {
            ctx.fed = NO;
            self->_fedCount = MAX(self->_fedCount - 1, 0);
        }
        [self->_active removeObject:ctx];
        self.pendingCount = self->_active.count;
        if (self->_active.count == 0) {
            [self endWake];
        }
        // Only the last utterance queued reports, as on Android
        if (ctx != self->_latest) { return; }
        self.speakingFlag = NO;
        self.pausedFlag = NO;
        [self fireLifecycle:@"canceled" context:ctx];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didPauseSpeechUtterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        if (utterance == self->_warmUtterance || ctx == nil || ctx.superseded) {
            return;
        }
        self.speakingFlag = NO;
        self.pausedFlag = YES;
        [self endWake];
        [self fireLifecycle:@"paused" context:ctx];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didContinueSpeechUtterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        if (utterance == self->_warmUtterance || ctx == nil || ctx.superseded) {
            return;
        }
        self.speakingFlag = YES;
        self.pausedFlag = NO;
        [self fireLifecycle:@"continued" context:ctx];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer willSpeakRangeOfSpeechString:(NSRange)characterRange utterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        if (utterance == self->_warmUtterance || ctx == nil || ctx.superseded || ![self _hasListeners:@"wordstart"]) {
            return;
        }
        // The ranges are offsets in the text the app passed, which is the SSML string when ssml is true;
        // utterance.speechString is not that string for SSML.
        NSString *speech = ctx.text;
        NSString *word = NSMaxRange(characterRange) <= speech.length ? [speech substringWithRange:characterRange] : @"";
        [self fire:@"wordstart" payload:@{
            @"start": @(characterRange.location),
            @"end": @(NSMaxRange(characterRange)),
            @"word": word,
            @"utteranceId": ctx.identifier
        }];
    });
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer willSpeakMarker:(AVSpeechSynthesisMarker *)marker utterance:(AVSpeechUtterance *)utterance{
    UtteranceOnMain(^{
        BencodingUtteranceContext *ctx = [self->_contexts objectForKey:utterance];
        if (utterance == self->_warmUtterance || ctx == nil || ctx.superseded || ![self _hasListeners:@"marker"]) {
            return;
        }
        if (@available(iOS 16.0, *)) {
            NSMutableDictionary *payload = [[self markerInfo:marker] mutableCopy];
            payload[@"utteranceId"] = ctx.identifier;
            [self fire:@"marker" payload:payload];
        }
    });
}

#pragma mark Markers

- (NSString *)markerTypeName:(AVSpeechSynthesisMarkerMark)mark API_AVAILABLE(ios(16.0))
{
    switch (mark) {
        case AVSpeechSynthesisMarkerMarkPhoneme: return @"phoneme";
        case AVSpeechSynthesisMarkerMarkWord: return @"word";
        case AVSpeechSynthesisMarkerMarkSentence: return @"sentence";
        case AVSpeechSynthesisMarkerMarkParagraph: return @"paragraph";
        case AVSpeechSynthesisMarkerMarkBookmark: return @"bookmark";
    }
    return @"unknown";
}

// { kind, start, end, phoneme?, bookmark? }: start and end are character offsets in the text that was spoken (the SSML
// string when ssml is true). The key is kind and not type because Titanium sets type to the event name on every event.
- (NSDictionary *)markerInfo:(AVSpeechSynthesisMarker *)marker API_AVAILABLE(ios(16.0))
{
    NSMutableDictionary *info = [@{
        @"kind": [self markerTypeName:marker.mark],
        @"start": @(marker.textRange.location),
        @"end": @(NSMaxRange(marker.textRange))
    } mutableCopy];
    if (@available(iOS 17.0, *)) {
        if (marker.phoneme.length > 0) {
            info[@"phoneme"] = marker.phoneme;
        }
        if (marker.bookmarkName.length > 0) {
            info[@"bookmark"] = marker.bookmarkName;
        }
    }
    return info;
}

#pragma mark Synthesis to a file

// A path, a file:// URL or a file proxy. A relative path goes under the app's data directory, because the resources
// are read only. Without a destination the file goes to the caches directory under a name of its own.
- (NSURL *)outputURLFromValue:(id)value identifier:(NSString *)identifier
{
    NSString *string = nil;
    if ([value isKindOfClass:[NSString class]]) {
        string = value;
    } else if (value != nil && [value respondsToSelector:@selector(nativePath)]) {
        string = [value nativePath];
    }
    if (string.length == 0) {
        NSString *caches = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
        return [NSURL fileURLWithPath:[caches stringByAppendingPathComponent:[NSString stringWithFormat:@"utterance-%@.wav", identifier]]];
    }
    if ([string hasPrefix:@"file://"]) {
        NSURL *url = [NSURL URLWithString:string];
        return url.isFileURL ? url : [NSURL fileURLWithPath:[string substringFromIndex:7]];
    }
    if ([string hasPrefix:@"/"]) {
        return [NSURL fileURLWithPath:string];
    }
    NSString *documents = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
    return [NSURL fileURLWithPath:[documents stringByAppendingPathComponent:string]];
}

- (void)fireSynthesisFailure:(NSString *)code message:(NSString *)message nativeError:(NSError *)error identifier:(NSString *)identifier
{
    NSMutableDictionary *event = [@{ @"success": @NO, @"code": code, @"message": message, @"utteranceId": identifier ?: @"" } mutableCopy];
    if (error) {
        event[@"nativeCode"] = @(error.code);
        event[@"nativeDomain"] = error.domain;
    }
    [self fire:@"synthesized" payload:event];
}

/**
 * Renders the speech to a 16-bit WAV file and answers with the "synthesized" event:
 * { success, file, duration (seconds), format: 'wav', sampleRate, utteranceId, markers? }. Nothing is played. The options
 * are those of startSpeaking, plus file, and markers:true on iOS 16 and later for the list of markers.
 */
-(void)synthesizeToFile:(id)args
{
    ENSURE_SINGLE_ARG(args,NSDictionary);
    ENSURE_UI_THREAD(synthesizeToFile,args);

    NSString *identifier = [[NSUUID UUID] UUIDString];
    if (!_isSupported) {
        [self fireSynthesisFailure:@"unsupported" message:@"AVSpeechSynthesizer is not available" nativeError:nil identifier:identifier];
        return;
    }

    BencodingUtteranceContext *ctx = [BencodingUtteranceContext new];
    ctx.identifier = identifier;
    NSDictionary *failure = nil;
    AVSpeechUtterance *utterance = [self utteranceFromOptions:args context:ctx failure:&failure];
    if (utterance == nil) {
        [self fireSynthesisFailure:failure[@"code"] message:failure[@"message"] nativeError:nil identifier:identifier];
        return;
    }

    NSURL *url = [self outputURLFromValue:[args objectForKey:@"file"] identifier:identifier];
    if (![[url.pathExtension lowercaseString] isEqualToString:@"wav"]) {
        [self fireSynthesisFailure:@"invalid_argument" message:@"The file must end in .wav" nativeError:nil identifier:identifier];
        return;
    }
    NSError *error = nil;
    if (![[NSFileManager defaultManager] createDirectoryAtURL:[url URLByDeletingLastPathComponent] withIntermediateDirectories:YES attributes:nil error:&error]) {
        [self fireSynthesisFailure:@"invalid_file" message:error.localizedDescription nativeError:error identifier:identifier];
        return;
    }
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];

    BencodingUtteranceSynthesisJob *job = [BencodingUtteranceSynthesisJob new];
    job.identifier = identifier;
    job.url = url;
    job.synthesizer = [AVSpeechSynthesizer new];
    job.markers = [NSMutableArray array];
    job.queue = dispatch_queue_create("bencoding.utterance.synthesis", DISPATCH_QUEUE_SERIAL);
    job.lastActivity = CFAbsoluteTimeGetCurrent();
    [_jobs addObject:job];

    AVSpeechSynthesizerBufferCallback onBuffer = ^(AVAudioBuffer *buffer) {
        dispatch_async(job.queue, ^{
            [self handleBuffer:buffer job:job];
        });
    };

    BOOL wantMarkers = [TiUtils boolValue:@"markers" properties:args def:NO];
    if (wantMarkers) {
        if (@available(iOS 16.0, *)) {
            job.wantMarkers = YES;
            [job.synthesizer writeUtterance:utterance toBufferCallback:onBuffer toMarkerCallback:^(NSArray<AVSpeechSynthesisMarker *> *markers) {
                dispatch_async(job.queue, ^{
                    for (AVSpeechSynthesisMarker *marker in markers) {
                        NSMutableDictionary *info = [[self markerInfo:marker] mutableCopy];
                        info[@"byteSampleOffset"] = @(marker.byteSampleOffset);
                        [job.markers addObject:info];
                    }
                });
            }];
        } else {
            [job.synthesizer writeUtterance:utterance toBufferCallback:onBuffer];
        }
    } else {
        [job.synthesizer writeUtterance:utterance toBufferCallback:onBuffer];
    }
    [self armWatchdogForJob:job];
}

- (void)armWatchdogForJob:(BencodingUtteranceSynthesisJob *)job
{
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kSynthesisIdleLimit * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (job.finished) {
            return;
        }
        CFTimeInterval idle = CFAbsoluteTimeGetCurrent() - job.lastActivity;
        if (idle >= kSynthesisIdleLimit - 0.5) {
            dispatch_async(job.queue, ^{
                [self finishJob:job code:@"synthesis" message:@"The synthesizer produced no audio" nativeError:nil];
            });
        } else {
            [self armWatchdogForJob:job];
        }
    });
}

// Runs on the job's queue. An empty buffer marks the end of the speech.
- (void)handleBuffer:(AVAudioBuffer *)buffer job:(BencodingUtteranceSynthesisJob *)job
{
    if (job.finished) {
        return;
    }
    job.lastActivity = CFAbsoluteTimeGetCurrent();
    if (![buffer isKindOfClass:[AVAudioPCMBuffer class]]) {
        [self finishJob:job code:@"synthesis" message:@"The synthesizer delivered audio that is not PCM" nativeError:nil];
        return;
    }
    AVAudioPCMBuffer *pcm = (AVAudioPCMBuffer *)buffer;
    if (pcm.frameLength == 0) {
        if (job.frames == 0) {
            [self finishJob:job code:@"synthesis" message:@"The synthesizer produced no audio" nativeError:nil];
        } else {
            [self finishJob:job code:nil message:nil nativeError:nil];
        }
        return;
    }

    NSError *error = nil;
    if (job.file == nil) {
        job.sampleRate = pcm.format.sampleRate;
        job.bytesPerFrame = pcm.format.streamDescription->mBytesPerFrame;
        NSDictionary *settings = @{
            AVFormatIDKey: @(kAudioFormatLinearPCM),
            AVSampleRateKey: @(pcm.format.sampleRate),
            AVNumberOfChannelsKey: @(pcm.format.channelCount),
            AVLinearPCMBitDepthKey: @16,
            AVLinearPCMIsFloatKey: @NO,
            AVLinearPCMIsBigEndianKey: @NO
        };
        job.file = [[AVAudioFile alloc] initForWriting:job.url settings:settings commonFormat:AVAudioPCMFormatInt16 interleaved:YES error:&error];
        if (job.file == nil) {
            [self finishJob:job code:@"invalid_file" message:error.localizedDescription ?: @"The file could not be created" nativeError:error];
            return;
        }
    }

    AVAudioPCMBuffer *toWrite = pcm;
    AVAudioFormat *target = job.file.processingFormat;
    if (![pcm.format isEqual:target]) {
        if (job.converter == nil) {
            job.converter = [[AVAudioConverter alloc] initFromFormat:pcm.format toFormat:target];
        }
        AVAudioPCMBuffer *converted = [[AVAudioPCMBuffer alloc] initWithPCMFormat:target frameCapacity:pcm.frameLength];
        __block BOOL supplied = NO;
        NSError *convertError = nil;
        AVAudioConverterOutputStatus status = [job.converter convertToBuffer:converted error:&convertError withInputFromBlock:^AVAudioBuffer *(AVAudioPacketCount count, AVAudioConverterInputStatus *inputStatus) {
            if (supplied) {
                *inputStatus = AVAudioConverterInputStatus_NoDataNow;
                return nil;
            }
            supplied = YES;
            *inputStatus = AVAudioConverterInputStatus_HaveData;
            return pcm;
        }];
        if (status == AVAudioConverterOutputStatus_Error) {
            [self finishJob:job code:@"synthesis" message:convertError.localizedDescription ?: @"The audio could not be converted" nativeError:convertError];
            return;
        }
        toWrite = converted;
    }

    if (![job.file writeFromBuffer:toWrite error:&error]) {
        [self finishJob:job code:@"invalid_file" message:error.localizedDescription ?: @"The file could not be written" nativeError:error];
        return;
    }
    job.frames += toWrite.frameLength;
}

// Runs on the job's queue. A nil code is success.
- (void)finishJob:(BencodingUtteranceSynthesisJob *)job code:(NSString *)code message:(NSString *)message nativeError:(NSError *)nativeError
{
    if (job.finished) {
        return;
    }
    job.finished = YES;
    // Releasing the file is what closes it and completes the WAV header
    job.file = nil;
    job.converter = nil;

    NSDictionary *payload = nil;
    if (code != nil) {
        [[NSFileManager defaultManager] removeItemAtURL:job.url error:nil];
        NSMutableDictionary *event = [@{ @"success": @NO, @"code": code, @"message": message ?: @"", @"utteranceId": job.identifier } mutableCopy];
        if (nativeError) {
            event[@"nativeCode"] = @(nativeError.code);
            event[@"nativeDomain"] = nativeError.domain;
        }
        payload = event;
    } else {
        NSMutableDictionary *event = [@{
            @"success": @YES,
            @"file": job.url.path,
            @"duration": @(job.sampleRate > 0 ? (double)job.frames / job.sampleRate : 0.0),
            @"format": @"wav",
            @"sampleRate": @(job.sampleRate),
            @"utteranceId": job.identifier
        } mutableCopy];
        if (job.wantMarkers) {
            // byteSampleOffset counts bytes of the delivered buffers; time turns it into milliseconds from the start
            double bytesPerSecond = (double)job.bytesPerFrame * job.sampleRate;
            NSMutableArray *markers = [NSMutableArray arrayWithCapacity:job.markers.count];
            for (NSDictionary *marker in job.markers) {
                NSMutableDictionary *entry = [marker mutableCopy];
                entry[@"time"] = @(bytesPerSecond > 0 ? (NSInteger)llround([marker[@"byteSampleOffset"] doubleValue] / bytesPerSecond * 1000.0) : 0);
                [markers addObject:entry];
            }
            event[@"markers"] = markers;
        }
        payload = event;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [self->_jobs removeObject:job];
        [self fire:@"synthesized" payload:payload];
    });
}

#pragma mark Personal Voice

static NSString *UtterancePersonalVoiceStatusName(NSUInteger status) API_AVAILABLE(ios(17.0))
{
    switch (status) {
        case AVSpeechSynthesisPersonalVoiceAuthorizationStatusNotDetermined: return @"not_determined";
        case AVSpeechSynthesisPersonalVoiceAuthorizationStatusDenied: return @"denied";
        case AVSpeechSynthesisPersonalVoiceAuthorizationStatusUnsupported: return @"unsupported";
        case AVSpeechSynthesisPersonalVoiceAuthorizationStatusAuthorized: return @"authorized";
    }
    return @"unknown";
}

// Answers with the "personalvoice" event: { success, status, authorized }. status is 'not_determined', 'denied',
// 'unsupported' or 'authorized'. The app needs NSPersonalVoiceUsageDescription in its Info.plist.
-(void)requestPersonalVoiceAuthorization:(id)unused
{
    if (@available(iOS 17.0, *)) {
        [AVSpeechSynthesizer requestPersonalVoiceAuthorizationWithCompletionHandler:^(AVSpeechSynthesisPersonalVoiceAuthorizationStatus status) {
            NSString *name = UtterancePersonalVoiceStatusName(status);
            [self fire:@"personalvoice" payload:@{ @"success": @YES, @"status": name, @"authorized": @([name isEqualToString:@"authorized"]) }];
        }];
    } else {
        [self fire:@"personalvoice" payload:@{ @"success": @NO, @"status": @"unsupported", @"authorized": @NO, @"code": @"unsupported", @"message": @"Personal Voice needs iOS 17" }];
    }
}

-(NSString *)getPersonalVoiceStatus:(id)unused
{
    if (@available(iOS 17.0, *)) {
        return UtterancePersonalVoiceStatusName([AVSpeechSynthesizer personalVoiceAuthorizationStatus]);
    }
    return @"unsupported";
}

#pragma mark Android only

// Prerecorded audio in place of text exists only on Android; here the answer is the "unsupported" code.
- (void)answerUnsupported:(NSString *)method
{
    BencodingUtteranceContext *ctx = [BencodingUtteranceContext new];
    ctx.identifier = [[NSUUID UUID] UUIDString];
    [self failWithCode:@"unsupported" message:[NSString stringWithFormat:@"%@ is only available on Android", method] nativeError:nil context:ctx];
}

// addSpeech() and addEarcon() answer with "registered", as on Android: { success, kind, key, code, message }
- (void)answerUnregistered:(NSString *)kind method:(NSString *)method args:(id)args
{
    id key = [args isKindOfClass:[NSArray class]] && [args count] > 0 ? [args objectAtIndex:0] : nil;
    [self fire:@"registered" payload:@{
        @"success": @NO,
        @"kind": kind,
        @"key": [key isKindOfClass:[NSString class]] ? key : @"",
        @"code": @"unsupported",
        @"message": [NSString stringWithFormat:@"%@ is only available on Android", method]
    }];
}

-(void)addSpeech:(id)args
{
    [self answerUnregistered:@"speech" method:@"addSpeech" args:args];
}

-(void)addEarcon:(id)args
{
    [self answerUnregistered:@"earcon" method:@"addEarcon" args:args];
}

-(void)playEarcon:(id)args
{
    [self answerUnsupported:@"playEarcon"];
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
    // speechVoices is not free; the answer for a language only changes when the system reports new voices.
    if (gBestVoiceCache == nil) {
        gBestVoiceCache = [NSMutableDictionary dictionary];
    }
    NSString *cached = gBestVoiceCache[language];
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

    gBestVoiceCache[language] = best != nil ? best.identifier : @"";
    return best;
}

/**
 * Installed voices, delivered in a "voices" event with the same shape as on Android:
 * { id, name, language, quality: "default" | "enhanced" | "premium", gender: "male" | "female" | "unspecified",
 *   novelty, personal, networkRequired }. Novelty voices are left out unless the options say includeNovelty: true.
 * A Personal Voice appears once the app is authorized.
 */
-(void)requestVoices:(id)args
{
    NSDictionary *options = [args isKindOfClass:[NSArray class]] && [args count] > 0 && [[args objectAtIndex:0] isKindOfClass:[NSDictionary class]] ? [args objectAtIndex:0] : @{};
    BOOL includeNovelty = [TiUtils boolValue:@"includeNovelty" properties:options def:NO];
    NSMutableArray *list = [NSMutableArray array];

    for (AVSpeechSynthesisVoice *voice in [AVSpeechSynthesisVoice speechVoices]) {
        BOOL novelty = NO;
        BOOL personal = NO;
        if (@available(iOS 17.0, *)) {
            novelty = (voice.voiceTraits & AVSpeechSynthesisVoiceTraitIsNoveltyVoice) != 0;
            personal = (voice.voiceTraits & AVSpeechSynthesisVoiceTraitIsPersonalVoice) != 0;
        }
        if (novelty && !includeNovelty) {
            continue;
        }

        NSString *quality = @"default";
        if (voice.quality == AVSpeechSynthesisVoiceQualityEnhanced) {
            quality = @"enhanced";
        } else if (@available(iOS 16.0, *)) {
            if (voice.quality == AVSpeechSynthesisVoiceQualityPremium) {
                quality = @"premium";
            }
        }

        NSString *gender = @"unspecified";
        if (voice.gender == AVSpeechSynthesisVoiceGenderMale) {
            gender = @"male";
        } else if (voice.gender == AVSpeechSynthesisVoiceGenderFemale) {
            gender = @"female";
        }

        [list addObject:@{
            @"id": voice.identifier,
            @"name": voice.name ? voice.name : @"",
            @"language": voice.language ? voice.language : @"",
            @"quality": quality,
            @"gender": gender,
            @"novelty": @(novelty),
            @"personal": @(personal),
            @"networkRequired": @NO
        }];
    }

    [self fire:@"voices" payload:@{ @"voices": list }];
}

#pragma mark Error codes

#define UTTERANCE_STRING_CONSTANT(NAME, VALUE) \
- (NSString *)NAME { return VALUE; }

// The same codes, with the same values, as the speech-to-text proxy
UTTERANCE_STRING_CONSTANT(ERROR_NO_SPEECH, @"no_speech")
UTTERANCE_STRING_CONSTANT(ERROR_PERMISSION_DENIED, @"permission_denied")
UTTERANCE_STRING_CONSTANT(ERROR_NETWORK, @"network")
UTTERANCE_STRING_CONSTANT(ERROR_AUDIO, @"audio")
UTTERANCE_STRING_CONSTANT(ERROR_BUSY, @"busy")
UTTERANCE_STRING_CONSTANT(ERROR_UNAVAILABLE, @"unavailable")
UTTERANCE_STRING_CONSTANT(ERROR_LANGUAGE_UNSUPPORTED, @"language_unsupported")
UTTERANCE_STRING_CONSTANT(ERROR_LANGUAGE_UNAVAILABLE, @"language_unavailable")
UTTERANCE_STRING_CONSTANT(ERROR_ON_DEVICE_UNAVAILABLE, @"on_device_unavailable")
UTTERANCE_STRING_CONSTANT(ERROR_TOO_MANY_REQUESTS, @"too_many_requests")
UTTERANCE_STRING_CONSTANT(ERROR_DISABLED, @"disabled")
UTTERANCE_STRING_CONSTANT(ERROR_SERVICE_ERROR, @"service_error")
UTTERANCE_STRING_CONSTANT(ERROR_CANCELED, @"canceled")
UTTERANCE_STRING_CONSTANT(ERROR_TIMEOUT, @"timeout")
UTTERANCE_STRING_CONSTANT(ERROR_INVALID_ARGUMENT, @"invalid_argument")
UTTERANCE_STRING_CONSTANT(ERROR_INVALID_FILE, @"invalid_file")
UTTERANCE_STRING_CONSTANT(ERROR_LANGUAGE_MODEL_INVALID, @"language_model_invalid")
UTTERANCE_STRING_CONSTANT(ERROR_UNSUPPORTED, @"unsupported")
UTTERANCE_STRING_CONSTANT(ERROR_UNKNOWN, @"unknown")
// Only in text-to-speech
UTTERANCE_STRING_CONSTANT(ERROR_SYNTHESIS, @"synthesis")
UTTERANCE_STRING_CONSTANT(ERROR_NOT_READY, @"not_ready")
UTTERANCE_STRING_CONSTANT(ERROR_TEXT_TOO_LONG, @"text_too_long")


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
