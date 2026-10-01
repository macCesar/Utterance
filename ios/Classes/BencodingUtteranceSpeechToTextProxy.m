/**
 * Copyright (c) 2013 by Benjamin Bahrenburg. All Rights Reserved.
 * Licensed under the terms of the Apache 2.0 License
 * Please see the LICENSE included with this distribution for details.
 *
 * Available at https://github.com/benbahrenburg/Utterance
 *
 */

#import "BencodingUtteranceSpeechToTextProxy.h"
#import "TiUtils.h"
#import "TiBlob.h"
#import "TiBuffer.h"
#import <stdatomic.h>

// audiolevel scale, not calibrated against a reference: -60 dBFS maps to 0 and -20 dBFS to 1. Chosen because speech
// in front of an iPad (9th generation) peaked around -38 dBFS, which a 0 dBFS ceiling left at 0.24 of the range.
static const float kLevelFloorDecibels = -60.0f;
static const float kLevelRangeDecibels = 40.0f;

static NSString *const kSourceMicrophone = @"microphone";
static NSString *const kSourceBuffer = @"buffer";
static NSString *const kSourceFile = @"file";

#pragma mark Audio meter

// The tap runs on the audio thread: it only stores one float here and the main queue reads it
@interface BencodingUtteranceAudioMeter : NSObject
{
@public
  _Atomic float rms;
}
@end

@implementation BencodingUtteranceAudioMeter
@end

#pragma mark Private interface

@interface BencodingUtteranceSpeechToTextProxy ()
{
  BOOL _starting;
  NSUInteger _startToken;
  NSUInteger _sessionId;
  BOOL _sessionActive;
  BOOL _tapInstalled;
  BOOL _audioEnded;
  BOOL _useDelegate;
  BOOL _partialEvents;
  BOOL _speechStartFired;
  BOOL _speechEndFired;
  NSString *_requestedLanguage;
  NSString *_source;
  NSString *_lastPartialText;
  NSDictionary *_options;
  NSObject *_taskDelegate;
  BencodingUtteranceAudioMeter *_meter;
  NSString *_temporaryFile;
  AVAudioFormat *_bufferFormat;
  AVAudioConverter *_bufferConverter;
  NSMutableData *_pendingBytes;
}

- (void)sessionDetectedSpeech:(NSUInteger)sessionId;
- (void)sessionFinishedReadingAudio:(NSUInteger)sessionId;
- (void)sessionProcessedDuration:(NSTimeInterval)duration session:(NSUInteger)sessionId;
- (void)sessionHypothesis:(SFTranscription *)transcription session:(NSUInteger)sessionId;
- (void)sessionResult:(SFSpeechRecognitionResult *)result session:(NSUInteger)sessionId;
- (void)sessionError:(NSError *)error session:(NSUInteger)sessionId;

@end

#pragma mark Task delegate

// Used only when the app listens for audioduration, which the result handler cannot report.
// It forwards to the proxy with its session id, so a task that was already replaced or canceled is ignored.
@interface BencodingUtteranceTaskDelegate : NSObject <SFSpeechRecognitionTaskDelegate>
@property(nonatomic, weak) BencodingUtteranceSpeechToTextProxy *owner;
@property(nonatomic) NSUInteger sessionId;
@end

@implementation BencodingUtteranceTaskDelegate

- (void)speechRecognitionDidDetectSpeech:(SFSpeechRecognitionTask *)task
{
    [self.owner sessionDetectedSpeech:self.sessionId];
}

- (void)speechRecognitionTask:(SFSpeechRecognitionTask *)task didHypothesizeTranscription:(SFTranscription *)transcription
{
    [self.owner sessionHypothesis:transcription session:self.sessionId];
}

- (void)speechRecognitionTask:(SFSpeechRecognitionTask *)task didFinishRecognition:(SFSpeechRecognitionResult *)recognitionResult
{
    [self.owner sessionResult:recognitionResult session:self.sessionId];
}

- (void)speechRecognitionTaskFinishedReadingAudio:(SFSpeechRecognitionTask *)task
{
    [self.owner sessionFinishedReadingAudio:self.sessionId];
}

- (void)speechRecognitionTask:(SFSpeechRecognitionTask *)task didFinishSuccessfully:(BOOL)successfully
{
    if (!successfully) {
        [self.owner sessionError:task.error session:self.sessionId];
    }
}

- (void)speechRecognitionTask:(SFSpeechRecognitionTask *)task didProcessAudioDuration:(NSTimeInterval)duration
{
    [self.owner sessionProcessedDuration:duration session:self.sessionId];
}

@end

#pragma mark Proxy

@implementation BencodingUtteranceSpeechToTextProxy

#pragma mark Internal

// The system language when SFSpeechRecognizer supports it (same region first), otherwise en-US
- (NSString *)systemLocale
{
    NSString *preferred = [[NSLocale preferredLanguages].firstObject stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
    if (!preferred) {
        return @"en-US";
    }
    NSString *language = [[NSLocale localeWithLocaleIdentifier:preferred] objectForKey:NSLocaleLanguageCode];
    NSString *sameLanguage = nil;
    for (NSLocale *supported in [SFSpeechRecognizer supportedLocales]) {
        NSString *identifier = [supported.localeIdentifier stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
        if ([identifier caseInsensitiveCompare:preferred] == NSOrderedSame) {
            return identifier;
        }
        if (!sameLanguage && [[supported objectForKey:NSLocaleLanguageCode] isEqualToString:language]) {
            sameLanguage = identifier;
        }
    }
    return sameLanguage ?: @"en-US";
}

// nil when the framework does not support the language
- (SFSpeechRecognizer *)newRecognizerForLanguage:(NSString *)language
{
    SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:language]];
    recognizer.queue = [NSOperationQueue mainQueue];
    return recognizer;
}

- (void)_configure
{
    _isSupported = NO;
    _isRecording = NO;
    _permissionsGranted = NO;
    _silenceTimeout = 2.0;
    _noSpeechTimeout = 6.0;
    _locale = [self systemLocale];

    // Check if Speech Recognition is available (iOS 10+)
    if (@available(iOS 10.0, *)) {
        _isSupported = [SFSpeechRecognizer class] != nil;

        if (_isSupported) {
            // Initialize speech recognizer with default locale
            self.speechRecognizer = [self newRecognizerForLanguage:_locale];
            self.speechRecognizer.delegate = self;

            // Initialize audio engine
            self.audioEngine = [[AVAudioEngine alloc] init];
        }
    }

    [super _configure];
}

