package com.videotranslatorapp;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;

/**
 * SpeechRecognizerModule — Android built-in SpeechRecognizer bridge
 *
 * Live Caption accessibility service yaklaşımı TECNO/OEM cihazlarda
 * güvenilir değil (paket filtresi, batarya optimizasyonu, OEM değişiklikleri).
 *
 * Bu modül Android'in yerleşik SpeechRecognizer API'sini kullanır:
 * - Tüm Android cihazlarda çalışır (Android 4.1+)
 * - Kısmi sonuçlarla ~0.5s gecikme
 * - Sürekli tanıma (onResults → auto-restart)
 * - RECORD_AUDIO izni yeterli, Accessibility Service gerekmez
 *
 * Olaylar (iOS SpeechModule ile aynı format — CaptionBridgeService uyumlu):
 *   onSpeechText  { text: string, isFinal: boolean }
 *   onSpeechStatus { status: "listening" | "stopped" | "error" }
 */
public class SpeechRecognizerModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SpeechRecognizer";
    private static final String MODULE_NAME = "SpeechRecognizerModule";

    private final ReactApplicationContext reactContext;
    private final Handler mainHandler;

    private SpeechRecognizer speechRecognizer;
    private boolean shouldContinue = false;
    private String currentLanguage = "en-US";

    // Partial result debounce — aynı metni tekrar gönderme
    private String lastPartialText = "";

    public SpeechRecognizerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // NativeEventEmitter için zorunlu
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}

    @ReactMethod
    public void isAvailable(Promise promise) {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactContext));
    }

    @ReactMethod
    public void startListening(String languageCode, Promise promise) {
        mainHandler.post(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    promise.reject("NOT_AVAILABLE", "Speech recognition kullanılamıyor");
                    return;
                }
                shouldContinue = true;
                currentLanguage = (languageCode != null && !languageCode.isEmpty())
                        ? languageCode : "en-US";
                lastPartialText = "";
                startRecognitionSession();
                promise.resolve(true);
                sendStatus("listening");
            } catch (Exception e) {
                Log.e(TAG, "startListening hatası: " + e.getMessage());
                promise.reject("ERROR", e.getMessage());
            }
        });
    }

    @ReactMethod
    public void stopListening(Promise promise) {
        mainHandler.post(() -> {
            shouldContinue = false;
            destroyRecognizer();
            sendStatus("stopped");
            if (promise != null) promise.resolve(true);
        });
    }

    // ── İç ──────────────────────────────────────────────────

    private void startRecognitionSession() {
        destroyRecognizer();

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {

            @Override public void onReadyForSpeech(Bundle params) {
                Log.d(TAG, "Mikrofon hazır");
            }

            @Override public void onBeginningOfSpeech() {}

            @Override public void onRmsChanged(float rmsdB) {}

            @Override public void onBufferReceived(byte[] buffer) {}

            @Override public void onEndOfSpeech() {
                Log.d(TAG, "Konuşma bitti");
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    String text = matches.get(0);
                    if (text != null && !text.isEmpty() && !text.equals(lastPartialText)) {
                        lastPartialText = text;
                        sendText(text, false);
                    }
                }
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches = results
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    String text = matches.get(0);
                    if (text != null && !text.isEmpty()) {
                        lastPartialText = "";
                        sendText(text, true);
                    }
                }
                // Sürekli tanıma: final sonuç gelince hemen yeniden başlat
                scheduleRestart(100);
            }

            @Override
            public void onError(int error) {
                Log.w(TAG, "SpeechRecognizer hatası: " + error);
                int delayMs;
                switch (error) {
                    case SpeechRecognizer.ERROR_NO_MATCH:
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                        delayMs = 200;   // Normal — sessizlik veya tanınamadı
                        break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                        delayMs = 500;
                        break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                        delayMs = 2000;
                        sendStatus("error");
                        break;
                    default:
                        delayMs = 1000;
                }
                scheduleRestart(delayMs);
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        // Sessizlik toleransı — çok erken bitirmesin
        intent.putExtra("android.speech.extra.DICTATION_MODE", true);

        speechRecognizer.startListening(intent);
        Log.d(TAG, "Dinleme başladı: " + currentLanguage);
    }

    private void scheduleRestart(int delayMs) {
        mainHandler.postDelayed(() -> {
            if (shouldContinue) startRecognitionSession();
        }, delayMs);
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
    }

    private void sendText(String text, boolean isFinal) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("text", text);
            params.putBoolean("isFinal", isFinal);
            Log.d(TAG, "sendText → " + text.substring(0, Math.min(text.length(), 60)));
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onSpeechText", params);
        } catch (Exception e) {
            Log.e(TAG, "sendText hatası: " + e.getMessage());
        }
    }

    private void sendStatus(String status) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("status", status);
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onSpeechStatus", params);
        } catch (Exception e) {
            Log.e(TAG, "sendStatus hatası: " + e.getMessage());
        }
    }
}
