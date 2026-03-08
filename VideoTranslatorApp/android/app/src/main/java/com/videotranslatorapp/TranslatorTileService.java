package com.videotranslatorapp;

import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import androidx.annotation.RequiresApi;
import com.facebook.react.modules.core.DeviceEventManagerModule;

@RequiresApi(api = Build.VERSION_CODES.N)
public class TranslatorTileService extends TileService {

    private static boolean sIsRecording = false;

    /** Uygulama tarafından çağrılır — tile durumunu günceller */
    public static void setRecordingState(boolean recording, android.content.Context context) {
        sIsRecording = recording;
        TileService.requestListeningState(
            context,
            new android.content.ComponentName(context, TranslatorTileService.class)
        );
    }

    @Override
    public void onStartListening() {
        super.onStartListening();
        refreshTile();
    }

    @Override
    public void onClick() {
        super.onClick();

        if (sIsRecording) {
            // Kaydı durdur — React Native'e bildir
            stopRecordingFromTile();
        } else {
            // Uygulamayı aç ve kaydı başlat
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("tile_start", true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ API
                startActivity(intent);
            } else {
                startActivityAndCollapse(intent);
            }
        }
    }

    private void stopRecordingFromTile() {
        // Servisi durdur
        Intent serviceIntent = new Intent(this, AudioForegroundService.class);
        stopService(serviceIntent);

        // React Native'e event gönder
        android.app.Application app = (android.app.Application) getApplicationContext();
        com.facebook.react.bridge.ReactApplicationContext reactContext =
            ForegroundServiceModule.getReactContext();
        if (reactContext != null && reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onTileStop", null);
        }

        sIsRecording = false;
        refreshTile();
    }

    private void refreshTile() {
        Tile tile = getQsTile();
        if (tile == null) return;

        if (sIsRecording) {
            tile.setState(Tile.STATE_ACTIVE);
            tile.setLabel("Çeviri Açık");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                tile.setSubtitle("Dinleniyor...");
            }
        } else {
            tile.setState(Tile.STATE_INACTIVE);
            tile.setLabel("Video Çeviri");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                tile.setSubtitle("Başlatmak için dokun");
            }
        }
        tile.updateTile();
    }
}