- (void)_destroy
{
    [self teardownSession:YES];

    self.speechRecognizer.delegate = nil;
    self.speechRecognizer = nil;
    self.audioEngine = nil;

    [super _destroy];
}

#pragma mark Public API Methods

- (NSNumber *)isSupported:(id)unused
{
    return @(_isSupported);
}

- (NSNumber *)isAvailable:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSString);
    if (!_isSupported) {
        return @NO;
    }
    SFSpeechRecognizer *recognizer = args ? [self newRecognizerForLanguage:args] : self.speechRecognizer;
    return [NSNumber numberWithBool:recognizer != nil && recognizer.isAvailable];
}

- (NSNumber *)supportsOnDevice:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSString);
    if (!_isSupported) {
        return @NO;
    }
    SFSpeechRecognizer *recognizer = args ? [self newRecognizerForLanguage:args] : self.speechRecognizer;
    return [NSNumber numberWithBool:recognizer != nil && recognizer.supportsOnDeviceRecognition];
}

- (NSDictionary *)getPermissionStatus:(id)unused
{
    return [self permissionSnapshot];
}

- (void)requestPermissions:(id)unused
{
    ENSURE_UI_THREAD(requestPermissions, unused);
    [self ensurePermissionsNeedingMicrophone:YES completion:^(BOOL granted) {
        NSMutableDictionary *event = [[self permissionSnapshot] mutableCopy];
        event[@"success"] = @YES;
        [self fire:@"permissions" payload:event];
    }];
}

- (void)requestSupportedLanguages:(id)unused
{
    // One recognizer per language is needed to read supportsOnDeviceRecognition, so it runs off the main thread
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSMutableArray *languages = [NSMutableArray array];
        for (NSLocale *locale in [SFSpeechRecognizer supportedLocales]) {
            NSString *identifier = [locale.localeIdentifier stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
            SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];
            // iOS cannot say whether an on-device model is installed: the system downloads it, so "supported" and "installed" are the same
            BOOL onDevice = recognizer != nil && recognizer.supportsOnDeviceRecognition;
            [languages addObject:@{
                @"language": identifier,
                @"online": @YES,
                @"onDevice": @(onDevice),
                @"installed": @(onDevice),
                @"pending": @NO
            }];
        }
        [languages sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
            return [a[@"language"] compare:b[@"language"]];
        }];
        dispatch_async(dispatch_get_main_queue(), ^{
            [self fire:@"languages" payload:@{ @"success": @YES, @"checked": @YES, @"languages": languages }];
        });
    });
}

// The system downloads the voices and on-device models on iOS; an app cannot start it
- (void)downloadLanguage:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSDictionary);
    [self fire:@"download" payload:@{ @"success": @NO, @"state": @"error", @"code": @"unsupported", @"message": @"iOS downloads language models by itself; an app cannot start it" }];
}

- (void)startSpeechToText:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSDictionary);
    ENSURE_UI_THREAD(startSpeechToText, args);

    if (!_isSupported) {
        [self fireErrorEvent:@"Speech recognition is not supported on this device" code:@"unsupported" nativeError:nil];
        return;
    }

    if (_isRecording || _starting || _sessionActive) {
        NSLog(@"[DEBUG] Speech recognition already in progress");
        return;
    }

    NSDictionary *options = args ? args : @{};
    NSString *source = [TiUtils stringValue:@"audioSource" properties:options def:kSourceMicrophone];
    if (![source isEqualToString:kSourceMicrophone] && ![source isEqualToString:kSourceBuffer]) {
        [self fireErrorEvent:@"audioSource must be 'microphone' or 'buffer'" code:@"invalid_argument" nativeError:nil];
        return;
    }
    BOOL fromMicrophone = [source isEqualToString:kSourceMicrophone];

    // The timers listen to the audio the microphone hears, so a buffer session only gets them when the app asks
    _silenceTimeout = [TiUtils doubleValue:@"silenceTimeout" properties:options def:fromMicrophone ? 2.0 : 0];
    _noSpeechTimeout = [TiUtils doubleValue:@"noSpeechTimeout" properties:options def:fromMicrophone ? 6.0 : 0];
    _options = options;
    _source = source;

    if (![self prepareRecognizerForOptions:options]) {
        return;
    }

    // Request permissions first. The token drops this start if cancelRecording() arrives while the system prompt is open
    _starting = YES;
    NSUInteger token = ++_startToken;
    [self ensurePermissionsNeedingMicrophone:fromMicrophone completion:^(BOOL granted) {
        if (token != self->_startToken) {
            return;
        }
        self->_starting = NO;
        if (!granted) {
            [self fireErrorEvent:@"Speech recognition permission denied" code:@"permission_denied" nativeError:nil];
            return;
        }
        if (fromMicrophone) {
            [self performMicrophoneSession];
        } else {
            [self performBufferSession];
        }
    }];
}

- (void)stopRecording:(id)unused
{
    ENSURE_UI_THREAD(stopRecording, unused);
    [self endAudioInput];
}

// Unlike stopRecording(), the result is discarded and completed never fires
- (void)cancelRecording:(id)unused
{
    ENSURE_UI_THREAD(cancelRecording, unused);
    _startToken++;
    _starting = NO;
    [self teardownSession:YES];
    [self fire:@"canceled" payload:@{ @"success": @YES }];
}

