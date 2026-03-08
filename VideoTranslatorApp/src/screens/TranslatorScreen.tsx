/**
 * TranslatorScreen
 * Ana ekran. Kullanıcı butona basınca mikrofonu dinler,
 * ses backend'e gider, Türkçe altyazı overlay olarak gösterilir.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  AppState,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { wsService, WSMessage } from '../services/WebSocketService';
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
  const insets = useSafeAreaInsets();

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

  const { history, addEntry, deleteEntry, clearAll } = useTranslationHistory();

  const pulseAnim = React.useRef(new Animated.Value(1)).current;

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
      if (state === 'active') checkPerm();
    });
    return () => sub.remove();
  }, []);

  // Bildirim "Durdur" ve Quick Settings tile durdurma
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('onNotificationStop', () => {
      if (isActive) handleStop();
    });
    const sub2 = DeviceEventEmitter.addListener('onTileStop', () => {
      if (isActive) handleStop();
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, [isActive]);

  // WebSocket mesaj handler
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
        // Bildirimi güncelle
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
    onChunkReady: (base64Audio) => {
      wsService.sendAudioChunk(base64Audio);
    },
    onError: (error) => console.error('Kayıt hatası:', error),
  });

  const handleStop = useCallback(async () => {
    setIsActive(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    await stopRecording();
    wsService.disconnect();
    setIsProcessing(false);
    if (OverlayNative) OverlayNative.hideOverlay();
    if (ForegroundService) {
      ForegroundService.stopService();
      ForegroundService.setTileActive(false);
    }
  }, [stopRecording]);

  const handleToggle = useCallback(async () => {
    if (!isActive) {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) return;

      if (OverlayNative && !overlayPermission) {
        OverlayNative.requestPermission();
        return;
      }

      setIsActive(true);

      // Bildirim servisini başlat + tile güncelle
      if (ForegroundService) {
        ForegroundService.startService('Dinleniyor...');
        ForegroundService.setTileActive(true);
      }
      if (OverlayNative) OverlayNative.showOverlay();

      wsService.connect(handleWSMessage, (status) => {
        setConnectionStatus(status);
      });

      await startRecording();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      await handleStop();
    }
  }, [isActive, overlayPermission, startRecording, handleStop, handleWSMessage]);

  // Cleanup
  useEffect(() => {
    return () => {
      wsService.disconnect();
      if (OverlayNative) OverlayNative.hideOverlay();
      if (ForegroundService) ForegroundService.stopService();
    };
  }, []);

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" translucent={false} />

      <View style={styles.container}>

        {/* ── Üst Bar ── */}
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>🎬 VideoÇeviri</Text>
          {isActive && <ConnectionStatusBar status={connectionStatus} />}
          <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>📋{history.length > 0 ? ` ${history.length}` : ''}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Orta Alan ── */}
        <View style={styles.centerArea}>
          {!isActive ? (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionIcon}>📱</Text>
              <Text style={styles.instructionTitle}>Nasıl Kullanılır?</Text>
              <Text style={styles.instructionText}>
                1. Butona bas ve dinlemeyi başlat{'\n'}
                2. YouTube / TikTok / Instagram / X'te{'\n'}
                {'   '}video aç, sesi aç{'\n'}
                3. Türkçe altyazı aşağıda görünür
              </Text>
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  💡 Kulaklık takma — hoparlörden çal{'\n'}
                  💡 Sessiz ortamda daha doğru çeviri
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.statusArea}>
              <Text style={styles.statusEmoji}>
                {isProcessing ? '⚙️' : isRecording ? '👂' : '⏸'}
              </Text>
              <Text style={styles.statusText}>
                {isProcessing
                  ? 'Çevriliyor...'
                  : isRecording
                  ? 'Mikrofon dinleniyor...'
                  : 'Bekleniyor'}
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
              <Text style={styles.micIcon}>{isActive ? '⏹' : '🎤'}</Text>
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

  historyBtn: {
    padding: 6,
  },
  historyBtnText: {
    fontSize: 18,
    color: '#888',
  },
  projectionBtn: {
    marginTop: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  projectionBtnText: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
  },
});
