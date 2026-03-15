/**
 * TranslatorScreen
 *
 * Mod önceliği:
 *  1. Speech modu (Android SpeechRecognizer / iOS SFSpeechRecognizer)
 *     → RECORD_AUDIO izni yeterli, ekran izleme yok
 *     → Metin doğrudan /api/translate'e gider
 *  2. Mikrofon + Whisper (fallback — SpeechRecognizer yoksa)
 *     → AudioRecord → WebSocket → Whisper → çeviri
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
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { wsService, WSMessage, translateTextOnly } from '../services/WebSocketService';
import { captionBridge } from '../services/CaptionBridgeService';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { TranslationOverlay } from '../components/TranslationOverlay';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
import { requestMicrophonePermission } from '../utils/permissions';
import { useTranslationHistory } from '../hooks/useTranslationHistory';
import { HistoryScreen } from './HistoryScreen';
import { loadServerUrl, saveServerUrl, getServerUrl, loadTier, saveTier, getTier } from '../utils/serverConfig';
import { checkAndPromptUpdate } from '../services/UpdateService';

const OverlayNative = NativeModules.OverlayService;
const ForegroundService = NativeModules.ForegroundService;

const TARGET_LANGUAGES = [
  { code: 'tr', label: '🇹🇷 Türkçe' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'it', label: '🇮🇹 Italiano' },
  { code: 'pt', label: '🇵🇹 Português' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'ar', label: '🇸🇦 العربية' },
  { code: 'ja', label: '🇯🇵 日本語' },
  { code: 'ko', label: '🇰🇷 한국어' },
  { code: 'zh', label: '🇨🇳 中文' },
  { code: 'nl', label: '🇳🇱 Nederlands' },
];

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
  const [useSpeechMode] = useState(() => captionBridge.isAvailable());
  const [showSettings, setShowSettings] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('tr');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [tier, setTier] = useState<'free' | 'pro'>('free');
  const [activeModel, setActiveModel] = useState('');

  const { history, addEntry, deleteEntry, clearAll } = useTranslationHistory();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Sunucu URL'sini ve tier'ı yükle + güncelleme kontrolü
  useEffect(() => {
    loadServerUrl().then(url => {
      setServerUrl(url);
      setServerUrlInput(url);
    });
    loadTier().then(t => setTier(t));
    // Uygulama açılışında güncelleme kontrol et
    checkAndPromptUpdate();
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
    const sub = AppState.addEventListener('change', s => { if (s === 'active') checkPerm(); });
    return () => sub.remove();
  }, []);

  // Bildirim / Quick Settings "Durdur"
  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener('onNotificationStop', () => handleStop());
    const s2 = DeviceEventEmitter.addListener('onTileStop', () => handleStop());
    return () => { s1.remove(); s2.remove(); };
  }, [isActive]);

  // ── Speech modu: metin geldi → /api/translate ─────────────────────

  const handleSpeechText = useCallback(async (text: string) => {
    setIsProcessing(true);
    const result = await translateTextOnly(text, 'auto');
    setIsProcessing(false);
    if (!result) return;

    setTranslation({ translated: result.translated, original: text, detectedLanguage: 'auto', confidence: 1 });
    if (OverlayNative) OverlayNative.updateText(text, result.translated);
    if (ForegroundService) ForegroundService.updateNotification(result.translated.slice(0, 60));
    addEntry({ original: text, translated: result.translated, detectedLanguage: 'auto' });
  }, []);

  // ── Whisper modu: WebSocket mesajları ────────────────────────────

  const handleWSMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'connected':
        // Bağlantı kurulduğunda tier ve model bilgisini güncelle
        if (message.tier) setTier(message.tier as 'free' | 'pro');
        if (message.model) setActiveModel(message.model);
        break;
      case 'tier_changed':
        if (message.tier) setTier(message.tier as 'free' | 'pro');
        if (message.model) setActiveModel(message.model);
        break;
      case 'translation':
        setIsProcessing(false);
        setTranslation({
          translated: message.translated ?? '',
          original: message.original ?? '',
          detectedLanguage: message.detected_language ?? '',
          confidence: message.confidence ?? 0,
        });
        if (OverlayNative && message.translated) OverlayNative.updateTextWithLang(message.original ?? '', message.translated, message.detected_language ?? '', targetLangRef.current ?? 'tr');
        if (ForegroundService && message.translated) ForegroundService.updateNotification(message.translated.slice(0, 60));
        addEntry({ original: message.original ?? '', translated: message.translated ?? '', detectedLanguage: message.detected_language ?? '' });
        break;
      case 'processing':
        setIsProcessing(true);
        break;
      case 'empty':
      case 'error':
        setIsProcessing(false);
        break;
    }
  }, []);

  const targetLangRef = useRef(targetLanguage);
  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);

  const { startRecording, stopRecording } = useAudioRecorder({
    onChunkReady: (b64) => wsService.sendAudioChunk(b64, targetLangRef.current),
    onError: (e) => console.error('Kayıt hatası:', e),
  });

  // ── Durdur ───────────────────────────────────────────────────────

  const handleStop = useCallback(async () => {
    setIsActive(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    if (useSpeechMode) {
      await captionBridge.stop();
    } else {
      await stopRecording();
      wsService.disconnect();
    }
    setIsProcessing(false);
    if (OverlayNative) OverlayNative.hideOverlay();
    if (ForegroundService) { ForegroundService.stopService(); ForegroundService.setTileActive(false); }
  }, [useSpeechMode, stopRecording]);

  // ── Başlat ───────────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    if (isActive) { await handleStop(); return; }

    const hasMic = await requestMicrophonePermission();
    if (!hasMic) return;

    if (OverlayNative && !overlayPermission) { OverlayNative.requestPermission(); return; }

    setIsActive(true);
    if (ForegroundService) { ForegroundService.startService('Dinleniyor...'); ForegroundService.setTileActive(true); }
    if (OverlayNative) OverlayNative.showOverlay();

    if (useSpeechMode) {
      const started = await captionBridge.start(
        handleSpeechText,
        (status) => {
          if (status === 'listening') setConnectionStatus('connected');
          else if (status === 'stopped') setConnectionStatus('disconnected');
          else if (status === 'error') setConnectionStatus('error');
        },
      );
      if (!started) { setIsActive(false); return; }
      setConnectionStatus('connected');
    } else {
      wsService.connect(handleWSMessage, setConnectionStatus);
      await startRecording();
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [isActive, overlayPermission, useSpeechMode, startRecording, handleStop, handleWSMessage, handleSpeechText]);

  useEffect(() => {
    return () => {
      captionBridge.stop();
      wsService.disconnect();
      if (OverlayNative) OverlayNative.hideOverlay();
      if (ForegroundService) ForegroundService.stopService();
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  if (showHistory) {
    return <HistoryScreen history={history} onDelete={deleteEntry} onClearAll={clearAll} onClose={() => setShowHistory(false)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" translucent={false} />
      <View style={styles.container}>

        {/* Üst Bar */}
        <View style={styles.topBar}>
          <Text style={styles.appTitle}>🎬 VideoÇeviri</Text>
          {isActive && <ConnectionStatusBar status={connectionStatus} tier={tier} model={activeModel} />}
          <View style={styles.topBarRight}>
            <TouchableOpacity onPress={() => { setServerUrlInput(getServerUrl()); setShowSettings(true); }} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn}>
              <Text style={styles.historyBtnText}>📋{history.length > 0 ? ` ${history.length}` : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tier + Mod etiketi + Dil seçici */}
        <View style={styles.modeBadgeRow}>
          <TouchableOpacity
            style={[styles.tierBadge, tier === 'pro' && styles.tierBadgePro]}
            onPress={async () => {
              const newTier = tier === 'free' ? 'pro' : 'free';
              await saveTier(newTier);
              setTier(newTier);
              if (isActive && !useSpeechMode) {
                // Aktif bağlantı varsa otomatik yeniden bağlan
                wsService.disconnect();
                setActiveModel('');
                setTimeout(() => {
                  wsService.connect(handleWSMessage, setConnectionStatus);
                }, 500);
              }
            }}>
            <Text style={[styles.tierBadgeText, tier === 'pro' && styles.tierBadgeTextPro]}>
              {tier === 'pro' ? '⭐ PRO' : '🆓 FREE'}
            </Text>
          </TouchableOpacity>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>
              {useSpeechMode ? '🎙 Konuşma' : activeModel ? `🎤 ${activeModel}` : '🎤 Whisper AI'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.langBadge}
            onPress={() => setShowLanguagePicker(true)}>
            <Text style={styles.langBadgeText}>
              → {TARGET_LANGUAGES.find(l => l.code === targetLanguage)?.label || targetLanguage}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Orta Alan */}
        <View style={styles.centerArea}>
          {!isActive ? (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionIcon}>📱</Text>
              <Text style={styles.instructionTitle}>Nasıl Kullanılır?</Text>
              <Text style={styles.instructionText}>
                1. Butona bas{'\n'}
                2. YouTube / TikTok / TRT World aç{'\n'}
                3. Sesi hoparlörden çal{'\n'}
                4. Türkçe çeviri anlık görünür
              </Text>
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  💡 Sessiz ortamda daha doğru çeviri{'\n'}
                  💡 Hoparlörü telefona yakın tut
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.statusArea}>
              <Text style={styles.statusEmoji}>{isProcessing ? '⚙️' : '👂'}</Text>
              <Text style={styles.statusText}>
                {isProcessing ? 'Çevriliyor...' : 'Dinleniyor...'}
              </Text>
            </View>
          )}
        </View>

        {/* Overlay izin uyarısı */}
        {!overlayPermission && OverlayNative && (
          <TouchableOpacity style={styles.permissionBanner} onPress={() => OverlayNative.requestPermission()}>
            <Text style={styles.permissionText}>⚠️  Diğer uygulamaların üzerinde göster izni gerekli — izin ver</Text>
          </TouchableOpacity>
        )}

        {/* Ana Buton */}
        <View style={styles.buttonArea}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              onPress={handleToggle}
              style={[styles.micButton, isActive && styles.micButtonActive]}
              activeOpacity={0.8}
            >
              <Text style={styles.micIcon}>{isActive ? '⏹' : '▶'}</Text>
              <Text style={styles.micLabel}>{isActive ? 'Durdur' : 'Başlat'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Çeviri Overlay */}
        {isActive && (
          <TranslationOverlay
            translated={translation.translated}
            original={translation.original}
            detectedLanguage={translation.detectedLanguage}
            targetLanguage={targetLanguage}
            confidence={translation.confidence}
            isProcessing={isProcessing}
            showOriginal={showOriginal}
            onToggleOriginal={() => setShowOriginal(v => !v)}
          />
        )}

        {/* Dil Seçici Modalı */}
        <Modal visible={showLanguagePicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Çeviri Dili</Text>
              <View style={styles.langGrid}>
                {TARGET_LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langOption,
                      targetLanguage === lang.code && styles.langOptionActive,
                    ]}
                    onPress={() => {
                      setTargetLanguage(lang.code);
                      wsService.setTargetLanguage(lang.code);
                      setShowLanguagePicker(false);
                    }}>
                    <Text style={[
                      styles.langOptionText,
                      targetLanguage === lang.code && styles.langOptionTextActive,
                    ]}>{lang.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowLanguagePicker(false)}>
                <Text style={styles.modalBtnText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Sunucu Ayarları Modalı */}
        <Modal visible={showSettings} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Sunucu Ayarları</Text>
              <Text style={styles.modalLabel}>Sunucu Adresi:</Text>
              <TextInput
                style={styles.modalInput}
                value={serverUrlInput}
                onChangeText={setServerUrlInput}
                placeholder="https://abc123.ngrok-free.app"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.modalHint}>
                USB: http://localhost:8000{'\n'}
                WiFi: http://192.168.x.x:8000{'\n'}
                Internet: https://xxx.ngrok-free.app
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowSettings(false)}>
                  <Text style={styles.modalBtnText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnSave}
                  onPress={async () => {
                    const url = serverUrlInput.trim();
                    if (!url) return;
                    await saveServerUrl(url);
                    setServerUrl(url);
                    setShowSettings(false);
                    Alert.alert('Kaydedildi', `Sunucu: ${url}\n\nBağlantıyı yeniden başlatın.`);
                  }}>
                  <Text style={styles.modalBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  appTitle: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingsBtn: { padding: 6 },
  settingsBtnText: { fontSize: 18 },
  historyBtn: { padding: 6 },
  historyBtnText: { fontSize: 18, color: '#888' },
  modeBadgeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  tierBadge: { backgroundColor: '#1a1a2e', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#555' },
  tierBadgePro: { backgroundColor: '#2e2a1a', borderColor: '#FFD700' },
  tierBadgeText: { color: '#888', fontSize: 11, fontWeight: '700' },
  tierBadgeTextPro: { color: '#FFD700' },
  modeBadge: { backgroundColor: '#1a1a2e', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#333' },
  modeBadgeText: { color: '#888', fontSize: 11, fontWeight: '600' },
  langBadge: { backgroundColor: '#1a2e1a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: '#4CAF50' },
  langBadgeText: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent: 'center' },
  langOption: { backgroundColor: '#0a0a0a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  langOptionActive: { borderColor: '#4CAF50', backgroundColor: '#1a2e1a' },
  langOptionText: { color: '#888', fontSize: 13 },
  langOptionTextActive: { color: '#4CAF50', fontWeight: '600' },
  centerArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  instructionBox: { alignItems: 'center', gap: 12 },
  instructionIcon: { fontSize: 48, marginBottom: 4 },
  instructionTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  instructionText: { color: '#aaa', fontSize: 15, lineHeight: 24, textAlign: 'center' },
  tipBox: { backgroundColor: '#1a1a2e', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  tipText: { color: '#4CAF50', fontSize: 13, lineHeight: 20 },
  statusArea: { alignItems: 'center', gap: 12 },
  statusEmoji: { fontSize: 56 },
  statusText: { color: '#aaa', fontSize: 16, fontWeight: '500' },
  buttonArea: { alignItems: 'center', paddingVertical: 32 },
  micButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1e1e1e', borderWidth: 3, borderColor: '#333', alignItems: 'center', justifyContent: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  micButtonActive: { backgroundColor: '#1a2e1a', borderColor: '#4CAF50', shadowColor: '#4CAF50', shadowOpacity: 0.4 },
  micIcon: { fontSize: 32 },
  micLabel: { color: '#888', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  permissionBanner: { backgroundColor: '#2a1a00', borderTopWidth: 1, borderTopColor: '#ff9800', paddingHorizontal: 16, paddingVertical: 10 },
  permissionText: { color: '#ff9800', fontSize: 13, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 24, width: '85%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modalLabel: { color: '#aaa', fontSize: 13, marginBottom: 6 },
  modalInput: { backgroundColor: '#0a0a0a', borderRadius: 8, borderWidth: 1, borderColor: '#333', color: '#fff', fontSize: 14, padding: 12, marginBottom: 8 },
  modalHint: { color: '#555', fontSize: 11, lineHeight: 18, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: { flex: 1, backgroundColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center' },
  modalBtnSave: { flex: 1, backgroundColor: '#4CAF50', borderRadius: 8, padding: 12, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