- (void)transcribeFile:(id)args
{
    ENSURE_ARRAY(args);
    ENSURE_UI_THREAD(transcribeFile, args);

    if (!_isSupported) {
        [self fireErrorEvent:@"Speech recognition is not supported on this device" code:@"unsupported" nativeError:nil];
        return;
    }
    if (_isRecording || _starting || _sessionActive) {
        NSLog(@"[DEBUG] Speech recognition already in progress");
        return;
    }
    id file = [args count] > 0 ? [args objectAtIndex:0] : nil;
    NSDictionary *options = [args count] > 1 && [[args objectAtIndex:1] isKindOfClass:[NSDictionary class]] ? [args objectAtIndex:1] : @{};
    _silenceTimeout = 0;
    _noSpeechTimeout = 0;
    _options = options;
    _source = kSourceFile;

    NSURL *url = [self fileURLFromValue:file temporary:YES];
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        [self fireErrorEvent:@"The audio file does not exist" code:@"invalid_file" nativeError:nil];
        return;
    }
    if (![self prepareRecognizerForOptions:options]) {
        return;
    }

    _starting = YES;
    NSUInteger token = ++_startToken;
    [self ensurePermissionsNeedingMicrophone:NO completion:^(BOOL granted) {
        if (token != self->_startToken) {
            return;
        }
        self->_starting = NO;
        if (!granted) {
            [self fireErrorEvent:@"Speech recognition permission denied" code:@"permission_denied" nativeError:nil];
            return;
        }
        SFSpeechURLRecognitionRequest *request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:url];
        [self beginTaskWithRequest:request];
    }];
}

// PCM 16-bit little endian, interleaved, in the sampleRate and channels given to startSpeechToText()
- (void)appendAudio:(id)args
{
    id data = args;
    if ([data isKindOfClass:[NSArray class]]) {
        data = [(NSArray *)data firstObject];
    }
    NSData *bytes = [data respondsToSelector:@selector(data)] ? [data data] : nil;
    if (![bytes isKindOfClass:[NSData class]] || bytes.length == 0) {
        return;
    }
    if (!_sessionActive || ![_source isEqualToString:kSourceBuffer] || _audioEnded) {
        NSLog(@"[DEBUG] appendAudio ignored: no buffer session is waiting for audio");
        return;
    }
    SFSpeechAudioBufferRecognitionRequest *request = (SFSpeechAudioBufferRecognitionRequest *)self.recognitionRequest;
    if (!_bufferConverter) {
        _bufferConverter = [[AVAudioConverter alloc] initFromFormat:_bufferFormat toFormat:request.nativeAudioFormat];
        if (!_bufferConverter) {
            [self fireErrorEvent:@"The audio format cannot be converted for recognition" code:@"invalid_argument" nativeError:nil];
            return;
        }
    }
    if (!_pendingBytes) {
        _pendingBytes = [NSMutableData data];
    }
    [_pendingBytes appendData:bytes];

    NSUInteger frameSize = 2 * _bufferFormat.channelCount;
    NSUInteger frames = _pendingBytes.length / frameSize;
    if (frames == 0) {
        return;
    }
    AVAudioPCMBuffer *input = [[AVAudioPCMBuffer alloc] initWithPCMFormat:_bufferFormat frameCapacity:(AVAudioFrameCount)frames];
    input.frameLength = (AVAudioFrameCount)frames;
    memcpy(input.int16ChannelData[0], _pendingBytes.bytes, frames * frameSize);
    [_pendingBytes replaceBytesInRange:NSMakeRange(0, frames * frameSize) withBytes:NULL length:0];

    double ratio = request.nativeAudioFormat.sampleRate / _bufferFormat.sampleRate;
    AVAudioPCMBuffer *output = [[AVAudioPCMBuffer alloc] initWithPCMFormat:request.nativeAudioFormat frameCapacity:(AVAudioFrameCount)(frames * ratio) + 32];
    __block BOOL supplied = NO;
    NSError *error = nil;
    [_bufferConverter convertToBuffer:output error:&error withInputFromBlock:^AVAudioBuffer *(AVAudioPacketCount count, AVAudioConverterInputStatus *status) {
        if (supplied) {
            *status = AVAudioConverterInputStatus_NoDataNow;
            return nil;
        }
        supplied = YES;
        *status = AVAudioConverterInputStatus_HaveData;
        return input;
    }];
    if (error) {
        [self fireErrorEvent:[NSString stringWithFormat:@"Audio conversion error: %@", error.localizedDescription] code:@"invalid_argument" nativeError:error];
        return;
    }
    if (output.frameLength > 0) {
        [request appendAudioPCMBuffer:output];
    }
}

- (NSDictionary *)getNativeAudioFormat:(id)unused
{
    AVAudioFormat *format = [[[SFSpeechAudioBufferRecognitionRequest alloc] init] nativeAudioFormat];
    return @{ @"sampleRate": @(format.sampleRate), @"channels": @(format.channelCount) };
}

- (NSDictionary *)getState:(id)unused
{
    SFSpeechRecognitionTask *task = self.recognitionTask;
    NSString *state = @"idle";
    if (task) {
        switch (task.state) {
            case SFSpeechRecognitionTaskStateStarting: state = @"starting"; break;
            case SFSpeechRecognitionTaskStateRunning: state = @"running"; break;
            case SFSpeechRecognitionTaskStateFinishing: state = @"finishing"; break;
            case SFSpeechRecognitionTaskStateCanceling: state = @"canceling"; break;
            case SFSpeechRecognitionTaskStateCompleted: state = @"completed"; break;
        }
    }
    NSMutableDictionary *result = [@{
        @"state": state,
        @"listening": @(_isRecording),
        @"finishing": @(task.isFinishing),
        @"canceled": @(task.isCancelled)
    } mutableCopy];
    if (task.error) {
        result[@"message"] = task.error.localizedDescription;
        result[@"code"] = [self codeForError:task.error];
    }
    return result;
}

// iOS 17. The asset is the file Apple's SFCustomLanguageModelData.export() writes, which the app provides.
- (void)prepareCustomLanguageModel:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSDictionary);
    ENSURE_UI_THREAD(prepareCustomLanguageModel, args);
    if (@available(iOS 17.0, *)) {
        NSDictionary *options = args ?: @{};
        NSURL *asset = [self fileURLFromValue:options[@"asset"] temporary:NO];
        SFSpeechLanguageModelConfiguration *configuration = [self languageModelConfigurationFrom:options];
        if (!asset || !configuration) {
            [self fire:@"languagemodel" payload:@{ @"success": @NO, @"code": @"invalid_argument", @"message": @"prepareCustomLanguageModel needs asset and languageModel" }];
            return;
        }
        BOOL ignoresCache = [TiUtils boolValue:@"ignoresCache" properties:options def:NO];
        [SFSpeechLanguageModel prepareCustomLanguageModelForUrl:asset configuration:configuration ignoresCache:ignoresCache completion:^(NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (error) {
                    [self fire:@"languagemodel" payload:@{ @"success": @NO, @"code": @"language_model_invalid", @"message": error.localizedDescription, @"nativeCode": @(error.code), @"nativeDomain": error.domain }];
                } else {
                    [self fire:@"languagemodel" payload:@{ @"success": @YES }];
                }
            });
        }];
    } else {
        [self fire:@"languagemodel" payload:@{ @"success": @NO, @"code": @"unsupported", @"message": @"Custom language models need iOS 17" }];
    }
}

