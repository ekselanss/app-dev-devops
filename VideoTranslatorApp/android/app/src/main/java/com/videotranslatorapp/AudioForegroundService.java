package com.videotranslatorapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class AudioForegroundService extends Service {
    public static final String CHANNEL_ID = "audio_recording_channel";
    public static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_STOP = "com.videotranslatorapp.ACTION_STOP";
    public static final String EXTRA_TEXT = "status_text";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    public static final String EXTRA_USE_MEDIA_PROJECTION = "use_media_projection";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = "Dinleniyor...";
        boolean useMediaProjection = false;
        if (intent != null) {
            if (intent.hasExtra(EXTRA_TEXT)) text = intent.getStringExtra(EXTRA_TEXT);
            useMediaProjection = intent.getBooleanExtra(EXTRA_USE_MEDIA_PROJECTION, false);
        }
        Notification notification = buildNotification(text);
        // Android 14+ (API 34): startForeground'a tip belirtmek zorunlu
        if (Build.VERSION.SDK_INT >= 34) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (useMediaProjection) {
                serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            }
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    private Notification buildNotification(String statusText) {
        // Uygulamayı aç
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Durdur butonu
        Intent stopIntent = new Intent(this, NotificationActionReceiver.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Video Çeviri")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Durdur", stopPendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build();
    }

    public static void updateNotificationText(android.content.Context context, String text) {
        Intent intent = new Intent(context, AudioForegroundService.class);
        intent.putExtra(EXTRA_TEXT, text);
        context.startService(intent);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Ses Kayıt",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Video çeviri arka plan servisi");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
