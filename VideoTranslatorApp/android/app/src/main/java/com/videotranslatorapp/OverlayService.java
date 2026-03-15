package com.videotranslatorapp;

import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.HashMap;
import java.util.Map;

public class OverlayService extends Service {

    public static final String ACTION_SHOW    = "OVERLAY_SHOW";
    public static final String ACTION_HIDE    = "OVERLAY_HIDE";
    public static final String ACTION_UPDATE  = "OVERLAY_UPDATE";
    public static final String EXTRA_ORIGINAL    = "original";
    public static final String EXTRA_TRANSLATED  = "translated";
    public static final String EXTRA_LANGUAGE    = "language";
    public static final String EXTRA_TARGET_LANG = "target_language";

    private WindowManager windowManager;
    private LinearLayout  overlayView;
    private TextView      tvLangBadge;
    private TextView      tvOriginal;
    private TextView      tvTranslated;

    private int   initialX, initialY;
    private float initialTouchX, initialTouchY;

    // Dil bayrak ve kisa isim haritasi
    private static final Map<String, String> LANG_FLAGS = new HashMap<>();
    static {
        LANG_FLAGS.put("en", "\uD83C\uDDEC\uD83C\uDDE7 EN");
        LANG_FLAGS.put("es", "\uD83C\uDDEA\uD83C\uDDF8 ES");
        LANG_FLAGS.put("fr", "\uD83C\uDDEB\uD83C\uDDF7 FR");
        LANG_FLAGS.put("de", "\uD83C\uDDE9\uD83C\uDDEA DE");
        LANG_FLAGS.put("ru", "\uD83C\uDDF7\uD83C\uDDFA RU");
        LANG_FLAGS.put("ja", "\uD83C\uDDEF\uD83C\uDDF5 JA");
        LANG_FLAGS.put("ko", "\uD83C\uDDF0\uD83C\uDDF7 KO");
        LANG_FLAGS.put("zh", "\uD83C\uDDE8\uD83C\uDDF3 ZH");
        LANG_FLAGS.put("ar", "\uD83C\uDDF8\uD83C\uDDE6 AR");
        LANG_FLAGS.put("pt", "\uD83C\uDDE7\uD83C\uDDF7 PT");
        LANG_FLAGS.put("it", "\uD83C\uDDEE\uD83C\uDDF9 IT");
        LANG_FLAGS.put("tr", "\uD83C\uDDF9\uD83C\uDDF7 TR");
        LANG_FLAGS.put("nl", "\uD83C\uDDF3\uD83C\uDDF1 NL");
        LANG_FLAGS.put("hi", "\uD83C\uDDEE\uD83C\uDDF3 HI");
        LANG_FLAGS.put("ur", "\uD83C\uDDF5\uD83C\uDDF0 UR");
        LANG_FLAGS.put("fa", "\uD83C\uDDEE\uD83C\uDDF7 FA");
    }

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
            String original    = intent.getStringExtra(EXTRA_ORIGINAL);
            String translated  = intent.getStringExtra(EXTRA_TRANSLATED);
            String language    = intent.getStringExtra(EXTRA_LANGUAGE);
            String targetLang  = intent.getStringExtra(EXTRA_TARGET_LANG);
            updateText(original, translated, language, targetLang);
        }
        return START_NOT_STICKY;
    }

    private void buildOverlayView() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        overlayView = new LinearLayout(this);
        overlayView.setOrientation(LinearLayout.VERTICAL);
        overlayView.setBackgroundColor(Color.argb(210, 0, 0, 0));
        overlayView.setPadding(24, 12, 24, 16);

        // Ust satir: bayrak + dil kodu
        tvLangBadge = new TextView(this);
        tvLangBadge.setTextColor(Color.argb(230, 255, 255, 255));
        tvLangBadge.setTextSize(13f);
        tvLangBadge.setTypeface(null, Typeface.BOLD);
        tvLangBadge.setBackgroundColor(Color.argb(50, 255, 255, 255));
        tvLangBadge.setPadding(16, 4, 16, 4);
        tvLangBadge.setVisibility(View.GONE);
        overlayView.addView(tvLangBadge);

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
        tvTranslated.setTypeface(null, Typeface.BOLD);
        tvTranslated.setEllipsize(android.text.TextUtils.TruncateAt.END);
        tvTranslated.setText("Dinleniyor...");
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = 6;
        tvTranslated.setLayoutParams(lp);
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

    private String getFlagOnly(String langCode) {
        String full = LANG_FLAGS.getOrDefault(langCode, "");
        // Bayrak emojisi ilk 4 karakter (surrogate pair x2)
        if (full.length() >= 4) return full.substring(0, 4);
        return "\uD83C\uDF10";
    }

    private String getCodeOnly(String langCode) {
        return langCode != null ? langCode.toUpperCase() : "??";
    }

    private void updateText(String original, String translated, String language, String targetLang) {
        if (overlayView == null) return;
        overlayView.post(() -> {
            // Kaynak bayrak + kod → Hedef bayrak + kod
            // Ornek: 🇬🇧 EN → 🇹🇷 TR
            if (language != null && !language.isEmpty()) {
                String srcFlag = getFlagOnly(language);
                String srcCode = getCodeOnly(language);
                String tgtFlag = getFlagOnly(targetLang != null ? targetLang : "tr");
                String tgtCode = getCodeOnly(targetLang != null ? targetLang : "tr");
                String badge = srcFlag + " " + srcCode + "  \u2192  " + tgtFlag + " " + tgtCode;
                tvLangBadge.setText(badge);
                tvLangBadge.setVisibility(View.VISIBLE);
            }

            if (translated != null && !translated.isEmpty()) {
                tvTranslated.setText(translated);
            }
            if (original != null) {
                tvOriginal.setText(original);
            }
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
