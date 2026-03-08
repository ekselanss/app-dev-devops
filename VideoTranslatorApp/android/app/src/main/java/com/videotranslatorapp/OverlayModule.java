package com.videotranslatorapp;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class OverlayModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;

    public OverlayModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() { return "OverlayService"; }

    @ReactMethod
    public void hasPermission(com.facebook.react.bridge.Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext));
        } else {
            promise.resolve(true);
        }
    }

    @ReactMethod
    public void requestPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
        }
    }

    @ReactMethod
    public void showOverlay() {
        Intent intent = new Intent(reactContext, OverlayService.class);
        intent.setAction(OverlayService.ACTION_SHOW);
        reactContext.startService(intent);
    }

    @ReactMethod
    public void hideOverlay() {
        Intent intent = new Intent(reactContext, OverlayService.class);
        intent.setAction(OverlayService.ACTION_HIDE);
        reactContext.startService(intent);
    }

    @ReactMethod
    public void updateText(String original, String translated) {
        Intent intent = new Intent(reactContext, OverlayService.class);
        intent.setAction(OverlayService.ACTION_UPDATE);
        intent.putExtra(OverlayService.EXTRA_ORIGINAL, original);
        intent.putExtra(OverlayService.EXTRA_TRANSLATED, translated);
        reactContext.startService(intent);
    }
}
