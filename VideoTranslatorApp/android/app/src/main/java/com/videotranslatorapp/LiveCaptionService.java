package com.videotranslatorapp;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Android Live Caption Accessibility Service
 *
 * YAKLAŞIM:
 *   1. Package filtresi KALDIRILDI — TECNO/Samsung/OEM farklı paket adı kullanır
 *   2. Tüm accessibility event'ları dinler, caption-like node'ları tespit eder
 *   3. View ID'de "caption" geçiyorsa VEYA bilinen Live Caption paketiyse yakala
 *   4. System overlay window'ları da dahil (FLAG_INCLUDE_NOT_IMPORTANT_VIEWS)
 *
 * Mimari:
 *   Live Caption overlay → AccessibilityEvent → LiveCaptionService → LiveCaptionModule → JS
 */
public class LiveCaptionService extends AccessibilityService {

    private static final String TAG = "LiveCaptionService";

    // Bilinen Live Caption paket adları (OEM farklılıkları)
    private static final Set<String> CAPTION_PACKAGES = new HashSet<>(Arrays.asList(
        "com.google.android.as",          // Pixel, çoğu Android
        "com.google.android.as.oss",      // Google One UI / bazı sürümler
        "com.samsung.android.bixby.agent",// Samsung Live Transcribe
        "com.google.android.accessibility.captioning", // bazı cihazlar
        "com.android.systemui"            // sistem overlay (bazı OEM)
    ));

    // Son gönderilen metin (tekrar gönderimi önle)
    private String lastSentText = "";
    private long lastSentTime = 0;
    private static final long DEBOUNCE_MS = 200; // 300ms → 200ms: daha duyarlı

    // Module referansı (statik — Service ve Module farklı lifecycle'da)
    private static LiveCaptionModule moduleRef;

    public static void setModule(LiveCaptionModule module) {
        moduleRef = module;
    }

    @Override
    public void onServiceConnected() {
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();

        // Tüm text değişim event tiplerini dinle
        info.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                | AccessibilityEvent.TYPE_ANNOUNCEMENT
                | AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED;

        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;

        // FLAG_INCLUDE_NOT_IMPORTANT_VIEWS: sistem overlay'lerini de dahil et
        // FLAG_RETRIEVE_INTERACTIVE_WINDOWS: tüm window'lara erişim
        // FLAG_REPORT_VIEW_IDS: view resource ID'lerini al (caption tespiti için)
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
                | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;

        info.notificationTimeout = 50; // 100ms → 50ms: daha hızlı tepki

        // packageNames = null → TÜM paketleri dinle (filtre yok)
        // Önceki sorun: sadece com.google.android.as filtresi TECNO'da çalışmıyordu
        info.packageNames = null;

        setServiceInfo(info);
        Log.i(TAG, "Live Caption Service bağlandı — tüm paketler dinleniyor");
        if (moduleRef != null) moduleRef.onServiceConnected();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";

        // Kendi uygulamamızı atla (sonsuz döngü önlemi)
        if (pkg.equals("com.videotranslatorapp")) return;

        // Strateji 1: Bilinen Live Caption paketi → direkt metin çek
        boolean isKnownCaptionPkg = CAPTION_PACKAGES.contains(pkg);

        // Strateji 2: Caption içermeyen paketlerde sadece "caption" view ID'sine bak
        String text = null;
        if (isKnownCaptionPkg) {
            text = extractLiveCaptionText(event);
        } else {
            // Diğer paketlerden sadece caption node varsa al
            text = extractCaptionNodeOnly(event);
        }

        if (text == null || text.length() < 2) return;
        if (text.equals(lastSentText)) return;

        // Debounce: çok hızlı değişimlerde son durumu bekle
        long now = System.currentTimeMillis();
        if (now - lastSentTime < DEBOUNCE_MS) {
            // Debounce süresindeyiz ama farklı metin — güncelle
            lastSentText = text;
            return;
        }

        lastSentText = text;
        lastSentTime = now;

        Log.d(TAG, "Caption [" + pkg + "]: " + text.substring(0, Math.min(text.length(), 60)));
        if (moduleRef != null) {
            moduleRef.onCaptionText(text);
        }
    }

    /**
     * Bilinen Live Caption paketleri için: tüm node ağacını tara
     */
    private String extractLiveCaptionText(AccessibilityEvent event) {
        // Yöntem 1: Event'in doğrudan metin içeriği
        String eventText = extractEventText(event);

        // Yöntem 2: AccessibilityNodeInfo ağacından metin çek
        AccessibilityNodeInfo rootNode = event.getSource();
        if (rootNode == null) {
            return (eventText != null && eventText.length() > 1) ? eventText : null;
        }

        String nodeText = extractTextFromNode(rootNode, false);
        rootNode.recycle();

        if (nodeText != null && !nodeText.isEmpty()) return nodeText;
        return (eventText != null && eventText.length() > 1) ? eventText : null;
    }

    /**
     * Bilinmeyen paketler için: SADECE "caption" view ID'si olan node'ları al
     */
    private String extractCaptionNodeOnly(AccessibilityEvent event) {
        AccessibilityNodeInfo rootNode = event.getSource();
        if (rootNode == null) return null;
        String result = extractTextFromNode(rootNode, true); // captionOnly = true
        rootNode.recycle();
        return result;
    }

    private String extractEventText(AccessibilityEvent event) {
        List<CharSequence> textList = event.getText();
        if (textList == null || textList.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (CharSequence cs : textList) {
            if (cs != null) sb.append(cs);
        }
        String result = sb.toString().trim();
        return result.isEmpty() ? null : result;
    }

    /**
     * Node ağacını tara
     * @param captionOnly true = sadece view ID'de "caption" geçen node'lar
     */
    private String extractTextFromNode(AccessibilityNodeInfo node, boolean captionOnly) {
        if (node == null) return null;

        String viewId = node.getViewIdResourceName();
        boolean isCaptionNode = viewId != null && viewId.toLowerCase().contains("caption");

        if (!captionOnly || isCaptionNode) {
            CharSequence text = node.getText();
            if (text != null && text.length() > 1) return text.toString().trim();

            CharSequence desc = node.getContentDescription();
            if (desc != null && desc.length() > 1) return desc.toString().trim();
        }

        // Alt node'ları tara
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                String result = extractTextFromNode(child, captionOnly);
                child.recycle();
                if (result != null && !result.isEmpty()) return result;
            }
        }
        return null;
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Live Caption Service kesildi");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "Live Caption Service durduruldu");
        if (moduleRef != null) moduleRef.onServiceDisconnected();
    }
}
