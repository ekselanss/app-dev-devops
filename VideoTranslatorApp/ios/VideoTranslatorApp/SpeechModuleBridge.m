#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Swift SpeechModule için Objective-C köprüsü
RCT_EXTERN_MODULE(SpeechModule, RCTEventEmitter)

RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startListening:(NSString *)languageCode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopListening:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
