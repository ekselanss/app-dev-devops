package com.videotranslatorapp;

import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.os.Build;
import android.provider.Settings;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityManager;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.List;

/**
 * LiveCaptionModule — React Native bridge
 *
 * JS tarafı:
 *   import { NativeModules, NativeEventEmitter } from 'react-native';
 *   const { LiveCaptionModule } = NativeModules;
 *   const emitter = new NativeEventEmitter(LiveCaptionModule);
 *   emitter.addListener('onCaptionText', ({ text }) => { ... });
 */
public class LiveCaptionModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "LiveCaptionModule";
    private static final String EVENT_CAPTION = "onCaptionText";
    private static final String EVENT_STATUS = "onCaptionStatus";

    private final ReactApplicationContext reactContext;

    public LiveCaptionModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        LiveCaptionService.setModule(this);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /** Accessibility Service açık mı? */
    @ReactMethod
    public void isEnabled(Promise promise) {
        try {
            promise.resolve(isAccessibilityServiceEnabled());
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // NativeEventEmitter için zorunlu — bu olmadan JS'de "addListener method" uyarısı çıkar
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}

    /**
     * Doğrudan VideoTranslatorApp'in Accessibility ayar sayfasına git.
     * Genel listeden bulmak yerine direkt açar — tek tık yeterli.
     */
    @ReactMethod
    public void openSettings(Promise promise) {
        try {
            // Android 9+: doğrudan uygulamanın accessibility detay sayfası
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            // Bazı OEM'lerde (TECNO, Xiaomi, Samsung) fragment arg çalışıyor
            String pkg = reactContext.getPackageName();
            intent.putExtra(":settings:fragment_args_key",
                    pkg + "/.LiveCaptionService");
            intent.putExtra(":settings:show_fragment_args",
                    android.os.Bundle.EMPTY);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * Pil optimizasyonundan muaf tut — TECNO/Xiaomi gibi cihazlar
     * accessibility servisi pil optimizasyonu nedeniyle kapatır.
     * Bu izin verildikten sonra servis uygulama yeniden başlasa bile açık kalır.
     */
    @ReactMethod
    public void requestBatteryOptimizationExemption(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                String pkg = reactContext.getPackageName();
                PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                    Intent intent = new Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + pkg));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.resolve(false); // dialog açıldı, henüz verilmedi
                } else {
                    promise.resolve(true); // zaten muaf
                }
            } else {
                promise.resolve(true);
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    /** Pil optimizasyonundan muaf mı? */
    @ReactMethod
    public void isBatteryOptimizationIgnored(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
                boolean ignored = pm != null &&
                        pm.isIgnoringBatteryOptimizations(reactContext.getPackageName());
                promise.resolve(ignored);
            } else {
                promise.resolve(true);
            }
        } catch (Exception e) {
            promise.resolve(true);
        }
    }

    // ── Service callback'leri ──────────────────────────────

    public void onCaptionText(String text) {
        // hasActiveCatalystInstance() RN New Architecture'da false döndürüyor — try/catch kullan
        try {
            com.facebook.react.bridge.WritableMap params = com.facebook.react.bridge.Arguments.createMap();
            params.putString("text", text);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_CAPTION, params);
            android.util.Log.d("LiveCaptionModule", "Event gönderildi: " + text.substring(0, Math.min(text.length(), 50)));
        } catch (Exception e) {
            android.util.Log.e("LiveCaptionModule", "Event gönderilemedi: " + e.getMessage());
        }
    }

    public void onServiceConnected() {
        sendStatus("connected");
    }

    public void onServiceDisconnected() {
        sendStatus("disconnected");
    }

    private void sendStatus(String status) {
        try {
            com.facebook.react.bridge.WritableMap params = com.facebook.react.bridge.Arguments.createMap();
            params.putString("status", status);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_STATUS, params);
        } catch (Exception e) {
            android.util.Log.e("LiveCaptionModule", "Status gönderilemedi: " + e.getMessage());
        }
    }

    // ── Yardımcı ──────────────────────────────────────────

    private boolean isAccessibilityServiceEnabled() {
        AccessibilityManager am = (AccessibilityManager)
            reactContext.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null) return false;

        List<AccessibilityServiceInfo> services =
            am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        String targetService = reactContext.getPackageName() + "/.LiveCaptionService";

        for (AccessibilityServiceInfo info : services) {
            if (info.getId() != null && info.getId().contains("LiveCaptionService")) {
                return true;
            }
        }
        return false;
    }
}
