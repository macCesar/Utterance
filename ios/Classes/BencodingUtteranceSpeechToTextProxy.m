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
            self.speechRecognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:_locale]];
            self.speechRecognizer.delegate = self;
            
            // Initialize audio engine
            self.audioEngine = [[AVAudioEngine alloc] init];
        }
    }
    
    [super _configure];
}

- (void)_destroy
{
    [self stopRecording:nil];
    
    self.speechRecognizer.delegate = nil;
    self.speechRecognizer = nil;
    self.recognitionRequest = nil;
    self.recognitionTask = nil;
    self.audioEngine = nil;
    
    [super _destroy];
}

#pragma mark Public API Methods

- (NSNumber *)isSupported:(id)unused
{
    return @(_isSupported);
}

- (void)startSpeechToText:(id)args
{
    ENSURE_SINGLE_ARG_OR_NIL(args, NSDictionary);
    ENSURE_UI_THREAD(startSpeechToText, args);
    
    if (!_isSupported) {
        [self fireErrorEvent:@"Speech recognition is not supported on this device"];
        return;
    }
    
    if (_isRecording) {
        NSLog(@"[DEBUG] Speech recognition already in progress");
        return;
    }
    
    // Parse arguments
    NSDictionary *options = args ? args : @{};
    NSString *promptText = [TiUtils stringValue:@"promptText" properties:options def:@"Speak now..."];
    NSInteger maxResults = [TiUtils intValue:@"maxResults" properties:options def:10];
    NSString *languageModel = [TiUtils stringValue:@"languageModel" properties:options def:@"free_form"];
    NSString *language = [TiUtils stringValue:@"language" properties:options def:_locale];
    _silenceTimeout = [TiUtils doubleValue:@"silenceTimeout" properties:options def:2.0];
    _noSpeechTimeout = [TiUtils doubleValue:@"noSpeechTimeout" properties:options def:6.0];
    
    // Update locale if specified
    if (![language isEqualToString:_locale]) {
        _locale = language;
        self.speechRecognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:_locale]];
        self.speechRecognizer.delegate = self;
    }
    
    // Request permissions first
    [self requestPermissions:^(BOOL granted) {
        if (!granted) {
            [self fireErrorEvent:@"Speech recognition permission denied"];
            return;
        }
        
        // Start recognition
        [self performSpeechRecognition:options];
    }];
}

- (void)stopRecording:(id)unused
{
    [self armEndOfSpeechTimer:0];
    
    if (!_isRecording) {
        return;
    }
    
    [self.audioEngine stop];
    [self.audioEngine.inputNode removeTapOnBus:0];
    [self.recognitionRequest endAudio];
    
    // The task is not canceled: iOS delivers the final result after endAudio, and cancel() would drop it
    _isRecording = NO;
    NSLog(@"[DEBUG] Speech recognition stopped");
}

#pragma mark Private Methods

// iOS keeps listening until it is told the audio ended, so the module ends the session itself after a pause.
// A value of 0 or less cancels the timer.
- (void)armEndOfSpeechTimer:(NSTimeInterval)seconds
{
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.endOfSpeechTimer invalidate];
        self.endOfSpeechTimer = nil;
        if (seconds <= 0 || !self->_isRecording) {
            return;
        }
        self.endOfSpeechTimer = [NSTimer scheduledTimerWithTimeInterval:seconds target:self selector:@selector(endOfSpeechTimerFired:) userInfo:nil repeats:NO];
    });
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

- (void)endOfSpeechTimerFired:(NSTimer *)timer
{
    [self stopRecording:nil];
}