#pragma mark Options and requests

// Creates the recognizer for the language, or reports why it cannot be used. Returns NO after reporting.
- (BOOL)prepareRecognizerForOptions:(NSDictionary *)options
{
    NSString *language = [TiUtils stringValue:@"language" properties:options def:_locale];
    _requestedLanguage = language;
    if (![language isEqualToString:_locale] || !self.speechRecognizer) {
        SFSpeechRecognizer *recognizer = [self newRecognizerForLanguage:language];
        if (!recognizer) {
            [self fireErrorEvent:[NSString stringWithFormat:@"Language not supported: %@", language] code:@"language_unsupported" nativeError:nil];
            return NO;
        }
        _locale = language;
        self.speechRecognizer.delegate = nil;
        self.speechRecognizer = recognizer;
        self.speechRecognizer.delegate = self;
    }
    if (!self.speechRecognizer.isAvailable) {
        [self fireErrorEvent:@"Speech recognizer is not available" code:@"unavailable" nativeError:nil];
        return NO;
    }
    return YES;
}

- (SFSpeechRecognitionTaskHint)taskHintFrom:(NSDictionary *)options
{
    NSString *hint = [TiUtils stringValue:@"taskHint" properties:options];
    if (!hint) {
        // languageModel is the older Android name for the same choice
        NSString *model = [TiUtils stringValue:@"languageModel" properties:options def:@"free_form"];
        hint = [model isEqualToString:@"web_search"] ? @"search" : @"dictation";
    }
    if ([hint isEqualToString:@"search"]) {
        return SFSpeechRecognitionTaskHintSearch;
    }
    if ([hint isEqualToString:@"confirmation"]) {
        return SFSpeechRecognitionTaskHintConfirmation;
    }
    if ([hint isEqualToString:@"unspecified"]) {
        return SFSpeechRecognitionTaskHintUnspecified;
    }
    return SFSpeechRecognitionTaskHintDictation;
}

- (SFSpeechLanguageModelConfiguration *)languageModelConfigurationFrom:(NSDictionary *)options API_AVAILABLE(ios(17.0))
{
    NSURL *model = [self fileURLFromValue:options[@"languageModel"] temporary:NO];
    if (!model) {
        return nil;
    }
    NSURL *vocabulary = [self fileURLFromValue:options[@"vocabulary"] temporary:NO];
    if (options[@"weight"] && @available(iOS 26.0, *)) {
        return [[SFSpeechLanguageModelConfiguration alloc] initWithLanguageModel:model vocabulary:vocabulary weight:@([TiUtils doubleValue:options[@"weight"]])];
    }
    return [[SFSpeechLanguageModelConfiguration alloc] initWithLanguageModel:model vocabulary:vocabulary];
}

// The one place that turns the options into a request, for the microphone, a buffer and a file.
// Returns NO after reporting the failure.
- (BOOL)configureRequest:(SFSpeechRecognitionRequest *)request
{
    NSDictionary *options = _options;
    request.taskHint = [self taskHintFrom:options];

    id strings = options[@"contextualStrings"];
    if ([strings isKindOfClass:[NSArray class]]) {
        request.contextualStrings = strings;
    }

    // Partial results are also what the silence timers listen to, so they stay on while either timer is set
    _partialEvents = [TiUtils boolValue:@"partialResults" properties:options def:YES];
    request.shouldReportPartialResults = _partialEvents || _silenceTimeout > 0 || _noSpeechTimeout > 0;

    id onDevice = options[@"onDevice"];
    BOOL supportsOnDevice = self.speechRecognizer.supportsOnDeviceRecognition;
    NSDictionary *customModel = [options[@"customLanguageModel"] isKindOfClass:[NSDictionary class]] ? options[@"customLanguageModel"] : nil;
    if ([onDevice isKindOfClass:[NSString class]] && [onDevice isEqualToString:@"prefer"]) {
        request.requiresOnDeviceRecognition = supportsOnDevice;
    } else if (onDevice != nil && [TiUtils boolValue:onDevice]) {
        if (!supportsOnDevice) {
            [self fireErrorEvent:[NSString stringWithFormat:@"On-device recognition is not available for %@", _locale] code:@"on_device_unavailable" nativeError:nil];
            return NO;
        }
        request.requiresOnDeviceRecognition = YES;
    } else if (customModel) {
        // Apple only honors a custom language model on-device
        request.requiresOnDeviceRecognition = supportsOnDevice;
    } else {
        request.requiresOnDeviceRecognition = NO;
    }

    if (options[@"punctuation"] != nil && @available(iOS 16.0, *)) {
        request.addsPunctuation = [TiUtils boolValue:options[@"punctuation"]];
    }

    if (customModel) {
        if (@available(iOS 17.0, *)) {
            SFSpeechLanguageModelConfiguration *configuration = [self languageModelConfigurationFrom:customModel];
            if (!configuration) {
                [self fireErrorEvent:@"customLanguageModel needs a languageModel file" code:@"language_model_invalid" nativeError:nil];
                return NO;
            }
            request.customizedLanguageModel = configuration;
        }
    }
    return YES;
}

#pragma mark Sessions

