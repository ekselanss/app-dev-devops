package com.videotranslatorapp;

import android.content.Intent;
import android.os.Build;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ForegroundServiceModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactCtx;
    private final ReactApplicationContext reactContext;

    public ForegroundServiceModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactCtx = reactContext;
    }

    public static ReactApplicationContext getReactContext() {
        return reactCtx;
    }

    @Override
    public String getName() { return "ForegroundService"; }

    @ReactMethod
    public void startService(String statusText) {
        Intent intent = new Intent(reactContext, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TEXT, statusText);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent);
        } else {
            reactContext.startService(intent);
        }
    }

    /** Android 14+: MediaProjection öncesi servis mediaProjection tipiyle başlatılmalı */
    @ReactMethod
    public void startServiceForProjection(String statusText) {
        Intent intent = new Intent(reactContext, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TEXT, statusText);
        intent.putExtra(AudioForegroundService.EXTRA_USE_MEDIA_PROJECTION, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent);
        } else {
            reactContext.startService(intent);
        }
    }

    @ReactMethod
    public void stopService() {
        Intent intent = new Intent(reactContext, AudioForegroundService.class);
        reactContext.stopService(intent);
    }

    @ReactMethod
    public void updateNotification(String statusText) {
        Intent intent = new Intent(reactContext, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TEXT, statusText);
        reactContext.startService(intent);
    }

    @ReactMethod
    public void setTileActive(boolean active) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            TranslatorTileService.setRecordingState(active, reactContext);
        }
    }
}