- (void)requestPermissions:(void (^)(BOOL granted))completion
{
    // Check speech recognition authorization
    SFSpeechRecognizerAuthorizationStatus authStatus = [SFSpeechRecognizer authorizationStatus];
    
    if (authStatus == SFSpeechRecognizerAuthorizationStatusAuthorized) {
        // Check microphone permission
        [self requestMicrophonePermission:completion];
    } else if (authStatus == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
        // Request speech recognition permission
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) {
                    [self requestMicrophonePermission:completion];
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

- (void)performSpeechRecognition:(NSDictionary *)options
{
    // Cancel any previous task
    if (self.recognitionTask) {
        [self.recognitionTask cancel];
        self.recognitionTask = nil;
    }
    
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
        [self fireErrorEvent:[NSString stringWithFormat:@"Audio session error: %@", error.localizedDescription]];
        return;
    }
    
    // installTapOnBus throws when there is no audio input (a Simulator without one, or a mic held by another app)
    AVAudioFormat *inputFormat = [self.audioEngine.inputNode outputFormatForBus:0];
    if (!audioSession.isInputAvailable || inputFormat.sampleRate <= 0 || inputFormat.channelCount == 0) {
        [audioSession setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
        [self fireErrorEvent:@"No audio input available"];
        return;
    }
    
    // Create recognition request
    self.recognitionRequest = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
    
    if (!self.audioEngine.inputNode) {
        [self fireErrorEvent:@"Audio engine has no input node"];
        return;
    }
    
    if (!self.recognitionRequest) {
        [self fireErrorEvent:@"Unable to create recognition request"];
        return;
    }
    
    self.recognitionRequest.shouldReportPartialResults = YES;
    
    // Start recognition task
    __weak __typeof__(self) weakSelf = self;
    self.recognitionTask = [self.speechRecognizer recognitionTaskWithRequest:self.recognitionRequest resultHandler:^(SFSpeechRecognitionResult * _Nullable result, NSError * _Nullable error) {
        
        __strong __typeof__(weakSelf) strongSelf = weakSelf;
        if (!strongSelf) return;
        
        if (error) {
            [strongSelf fireErrorEvent:[NSString stringWithFormat:@"Recognition error: %@", error.localizedDescription]];
            [strongSelf stopRecording:nil];
            strongSelf.recognitionTask = nil;
            return;
        }
        
        if (result) {
            if (!result.isFinal && result.bestTranscription.formattedString.length > 0) {
                [strongSelf armEndOfSpeechTimer:strongSelf->_silenceTimeout];
            }
            if (result.isFinal) {
                // Final result - fire completed event
                [strongSelf fireCompletedEvent:result];
                [strongSelf stopRecording:nil];
                strongSelf.recognitionTask = nil;
            }
            // For partial results, we could fire intermediate events here if needed
        }
    }];
    
    // Configure audio input
    AVAudioFormat *recordingFormat = [self.audioEngine.inputNode outputFormatForBus:0];
    [self.audioEngine.inputNode installTapOnBus:0 bufferSize:1024 format:recordingFormat block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull when) {
        [self.recognitionRequest appendAudioPCMBuffer:buffer];
    }];
    
    // Start audio engine
    [self.audioEngine prepare];
    [self.audioEngine startAndReturnError:&error];
    
    if (error) {
        [self fireErrorEvent:[NSString stringWithFormat:@"Audio engine start error: %@", error.localizedDescription]];
        return;
    }
    
    _isRecording = YES;
    [self armEndOfSpeechTimer:_noSpeechTimeout];
    
    // Fire started event
    [self fireStartedEvent];
    
    NSLog(@"[DEBUG] Speech recognition started (%@)", _locale);
}

#pragma mark Event Methods

- (void)fireStartedEvent
{
    if ([self _hasListeners:@"started"]) {
        NSDictionary *event = @{
            @"success": @YES
        };
        [self fireEvent:@"started" withObject:event];
    }
}

- (void)fireCompletedEvent:(SFSpeechRecognitionResult *)result
{
    [self restoreAudioSession];
    if ([self _hasListeners:@"completed"]) {
        NSMutableArray *words = [NSMutableArray array];
        
        // Get all transcription segments
        for (SFTranscription *transcription in result.transcriptions) {
            [words addObject:transcription.formattedString];
        }
        
        // Primary result
        NSString *bestTranscription = result.bestTranscription.formattedString;
        BOOL hasResults = bestTranscription.length > 0;
        
        // Calculate average confidence from segments
        float totalConfidence = 0.0f;
        NSInteger segmentCount = 0;
        
        for (SFTranscriptionSegment *segment in result.bestTranscription.segments) {
            totalConfidence += segment.confidence;
            segmentCount++;
        }
        
        float averageConfidence = segmentCount > 0 ? totalConfidence / segmentCount : 0.0f;
        
        NSDictionary *event = @{
            @"success": @YES,
            @"detectedInput": @(hasResults),
            @"wordCount": @(words.count),
            @"words": words,
            @"text": bestTranscription ?: @"",
            @"confidence": @(averageConfidence)
        };
        
        [self fireEvent:@"completed" withObject:event];
    }
}

- (void)fireErrorEvent:(NSString *)errorMessage
{
    [self restoreAudioSession];
    if ([self _hasListeners:@"completed"]) {
        NSDictionary *event = @{
            @"success": @NO,
            @"message": errorMessage,
            @"detectedInput": @NO,
            @"wordCount": @0,
            @"words": @[]
        };
        [self fireEvent:@"completed" withObject:event];
    }
}

#pragma mark SFSpeechRecognizerDelegate

- (void)speechRecognizer:(SFSpeechRecognizer *)speechRecognizer availabilityDidChange:(BOOL)available
{
    NSLog(@"[DEBUG] Speech recognizer availability changed: %@", available ? @"YES" : @"NO");
    
    if (!available && _isRecording) {
        [self stopRecording:nil];
        [self fireErrorEvent:@"Speech recognizer became unavailable"];
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

@end