- (void)performMicrophoneSession
{
    // Cancel any previous task
    [self teardownSession:YES];

    // Configure audio session
    NSError *error = nil;
    AVAudioSession *audioSession = [AVAudioSession sharedInstance];
    // Listening needs the Record category, which mutes playback (text-to-speech), so the previous one comes back when it ends
    if (!_audioSessionChanged) {
        _previousCategory = audioSession.category;
        _previousMode = audioSession.mode;
        _previousOptions = audioSession.categoryOptions;
        _audioSessionChanged = YES;
    }
    [audioSession setCategory:AVAudioSessionCategoryRecord mode:AVAudioSessionModeMeasurement options:AVAudioSessionCategoryOptionDuckOthers error:&error];
    [audioSession setActive:YES withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&error];

    if (error) {
        [self fireErrorEvent:[NSString stringWithFormat:@"Audio session error: %@", error.localizedDescription] code:@"audio" nativeError:error];
        return;
    }

    // installTapOnBus throws when there is no audio input (a Simulator without one, or a mic held by another app)
    AVAudioFormat *inputFormat = [self.audioEngine.inputNode outputFormatForBus:0];
    if (!audioSession.isInputAvailable || inputFormat.sampleRate <= 0 || inputFormat.channelCount == 0) {
        [self fireErrorEvent:@"No audio input available" code:@"audio" nativeError:nil];
        return;
    }

    SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
    if (!request) {
        [self fireErrorEvent:@"Unable to create recognition request" code:@"service_error" nativeError:nil];
        return;
    }
    if (![self configureRequest:request]) {
        return;
    }
    if (![self beginTaskWithRequest:request quiet:YES]) {
        return;
    }

    // The tap runs on the audio thread, so it captures the request and the meter and never touches self
    BencodingUtteranceAudioMeter *meter = [[BencodingUtteranceAudioMeter alloc] init];
    _meter = meter;
    [self.audioEngine.inputNode installTapOnBus:0 bufferSize:1024 format:inputFormat block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull when) {
        [request appendAudioPCMBuffer:buffer];
        AVAudioFrameCount count = buffer.frameLength;
        float *samples = buffer.floatChannelData ? buffer.floatChannelData[0] : NULL;
        if (samples && count > 0) {
            float sum = 0;
            for (AVAudioFrameCount i = 0; i < count; i++) {
                sum += samples[i] * samples[i];
            }
            atomic_store_explicit(&meter->rms, sqrtf(sum / count), memory_order_relaxed);
        }
    }];
    _tapInstalled = YES;

    // Start audio engine
    [self.audioEngine prepare];
    [self.audioEngine startAndReturnError:&error];

    if (error) {
        [self fireErrorEvent:[NSString stringWithFormat:@"Audio engine start error: %@", error.localizedDescription] code:@"audio" nativeError:error];
        return;
    }

    _isRecording = YES;
    [self armEndOfSpeechTimer:_noSpeechTimeout];
    [self startLevelTimer];
    [self fireStartedEvent];

    NSLog(@"[DEBUG] Speech recognition started (%@)", _locale);
}

// Audio the app feeds with appendAudio(): no microphone, no engine and no audio session change
- (void)performBufferSession
{
    [self teardownSession:YES];
    SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
    if (!request) {
        [self fireErrorEvent:@"Unable to create recognition request" code:@"service_error" nativeError:nil];
        return;
    }
    double sampleRate = [TiUtils doubleValue:@"sampleRate" properties:_options def:16000];
    int channels = [TiUtils intValue:@"channels" properties:_options def:1];
    _bufferFormat = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16 sampleRate:sampleRate channels:(AVAudioChannelCount)channels interleaved:YES];
    if (!_bufferFormat) {
        [self fireErrorEvent:@"sampleRate or channels is not valid" code:@"invalid_argument" nativeError:nil];
        return;
    }
    [self beginTaskWithRequest:request];
}

- (BOOL)beginTaskWithRequest:(SFSpeechRecognitionRequest *)request
{
    return [self beginTaskWithRequest:request quiet:NO];
}

// Creates the recognition task. With quiet, the caller fires started when the audio is flowing.
- (BOOL)beginTaskWithRequest:(SFSpeechRecognitionRequest *)request quiet:(BOOL)quiet
{
    // The microphone session configured the request before the audio engine started; the others do it here
    if (![_source isEqualToString:kSourceMicrophone] && ![self configureRequest:request]) {
        return NO;
    }
    NSUInteger sessionId = ++_sessionId;
    _sessionActive = YES;
    _audioEnded = NO;
    _speechStartFired = NO;
    _speechEndFired = NO;
    _lastPartialText = nil;
    self.recognitionRequest = request;

    _useDelegate = [self _hasListeners:@"audioduration"];
    if (_useDelegate) {
        BencodingUtteranceTaskDelegate *delegate = [[BencodingUtteranceTaskDelegate alloc] init];
        delegate.owner = self;
        delegate.sessionId = sessionId;
        _taskDelegate = delegate;
        self.recognitionTask = [self.speechRecognizer recognitionTaskWithRequest:request delegate:delegate];
    } else {
        __weak __typeof__(self) weakSelf = self;
        self.recognitionTask = [self.speechRecognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult * _Nullable result, NSError * _Nullable error) {
            __strong __typeof__(weakSelf) strongSelf = weakSelf;
            if (!strongSelf) return;
            if (error) {
                [strongSelf sessionError:error session:sessionId];
            } else if (result.isFinal) {
                [strongSelf sessionResult:result session:sessionId];
            } else if (result) {
                [strongSelf sessionHypothesis:result.bestTranscription session:sessionId];
            }
        }];
    }
    if (!quiet) {
        [self fireStartedEvent];
    }
    return YES;
}

// Stops sending audio. The task stays alive because iOS delivers the final result after endAudio.
- (void)endAudioInput
{
    [self armEndOfSpeechTimer:0];
    [self stopLevelTimer];

    if (_tapInstalled) {
        [self.audioEngine stop];
        [self.audioEngine.inputNode removeTapOnBus:0];
        _tapInstalled = NO;
    }
    if (_sessionActive && !_audioEnded && [self.recognitionRequest isKindOfClass:[SFSpeechAudioBufferRecognitionRequest class]]) {
        [(SFSpeechAudioBufferRecognitionRequest *)self.recognitionRequest endAudio];
        _audioEnded = YES;
        [self fireSpeechEnd];
    }
    if (_isRecording) {
        _isRecording = NO;
        NSLog(@"[DEBUG] Speech recognition stopped");
    }
}

