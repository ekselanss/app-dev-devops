package com.videotranslatorapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (AudioForegroundService.ACTION_STOP.equals(action)) {
            // Servisi durdur
            Intent serviceIntent = new Intent(context, AudioForegroundService.class);
            context.stopService(serviceIntent);

            // React Native'e bildir (JS tarafı kaydı durdursun)
            ReactApplicationContext reactContext = ForegroundServiceModule.getReactContext();
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onNotificationStop", null);
            }
        }
    }
}
