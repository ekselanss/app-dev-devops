import Foundation
import Speech
import AVFoundation

/**
 * SpeechModule — iOS Live Caption eşdeğeri
 *
 * SFSpeechRecognizer ile cihaz üzerinde gerçek zamanlı ses → metin.
 * Android'deki Live Caption + Accessibility Service kombinasyonunun iOS karşılığıdır.
 *
 * Gecikme: ~300-500ms (on-device, internet yok)
 * Desteklenen diller: 50+ dil
 *
 * React Native kullanımı:
 *   import { NativeModules, NativeEventEmitter } from 'react-native';
 *   const { SpeechModule } = NativeModules;
 *   const emitter = new NativeEventEmitter(SpeechModule);
 *   emitter.addListener('onSpeechText', ({ text, isFinal }) => { ... });
 */
@objc(SpeechModule)
class SpeechModule: RCTEventEmitter {

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    private var isRunning = false
    private var lastPartialText = ""

    override static func requiresMainQueueSetup() -> Bool { return false }

    override func supportedEvents() -> [String]! {
        return ["onSpeechText", "onSpeechStatus", "onSpeechError"]
    }

    // MARK: - İzin

    @objc func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                resolve(true)
            case .denied, .restricted, .notDetermined:
                resolve(false)
            @unknown default:
                resolve(false)
            }
        }
    }

    @objc func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        let recognizer = SFSpeechRecognizer()
        resolve(recognizer?.isAvailable ?? false)
    }

    // MARK: - Başlat

    @objc func startListening(_ languageCode: String,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard !isRunning else {
            resolve(false)
            return
        }

        // Dil locale ayarla (örn: "en-US", "de-DE", "fr-FR")
        let locale = Locale(identifier: languageCode.isEmpty ? "en-US" : languageCode)
        speechRecognizer = SFSpeechRecognizer(locale: locale)

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            sendEvent("onSpeechError", ["error": "SFSpeechRecognizer kullanılamıyor"])
            reject("UNAVAILABLE", "Speech recognizer kullanılamıyor", nil)
            return
        }

        // On-device tanıma tercih et (internet yok, düşük gecikme)
        recognizer.supportsOnDeviceRecognition = true

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else {
                reject("ERROR", "Request oluşturulamadı", nil)
                return
            }

            // Partial sonuçları etkinleştir — kelime kelime çıktı (Live Caption gibi)
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = true
            request.taskHint = .dictation

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self = self else { return }

                if let result = result {
                    let text = result.bestTranscription.formattedString
                    let isFinal = result.isFinal

                    // Partial: sadece değişiklik varsa gönder
                    if !isFinal && text == self.lastPartialText { return }
                    self.lastPartialText = isFinal ? "" : text

                    self.sendEvent("onSpeechText", [
                        "text": text,
                        "isFinal": isFinal,
                        "locale": languageCode
                    ])

                    if isFinal {
                        // Final sonuç sonrası yeni session başlat
                        self.restartRecognition(languageCode: languageCode)
                    }
                }

                if let error = error as NSError? {
                    // 1110 = no speech, 203 = retry — bunlar normal
                    if error.code != 1110 && error.code != 203 {
                        self.sendEvent("onSpeechError", ["error": error.localizedDescription])
                    }
                    self.restartRecognition(languageCode: languageCode)
                }
            }

            // Mikrofon input → recognition request
            let inputNode = audioEngine.inputNode
            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
                self.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            isRunning = true

            sendEvent("onSpeechStatus", ["status": "listening", "locale": languageCode])
            resolve(true)

        } catch {
            reject("ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - Durdur

    @objc func stopListening(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        stopEngine()
        sendEvent("onSpeechStatus", ["status": "stopped"])
        resolve(true)
    }

    // MARK: - Yardımcı

    private func stopEngine() {
        isRunning = false
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        lastPartialText = ""
    }

    private func restartRecognition(languageCode: String) {
        guard isRunning else { return }
        stopEngine()
        // 200ms sonra yeniden başlat (sürekli dinleme)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self = self, self.isRunning == false else { return }
            self.startListening(languageCode, resolver: { _ in }, rejecter: { _, _, _ in })
        }
    }

    private func sendEvent(_ name: String, _ body: [String: Any]) {
        sendEvent(withName: name, body: body)
    }
}