// The only way out of a session: completed, failed, canceled and destroyed all end here. It can run twice.
- (void)teardownSession:(BOOL)cancelTask
{
    // A new id makes every callback of the old task a no-op
    _sessionId++;
    [self armEndOfSpeechTimer:0];
    [self stopLevelTimer];

    if (_tapInstalled) {
        [self.audioEngine stop];
        [self.audioEngine.inputNode removeTapOnBus:0];
        _tapInstalled = NO;
    }
    if (_sessionActive && !_audioEnded && [self.recognitionRequest isKindOfClass:[SFSpeechAudioBufferRecognitionRequest class]]) {
        [(SFSpeechAudioBufferRecognitionRequest *)self.recognitionRequest endAudio];
    }
    SFSpeechRecognitionTask *task = self.recognitionTask;
    self.recognitionTask = nil;
    self.recognitionRequest = nil;
    if (cancelTask && task && task.state != SFSpeechRecognitionTaskStateCompleted) {
        [task cancel];
    }
    _taskDelegate = nil;
    _meter = nil;
    _bufferConverter = nil;
    _pendingBytes = nil;
    _sessionActive = NO;
    _audioEnded = NO;
    _isRecording = NO;
    if (_temporaryFile) {
        [[NSFileManager defaultManager] removeItemAtPath:_temporaryFile error:nil];
        _temporaryFile = nil;
    }
    [self restoreAudioSession];
}

#pragma mark Timers

// iOS keeps listening until it is told the audio ended, so the module ends the session itself after a pause.
// A value of 0 or less cancels the timer.
- (void)armEndOfSpeechTimer:(NSTimeInterval)seconds
{
    void (^arm)(void) = ^{
        [self.endOfSpeechTimer invalidate];
        self.endOfSpeechTimer = nil;
        if (seconds <= 0 || !self->_isRecording) {
            return;
        }
        self.endOfSpeechTimer = [NSTimer scheduledTimerWithTimeInterval:seconds target:self selector:@selector(endOfSpeechTimerFired:) userInfo:nil repeats:NO];
    };
    if ([NSThread isMainThread]) {
        arm();
    } else {
        dispatch_async(dispatch_get_main_queue(), arm);
    }
}

- (void)endOfSpeechTimerFired:(NSTimer *)timer
{
    [self endAudioInput];
}

- (void)startLevelTimer
{
    [self stopLevelTimer];
    if (![self _hasListeners:@"audiolevel"]) {
        return;
    }
    double interval = [TiUtils doubleValue:@"audioLevelInterval" properties:_options def:100];
    self.levelTimer = [NSTimer scheduledTimerWithTimeInterval:MAX(interval, 10) / 1000.0 target:self selector:@selector(levelTimerFired:) userInfo:nil repeats:YES];
}

- (void)stopLevelTimer
{
    [self.levelTimer invalidate];
    self.levelTimer = nil;
}

- (void)levelTimerFired:(NSTimer *)timer
{
    if (!_meter || ![self _hasListeners:@"audiolevel"]) {
        return;
    }
    float rms = atomic_load_explicit(&_meter->rms, memory_order_relaxed);
    float decibels = 20.0f * log10f(MAX(rms, 1e-7f));
    float level = MIN(MAX((decibels - kLevelFloorDecibels) / kLevelRangeDecibels, 0.0f), 1.0f);
    [self fireEvent:@"audiolevel" withObject:@{ @"level": @(level), @"decibels": @(decibels) }];
}

- (void)restoreAudioSession
{
    if (!_audioSessionChanged) {
        return;
    }
    _audioSessionChanged = NO;
    AVAudioSession *audioSession = [AVAudioSession sharedInstance];
    [audioSession setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    [audioSession setCategory:_previousCategory mode:_previousMode options:_previousOptions error:nil];
}

#pragma mark Permissions

- (NSString *)speechStatusName
{
    switch ([SFSpeechRecognizer authorizationStatus]) {
        case SFSpeechRecognizerAuthorizationStatusAuthorized: return @"granted";
        case SFSpeechRecognizerAuthorizationStatusDenied: return @"denied";
        case SFSpeechRecognizerAuthorizationStatusRestricted: return @"restricted";
        default: return @"undetermined";
    }
}

- (NSString *)microphoneStatusName
{
    switch ([[AVAudioSession sharedInstance] recordPermission]) {
        case AVAudioSessionRecordPermissionGranted: return @"granted";
        case AVAudioSessionRecordPermissionDenied: return @"denied";
        default: return @"undetermined";
    }
}

- (NSDictionary *)permissionSnapshot
{
    NSString *speech = [self speechStatusName];
    NSString *microphone = [self microphoneStatusName];
    NSString *status = @"granted";
    if ([speech isEqualToString:@"restricted"]) {
        status = @"restricted";
    } else if ([speech isEqualToString:@"denied"] || [microphone isEqualToString:@"denied"]) {
        status = @"denied";
    } else if ([speech isEqualToString:@"undetermined"] || [microphone isEqualToString:@"undetermined"]) {
        status = @"undetermined";
    }
    return @{ @"granted": @([status isEqualToString:@"granted"]), @"status": status, @"speech": speech, @"microphone": microphone };
}

// Not named requestPermissions: Titanium exposes that name to JavaScript, and a block argument breaks it
- (void)ensurePermissionsNeedingMicrophone:(BOOL)needsMicrophone completion:(void (^)(BOOL granted))completion
{
    void (^afterSpeech)(void) = ^{
        if (needsMicrophone) {
            [self requestMicrophonePermission:completion];
        } else {
            completion(YES);
        }
    };
    SFSpeechRecognizerAuthorizationStatus authStatus = [SFSpeechRecognizer authorizationStatus];
    if (authStatus == SFSpeechRecognizerAuthorizationStatusAuthorized) {
        afterSpeech();
    } else if (authStatus == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) {
                    afterSpeech();
                } else {
                    completion(NO);
                }
            });
        }];
    } else {
        completion(NO);
    }
}

- (void)requestMicrophonePermission:(void (^)(BOOL granted))completion
{
    AVAudioSessionRecordPermission permission = [[AVAudioSession sharedInstance] recordPermission];

    if (permission == AVAudioSessionRecordPermissionGranted) {
        _permissionsGranted = YES;
        completion(YES);
    } else if (permission == AVAudioSessionRecordPermissionUndetermined) {
        [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted) {
            dispatch_async(dispatch_get_main_queue(), ^{
                self->_permissionsGranted = granted;
                completion(granted);
            });
        }];
    } else {
        completion(NO);
    }
}

#pragma mark Files

