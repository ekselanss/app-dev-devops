/**
 * TranslatorScreen
 *
 * İki mod desteklenir:
 *  1. Live Caption modu (Android)  — AccessibilityService metin okur → /api/translate
 *  2. Speech modu       (iOS)      — SFSpeechRecognizer               → /api/translate
 *  3. Mikrofon modu     (fallback) — AudioRecord → WebSocket → Whisper
 *
 * Mod önceliği: captionBridge.isAvailable() → evet = Caption/Speech, hayır = Mikrofon
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  NativeModules,
  DeviceEventEmitter,
  AppState,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { wsService, WSMessage, translateTextOnly } from '../services/WebSocketService';
import { captionBridge, CaptionMode } from '../services/CaptionBridgeService';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { TranslationOverlay } from '../components/TranslationOverlay';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
import { requestMicrophonePermission } from '../utils/permissions';
import { useTranslationHistory } from '../hooks/useTranslationHistory';
import { HistoryScreen } from './HistoryScreen';

const OverlayNative = NativeModules.OverlayService;
const ForegroundService = NativeModules.ForegroundService;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface TranslationState {
  translated: string;
  original: string;
  detectedLanguage: string;
  confidence: number;
}

export function TranslatorScreen() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [translation, setTranslation] = useState<TranslationState>({
    translated: '',
    original: '',
    detectedLanguage: '',
    confidence: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [overlayPermission, setOverlayPermission] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState(false);
  const [captionMode, setCaptionMode] = useState<CaptionMode>('unavailable');
  const [accessibilityEnabled, setAccessibilityEnabled] = useState<boolean>(true);

  const { history, addEntry, deleteEntry, clearAll } = useTranslationHistory();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setCaptionMode(captionBridge.getMode());
  }, []);

  // Overlay izni kontrol
  useEffect(() => {
    const checkPerm = async () => {
      if (OverlayNative) {
        const granted: boolean = await OverlayNative.hasPermission();
        setOverlayPermission(granted);
      }
    };
    checkPerm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPerm();
        if (captionMode === 'live_caption') {
          captionBridge.isAccessibilityEnabled().then(setAccessibilityEnabled);
        }
      }
    });
    return () => sub.remove();
  }, [captionMode]);

  // Bildirim / Quick Settings tile "Durdur"
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('onNotificationStop', () => handleStop());
    const sub2 = DeviceEventEmitter.addListener('onTileStop', () => handleStop());
    return () => { sub1.remove(); sub2.remove(); };
  }, [isActive]);

  // ── Caption / Speech → REST çeviri ───────────────────────────────────

  const handleCaptionText = useCallback(async (text: string) => {
    setIsProcessing(true);
    const result = await translateTextOnly(text, 'auto');
    setIsProcessing(false);

    if (!result) return;

    const state: TranslationState = {
      translated: result.translated,
      original: text,
      detectedLanguage: 'auto',
      confidence: 1,
    };
    setTranslation(state);

    if (OverlayNative) OverlayNative.updateText(text, result.translated);
    if (ForegroundService) ForegroundService.updateNotification(result.translated.slice(0, 60));

    addEntry({
      original: text,
      translated: result.translated,
      detectedLanguage: 'auto',
    });
  }, []);

  // ── WebSocket (Mikrofon modu) mesaj handler ───────────────────────────

  const handleWSMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'translation':
        setIsProcessing(false);
        setTranslation({
          translated: message.translated ?? '',
          original: message.original ?? '',
          detectedLanguage: message.detected_language ?? '',
          confidence: message.confidence ?? 0,
        });
        if (OverlayNative && message.translated) {
          OverlayNative.updateText(message.original ?? '', message.translated);
        }
        if (ForegroundService && message.translated) {
          ForegroundService.updateNotification(message.translated.slice(0, 60));
        }
        addEntry({
          original: message.original ?? '',
          translated: message.translated ?? '',
          detectedLanguage: message.detected_language ?? '',
        });
        break;
      case 'processing':
        setIsProcessing(true);
        if (ForegroundService) ForegroundService.updateNotification('Çevriliyor...');
        break;
      case 'empty':
        setIsProcessing(false);
        break;
      case 'error':
        setIsProcessing(false);
        console.error('Sunucu hatası:', message.message);
        break;
    }
  }, []);

  const { startRecording, stopRecording, isRecording } = useAudioRecorder({
    onChunkReady: (base64Audio) => wsService.sendAudioChunk(base64Audio),
    onError: (error) => console.error('Kayıt hatası:', error),
  });

  // ── Durdur ────────────────────────────────────────────────────────────

  const handleStop = useCallback(async () => {
    setIsActive(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);

    if (captionBridge.isAvailable()) {
      await captionBridge.stop();
    } else {
      await stopRecording();
      wsService.disconnect();
    }

    setIsProcessing(false);
    if (OverlayNative) OverlayNative.hideOverlay();
    if (ForegroundService) {
      ForegroundService.stopService();
      ForegroundService.setTileActive(false);
    }
  }, [stopRecording]);

  // ── Başlat ────────────────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    if (isActive) {
      await handleStop();
      return;
    }

    const useCaptionMode = captionBridge.isAvailable();

    // Overlay izni kontrolü (Android)
    if (OverlayNative && !overlayPermission) {
      OverlayNative.requestPermission();
      return;
    }

    if (useCaptionMode && captionMode === 'live_caption') {
      // Accessibility Service açık mı?
      const enabled = await captionBridge.isAccessibilityEnabled();
      setAccessibilityEnabled(enabled);
      if (!enabled) {
        Alert.alert(
          'Erişilebilirlik Servisi Gerekli',
          'Live Caption Accessibility Service\'i etkinleştirmeniz gerekiyor.',
          [
            { text: 'Ayarlara Git', onPress: () => captionBridge.openSettings() },
            { text: 'İptal', style: 'cancel' },
          ],
        );
        return;
      }
    } else if (!useCaptionMode) {
      // Mikrofon izni gerekli
      const hasMic = await requestMicrophonePermission();
      if (!hasMic) return;
    }

    setIsActive(true);

    if (ForegroundService) {
      ForegroundService.startService('Dinleniyor...');
      ForegroundService.setTileActive(true);
    }
    if (OverlayNative) OverlayNative.showOverlay();

    if (useCaptionMode) {
      // Caption / Speech modu
      const started = await captionBridge.start(
        handleCaptionText,
        (status) => {
          if (status === 'connected' || status === 'listening') setConnectionStatus('connected');
          else if (status === 'needs_permission') setConnectionStatus('error');
          else if (status === 'stopped') setConnectionStatus('disconnected');
        },
      );
      if (!started) {
        setIsActive(false);
        return;
      }
      setConnectionStatus('connected');
    } else {
      // Mikrofon + WebSocket modu
      wsService.connect(handleWSMessage, (status) => setConnectionStatus(status));
      await startRecording();
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [isActive, overlayPermission, captionMode, startRecording, handleStop, handleWSMessage, handleCaptionText]);

  // Cleanup
  useEffect(() => {
    return () => {
      captionBridge.stop();
      wsService.disconnect();
      if (OverlayNative) OverlayNative.hideOverlay();
      if (ForegroundService) ForegroundService.stopService();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  if (showHistory) {
    return (
      <HistoryScreen
        history={history}
        onDelete={deleteEntry}
        onClearAll={clearAll}
        onClose={() => setShowHistory(false)}
      />
    );
  }

  const modeLabel =
    captionMode === 'live_caption'
      ? '📺 Live Caption'
      : captionMode === 'speech'
      ? '🎙 Speech'
      : '🎤 Mikrofon';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" translucent={false} />

      <View style={styles.container}>

        {/* ── Üst Bar ── */}
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>🎬 VideoÇeviri</Text>
          {isActive && <ConnectionStatusBar status={connectionStatus} />}
          <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>
              📋{history.length > 0 ? ` ${history.length}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Mod Etiketi ── */}
        <View style={styles.modeBadgeRow}>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{modeLabel}</Text>
          </View>
        </View>

        {/* ── Orta Alan ── */}
        <View style={styles.centerArea}>
          {!isActive ? (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionIcon}>📱</Text>
              <Text style={styles.instructionTitle}>Nasıl Kullanılır?</Text>
              {captionMode === 'live_caption' ? (
                <Text style={styles.instructionText}>
                  1. Butona bas ve dinlemeyi başlat{'\n'}
                  2. YouTube / TikTok / Instagram'da{'\n'}
                  {'   '}video aç, ses açık olsun{'\n'}
                  3. Türkçe çeviri aşağıda görünür{'\n'}
                  4. Mikrofon YOK — sistem sesi okunur
                </Text>
              ) : captionMode === 'speech' ? (
                <Text style={styles.instructionText}>
                  1. Butona bas ve izin ver{'\n'}
                  2. Konuşmaya başla{'\n'}
                  3. Türkçe çeviri anlık görünür
                </Text>
              ) : (
                <Text style={styles.instructionText}>
                  1. Butona bas ve dinlemeyi başlat{'\n'}
                  2. YouTube / TikTok / Instagram'da{'\n'}
                  {'   '}video aç, hoparlörden çal{'\n'}
                  3. Türkçe altyazı aşağıda görünür
                </Text>
              )}
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  {captionMode === 'live_caption'
                    ? '💡 Kulaklık takma gerek yok\n💡 YouTube durmaz, kalite bozulmaz'
                    : '💡 Sessiz ortamda daha doğru çeviri\n💡 Kulaklık takma — hoparlörden çal'}
                </Text>
              </View>
              {captionMode === 'live_caption' && !accessibilityEnabled && (
                <TouchableOpacity
                  style={styles.accessibilityBtn}
                  onPress={() => captionBridge.openSettings()}
                >
                  <Text style={styles.accessibilityBtnText}>
                    ⚠️  Erişilebilirlik Servisi Kapalı — Aç
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.statusArea}>
              <Text style={styles.statusEmoji}>
                {isProcessing ? '⚙️' : isActive ? '👂' : '⏸'}
              </Text>
              <Text style={styles.statusText}>
                {isProcessing
                  ? 'Çevriliyor...'
                  : captionMode === 'live_caption'
                  ? 'Ekran metni okunuyor...'
                  : captionMode === 'speech'
                  ? 'Konuşma dinleniyor...'
                  : 'Mikrofon dinleniyor...'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Overlay İzin Uyarısı ── */}
        {!overlayPermission && OverlayNative && (
          <TouchableOpacity
            style={styles.permissionBanner}
            onPress={() => OverlayNative.requestPermission()}
          >
            <Text style={styles.permissionText}>
              ⚠️  Diğer uygulamaların üzerinde göster izni gerekli — izin ver
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Mikrofon Butonu ── */}
        <View style={styles.buttonArea}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              onPress={handleToggle}
              style={[styles.micButton, isActive && styles.micButtonActive]}
              activeOpacity={0.8}
            >
              <Text style={styles.micIcon}>{isActive ? '⏹' : '▶'}</Text>
              <Text style={styles.micLabel}>
                {isActive ? 'Durdur' : 'Başlat'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── Alt Overlay: Altyazı ── */}
        {isActive && (
          <TranslationOverlay
            translated={translation.translated}
            original={translation.original}
            detectedLanguage={translation.detectedLanguage}
            confidence={translation.confidence}
            isProcessing={isProcessing}
            showOriginal={showOriginal}
            onToggleOriginal={() => setShowOriginal(v => !v)}
          />
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
  },

  // ── Üst Bar ──
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  appTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  historyBtn: {
    padding: 6,
  },
  historyBtnText: {
    fontSize: 18,
    color: '#888',
  },

  // ── Mod Etiketi ──
  modeBadgeRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  modeBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  modeBadgeText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Orta ──
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  instructionBox: {
    alignItems: 'center',
    gap: 12,
  },
  instructionIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  instructionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  instructionText: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  tipBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  tipText: {
    color: '#4CAF50',
    fontSize: 13,
    lineHeight: 20,
  },
  accessibilityBtn: {
    marginTop: 8,
    backgroundColor: '#2a1a00',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  accessibilityBtnText: {
    color: '#ff9800',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusArea: {
    alignItems: 'center',
    gap: 12,
  },
  statusEmoji: {
    fontSize: 56,
  },
  statusText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '500',
  },

  // ── Buton ──
  buttonArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1e1e1e',
    borderWidth: 3,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: '#1a2e1a',
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOpacity: 0.4,
  },
  micIcon: {
    fontSize: 32,
  },
  micLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  permissionBanner: {
    backgroundColor: '#2a1a00',
    borderTopWidth: 1,
    borderTopColor: '#ff9800',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permissionText: {
    color: '#ff9800',
    fontSize: 13,
    textAlign: 'center',
  },
});
