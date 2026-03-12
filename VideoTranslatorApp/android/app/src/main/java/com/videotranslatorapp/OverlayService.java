package com.videotranslatorapp;

import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

public class OverlayService extends Service {

    public static final String ACTION_SHOW    = "OVERLAY_SHOW";
    public static final String ACTION_HIDE    = "OVERLAY_HIDE";
    public static final String ACTION_UPDATE  = "OVERLAY_UPDATE";
    public static final String EXTRA_ORIGINAL   = "original";
    public static final String EXTRA_TRANSLATED = "translated";

    private WindowManager windowManager;
    private LinearLayout  overlayView;
    private TextView      tvOriginal;
    private TextView      tvTranslated;

    private int   initialX, initialY;
    private float initialTouchX, initialTouchY;

    @Override
    public void onCreate() {
        super.onCreate();
        buildOverlayView();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_SHOW.equals(action)) {
            showOverlay();
        } else if (ACTION_HIDE.equals(action)) {
            hideOverlay();
            stopSelf();
        } else if (ACTION_UPDATE.equals(action)) {
            String original   = intent.getStringExtra(EXTRA_ORIGINAL);
            String translated = intent.getStringExtra(EXTRA_TRANSLATED);
            updateText(original, translated);
        }
        return START_NOT_STICKY;
    }

    private void buildOverlayView() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        overlayView = new LinearLayout(this);
        overlayView.setOrientation(LinearLayout.VERTICAL);
        overlayView.setBackgroundColor(Color.argb(200, 0, 0, 0));
        overlayView.setPadding(24, 16, 24, 16);

        tvOriginal = new TextView(this);
        tvOriginal.setTextColor(Color.argb(180, 220, 220, 220));
        tvOriginal.setTextSize(13f);
        tvOriginal.setMaxLines(2);
        tvOriginal.setEllipsize(android.text.TextUtils.TruncateAt.END);
        tvOriginal.setVisibility(View.GONE);
        overlayView.addView(tvOriginal);

        tvTranslated = new TextView(this);
        tvTranslated.setTextColor(Color.WHITE);
        tvTranslated.setTextSize(16f);
        tvTranslated.setMaxLines(3);
        tvTranslated.setEllipsize(android.text.TextUtils.TruncateAt.END);
        tvTranslated.setText("Dinleniyor...");
        overlayView.addView(tvTranslated);

        overlayView.setOnTouchListener((v, event) -> {
            WindowManager.LayoutParams p = (WindowManager.LayoutParams) overlayView.getLayoutParams();
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = p.x;
                    initialY = p.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    p.x = initialX + (int)(event.getRawX() - initialTouchX);
                    p.y = initialY + (int)(event.getRawY() - initialTouchY);
                    windowManager.updateViewLayout(overlayView, p);
                    return true;
            }
            return false;
        });
    }

    private void showOverlay() {
        if (overlayView.getWindowToken() != null) return;

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.x = 0;
        params.y = 100;

        windowManager.addView(overlayView, params);
    }

    private void hideOverlay() {
        if (overlayView != null && overlayView.getWindowToken() != null) {
            windowManager.removeView(overlayView);
        }
    }

    private void updateText(String original, String translated) {
        if (overlayView == null) return;
        overlayView.post(() -> {
            if (translated != null && !translated.isEmpty()) {
                tvTranslated.setText(translated);
            }
            // Original metni sakla ama gösterme — ekranı kaplıyor
            if (original != null) {
                tvOriginal.setText(original);
            }
            // tvOriginal.setVisibility(View.GONE) — kullanıcı toggle ile açabilir
        });
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        hideOverlay();
        super.onDestroy();
    }
}