// A file proxy, a path, a file:// or app:// URL, or a blob. A blob held in memory goes to a temporary file that
// the session removes when it ends, which is what the temporary flag allows.
- (NSURL *)fileURLFromValue:(id)value temporary:(BOOL)temporary
{
    if ([value isKindOfClass:[NSString class]]) {
        NSString *string = value;
        if ([string hasPrefix:@"file://"]) {
            return [NSURL URLWithString:string];
        }
        if ([string hasPrefix:@"/"]) {
            return [NSURL fileURLWithPath:string];
        }
        if ([string hasPrefix:@"app://"]) {
            string = [string substringFromIndex:6];
        }
        return [NSURL fileURLWithPath:[[NSBundle mainBundle].resourcePath stringByAppendingPathComponent:string]];
    }
    if ([value isKindOfClass:[TiBlob class]]) {
        TiBlob *blob = value;
        if (blob.path.length > 0) {
            return [NSURL fileURLWithPath:blob.path];
        }
        if (temporary && blob.data.length > 0) {
            NSString *mime = blob.mimeType ?: @"";
            NSString *extension = [mime containsString:@"mpeg"] ? @"mp3" : ([mime containsString:@"mp4"] || [mime containsString:@"m4a"]) ? @"m4a" : @"wav";
            NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"utterance-%@.%@", [[NSUUID UUID] UUIDString], extension]];
            if ([blob.data writeToFile:path atomically:YES]) {
                _temporaryFile = path;
                return [NSURL fileURLWithPath:path];
            }
        }
        return nil;
    }
    if ([value respondsToSelector:@selector(nativePath)]) {
        return [self fileURLFromValue:[value nativePath] temporary:temporary];
    }
    return nil;
}

#pragma mark Results

// SFSpeechRecognitionTask documents didDetectSpeech and finishedReadingAudio, but on an iPad with iOS 27 neither was
// ever called, so the module reports speechstart with the first recognized text and speechend when the audio ends.
// If the system does call them, the flags keep each event to one per session.
- (void)fireSpeechStart
{
    if (!_speechStartFired) {
        _speechStartFired = YES;
        [self fire:@"speechstart" payload:@{}];
    }
}

- (void)fireSpeechEnd
{
    if (!_speechEndFired) {
        _speechEndFired = YES;
        [self fire:@"speechend" payload:@{}];
    }
}

- (void)sessionDetectedSpeech:(NSUInteger)sessionId
{
    if (sessionId == _sessionId && _sessionActive) {
        [self fireSpeechStart];
    }
}

- (void)sessionFinishedReadingAudio:(NSUInteger)sessionId
{
    if (sessionId == _sessionId && _sessionActive) {
        [self fireSpeechEnd];
    }
}

- (void)sessionProcessedDuration:(NSTimeInterval)duration session:(NSUInteger)sessionId
{
    if (sessionId == _sessionId && _sessionActive) {
        [self fire:@"audioduration" payload:@{ @"duration": @(duration) }];
    }
}

- (void)sessionHypothesis:(SFTranscription *)transcription session:(NSUInteger)sessionId
{
    if (sessionId != _sessionId || !_sessionActive) {
        return;
    }
    NSString *text = transcription.formattedString ?: @"";
    if (text.length == 0) {
        return;
    }
    [self fireSpeechStart];
    [self armEndOfSpeechTimer:_silenceTimeout];
    if (_partialEvents && ![text isEqualToString:_lastPartialText]) {
        _lastPartialText = [text copy];
        [self fire:@"partial" payload:@{ @"text": text, @"words": @[ text ] }];
    }
}

- (void)sessionResult:(SFSpeechRecognitionResult *)result session:(NSUInteger)sessionId
{
    if (sessionId != _sessionId || !_sessionActive) {
        return;
    }
    NSDictionary *event = [self completedPayload:result];
    [self fireSpeechEnd];
    [self teardownSession:NO];
    [self fire:@"completed" payload:event];
}

- (void)sessionError:(NSError *)error session:(NSUInteger)sessionId
{
    if (sessionId != _sessionId || !_sessionActive) {
        return;
    }
    [self fireErrorEvent:[NSString stringWithFormat:@"Recognition error: %@", error.localizedDescription] code:[self codeForError:error] nativeError:error];
}

- (NSDictionary *)acousticFeature:(SFAcousticFeature *)feature
{
    return @{ @"frameDuration": @(feature.frameDuration), @"values": feature.acousticFeatureValuePerFrame ?: @[] };
}

- (NSDictionary *)completedPayload:(SFSpeechRecognitionResult *)result
{
    NSDictionary *options = _options;
    NSInteger maxResults = [TiUtils intValue:@"maxResults" properties:options def:10];
    NSMutableArray *words = [NSMutableArray array];
    for (SFTranscription *transcription in result.transcriptions) {
        if (maxResults > 0 && (NSInteger)words.count >= maxResults) {
            break;
        }
        [words addObject:transcription.formattedString];
    }

    NSString *bestTranscription = result.bestTranscription.formattedString;
    BOOL hasResults = bestTranscription.length > 0;

    float totalConfidence = 0.0f;
    NSInteger segmentCount = 0;
    for (SFTranscriptionSegment *segment in result.bestTranscription.segments) {
        totalConfidence += segment.confidence;
        segmentCount++;
    }
    float averageConfidence = segmentCount > 0 ? totalConfidence / segmentCount : 0.0f;

    NSMutableDictionary *event = [@{
        @"success": @YES,
        @"detectedInput": @(hasResults),
        @"wordCount": @(words.count),
        @"words": words,
        @"text": bestTranscription ?: @"",
        @"confidence": @(averageConfidence),
        @"language": _requestedLanguage ?: _locale ?: @"",
        @"source": _source ?: kSourceMicrophone
    } mutableCopy];

    // Off by default so the common result stays small
    BOOL wantSegments = [TiUtils boolValue:@"segments" properties:options def:NO];
    BOOL wantAlternatives = [TiUtils boolValue:@"alternatives" properties:options def:NO];
    if (wantSegments || wantAlternatives) {
        NSMutableArray *segments = [NSMutableArray array];
        NSMutableArray *alternatives = [NSMutableArray array];
        for (SFTranscriptionSegment *segment in result.bestTranscription.segments) {
            NSRange range = segment.substringRange;
            NSNumber *start = @(range.location);
            NSNumber *end = @(range.location + range.length);
            [segments addObject:@{
                @"text": segment.substring,
                @"timestamp": @(segment.timestamp),
                @"duration": @(segment.duration),
                @"confidence": @(segment.confidence),
                @"start": start,
                @"end": end
            }];
            if (segment.alternativeSubstrings.count > 0) {
                [alternatives addObject:@{ @"start": start, @"end": end, @"alternatives": segment.alternativeSubstrings }];
            }
        }
        if (wantSegments) {
            event[@"segments"] = segments;
        }
        if (wantAlternatives) {
            event[@"alternatives"] = alternatives;
        }
    }

    SFSpeechRecognitionMetadata *metadata = result.speechRecognitionMetadata;
    if (metadata) {
        if ([TiUtils boolValue:@"metadata" properties:options def:NO]) {
            event[@"metadata"] = @{
                @"speakingRate": @(metadata.speakingRate),
                @"averagePauseDuration": @(metadata.averagePauseDuration),
                @"speechStartTimestamp": @(metadata.speechStartTimestamp),
                @"speechDuration": @(metadata.speechDuration)
            };
        }
        if ([TiUtils boolValue:@"voiceAnalytics" properties:options def:NO] && metadata.voiceAnalytics) {
            SFVoiceAnalytics *analytics = metadata.voiceAnalytics;
            event[@"voiceAnalytics"] = @{
                @"jitter": [self acousticFeature:analytics.jitter],
                @"shimmer": [self acousticFeature:analytics.shimmer],
                @"pitch": [self acousticFeature:analytics.pitch],
                @"voicing": [self acousticFeature:analytics.voicing]
            };
        }
    }
    return event;
}

#pragma mark Errors

// kAFAssistantErrorDomain and kLSRErrorDomain are the domains of real recognition errors (they are listed in the
// header of SFSpeechRecognitionTask); SFSpeechErrorCode covers file reading, timeouts and custom language models.
- (NSString *)codeForError:(NSError *)error
{
    if (!error) {
        return @"unknown";
    }
    NSString *domain = error.domain;
    NSInteger code = error.code;
    if ([domain isEqualToString:@"kAFAssistantErrorDomain"]) {
        switch (code) {
            case 1110: return @"no_speech";
            case 1700: return @"permission_denied";
            case 1100: return @"busy";
            case 1101:
            case 1107:
            case 203: return @"service_error";
            case 216: return @"canceled";
        }
    } else if ([domain isEqualToString:@"kLSRErrorDomain"]) {
        switch (code) {
            case 102: return @"language_unavailable";
            case 201: return @"disabled";
            case 300: return @"service_error";
            case 301: return @"canceled";
        }
    } else if ([domain isEqualToString:SFSpeechErrorDomain]) {
        switch (code) {
            case SFSpeechErrorCodeAudioReadFailed: return @"invalid_file";
            case SFSpeechErrorCodeTimeout: return @"timeout";
            case SFSpeechErrorCodeUndefinedTemplateClassName:
            case SFSpeechErrorCodeMalformedSupplementalModel: return @"language_model_invalid";
            case SFSpeechErrorCodeMissingParameter: return @"invalid_argument";
            case SFSpeechErrorCodeInternalServiceError: return @"service_error";
        }
    } else if ([domain isEqualToString:NSURLErrorDomain]) {
        return @"network";
    }
    return @"unknown";
}

#pragma mark Event Methods

// Events fire only when the app has a listener at that moment, and never inside the call that caused them:
// a method that answers at once (permissions already granted, an invalid language) would otherwise fire before its
// caller could wait for the event. Android posts to its main handler for the same reason.
- (void)fire:(NSString *)name payload:(NSDictionary *)payload
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if ([self _hasListeners:name]) {
            [self fireEvent:name withObject:payload];
        }
    });
}

- (void)fireStartedEvent
{
    [self fire:@"started" payload:@{ @"success": @YES, @"language": _requestedLanguage ?: _locale ?: @"", @"source": _source ?: kSourceMicrophone }];
}

- (void)fireErrorEvent:(NSString *)errorMessage code:(NSString *)code nativeError:(NSError *)nativeError
{
    // Clean up first, so a handler that starts a new session finds the module idle
    [self teardownSession:YES];
    NSMutableDictionary *event = [@{
        @"success": @NO,
        @"message": errorMessage,
        @"code": code,
        @"detectedInput": @NO,
        @"wordCount": @0,
        @"words": @[],
        @"language": _requestedLanguage ?: _locale ?: @"",
        @"source": _source ?: kSourceMicrophone
    } mutableCopy];
    if (nativeError) {
        event[@"nativeCode"] = @(nativeError.code);
        event[@"nativeDomain"] = nativeError.domain;
    }
    [self fire:@"completed" payload:event];
}

#pragma mark SFSpeechRecognizerDelegate

- (void)speechRecognizer:(SFSpeechRecognizer *)speechRecognizer availabilityDidChange:(BOOL)available
{
    NSLog(@"[DEBUG] Speech recognizer availability changed: %@", available ? @"YES" : @"NO");

    [self fire:@"availability" payload:@{ @"available": @(available), @"language": _requestedLanguage ?: _locale ?: @"" }];
    if (!available && (_isRecording || _sessionActive)) {
        [self fireErrorEvent:@"Speech recognizer became unavailable" code:@"unavailable" nativeError:nil];
    }
}

#pragma mark Constants for Cross-Platform Compatibility

- (NSString *)LANGUAGE_MODEL_FREE_FORM
{
    return @"free_form";
}

- (NSString *)LANGUAGE_MODEL_WEB_SEARCH
{
    return @"web_search";
}

#define UTTERANCE_STRING_CONSTANT(NAME, VALUE) \
- (NSString *)NAME { return VALUE; }

UTTERANCE_STRING_CONSTANT(TASK_HINT_DICTATION, @"dictation")
UTTERANCE_STRING_CONSTANT(TASK_HINT_SEARCH, @"search")
UTTERANCE_STRING_CONSTANT(TASK_HINT_CONFIRMATION, @"confirmation")
UTTERANCE_STRING_CONSTANT(TASK_HINT_UNSPECIFIED, @"unspecified")

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

@end
