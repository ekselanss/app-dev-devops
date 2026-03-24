import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import AudioRecord from 'react-native-audio-record';
import { getWsUrls } from '../utils/serverConfig';
import { apiService } from '../services/ApiService';

const COLORS = {
  bg: '#080810',
  accent: '#6c63ff',
  accent2: '#ff6b6b',
  accent3: '#43e97b',
  text: '#f0f0f8',
  muted: '#6b6b8a',
};

export interface LiveTranslationScreenProps {
  navigate: (screen: string) => void;
}

interface TranscriptLine {
  original: string;
  translated: string;
  language: string;
}

const WAVE_COUNT = 20;
const WAVE_HEIGHTS = [0.30, 0.60, 0.90, 0.50, 0.80, 0.40, 0.70, 0.55, 0.85, 0.35,
                     0.65, 0.45, 0.75, 0.55, 0.30, 0.90, 0.60, 0.40, 0.70, 0.50];

const modelOptions = [
  { key: 'fast', name: 'Base', cost: '1 🪙/sn' },
  { key: 'translate', name: 'Small', cost: '2 🪙/sn' },
  { key: 'pro', name: 'Pro', cost: '4 🪙/sn' },
];

export function LiveTranslationScreen({ navigate }: LiveTranslationScreenProps) {
  const [activeModel, setActiveModel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('Başlatmak için ▶ düğmesine bas');
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [currentOriginal, setCurrentOriginal] = useState('');
  const [currentTranslated, setCurrentTranslated] = useState('');
  const [detectedLang, setDetectedLang] = useState('EN');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionStartRef = useRef<number>(0);
  const tokensRef = useRef<number>(0);
  const lastSendRef = useRef<number>(0);
  const scrollRef = useRef<ScrollView>(null);

  // Animations
  const recBlink = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef(WAVE_HEIGHTS.map(() => new Animated.Value(0.3))).current;
  const cursorBlink = useRef(new Animated.Value(1)).current;
  const stopPulse = useRef(new Animated.Value(0)).current;
  const waveLoopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    // Cursor blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorBlink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorBlink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

    // Stop button pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(stopPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(stopPulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    return () => {
      stopRecording();
    };
  }, []);

  const startWaveAnimation = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 300 + (i % 5) * 80, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.2, duration: 300 + (i % 5) * 80, useNativeDriver: true }),
        ])
      );
      waveLoopsRef.current[i] = loop;
      loop.start();
    });
    Animated.loop(
      Animated.sequence([
        Animated.timing(recBlink, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(recBlink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [waveAnims, recBlink]);

  const stopWaveAnimation = useCallback(() => {
    waveLoopsRef.current.forEach(l => l?.stop());
    waveAnims.forEach(anim => {
      Animated.timing(anim, { toValue: 0.3, duration: 200, useNativeDriver: true }).start();
    });
    recBlink.setValue(0.3);
  }, [waveAnims, recBlink]);

  async function requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const perm = PERMISSIONS.ANDROID.RECORD_AUDIO;
    const current = await check(perm);
    if (current === RESULTS.GRANTED) return true;
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  }

  async function startRecording() {
    if (isRecording || isConnecting) return;

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert('İzin Gerekli', 'Çeviri için mikrofon iznine ihtiyaç var.');
      return;
    }

    setIsConnecting(true);
    setStatus('connecting');
    setStatusMsg('Sunucuya bağlanıyor...');

    const urls = getWsUrls();
    const modelKey = modelOptions[activeModel].key;
    const wsUrl = `${urls[modelKey as keyof typeof urls]}/${Date.now()}`;
    const sendTimeRef = Date.now();

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsRecording(true);
        setStatus('live');
        setStatusMsg('Canlı — konuşmayı dinliyor');
        sessionStartRef.current = Date.now();
        startWaveAnimation();

        // Init audio recording
        AudioRecord.init({
          sampleRate: 16000,
          channels: 1,
          bitsPerSample: 16,
          audioSource: 6, // MIC
          wavFile: '',
        });

        AudioRecord.on('data', (data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            lastSendRef.current = Date.now();
            ws.send(JSON.stringify({
              type: 'audio_chunk',
              data: data,
              target_language: 'tr',
            }));
          }
        });

        AudioRecord.start();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'translation') {
            const lag = Date.now() - lastSendRef.current;
            setLatencyMs(lag);

            const lang = (msg.detected_language || 'en').toUpperCase();
            setDetectedLang(lang);
            setCurrentOriginal(msg.original || '');
            setCurrentTranslated(msg.translated || '');

            const tokens = Math.ceil((msg.original || '').split(' ').length * 0.5);
            tokensRef.current += tokens;
            setTokensUsed(t => t + tokens);

            setTranscripts(prev => {
              const next = [...prev, {
                original: msg.original,
                translated: msg.translated,
                language: lang,
              }];
              return next.slice(-10); // son 10 satır
            });

            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          } else if (msg.type === 'connected') {
            setStatusMsg(`Bağlandı — Model: ${msg.model}`);
          } else if (msg.type === 'error') {
            setStatus('error');
            setStatusMsg(`Hata: ${msg.message}`);
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        setStatus('error');
        setStatusMsg('Bağlantı hatası — sunucu erişilemiyor');
        setIsConnecting(false);
        setIsRecording(false);
        stopWaveAnimation();
      };

      ws.onclose = () => {
        setIsRecording(false);
        stopWaveAnimation();
        if (status === 'live') {
          setStatus('idle');
          setStatusMsg('Bağlantı kesildi');
        }
      };
    } catch (e) {
      setStatus('error');
      setStatusMsg('WebSocket başlatılamadı');
      setIsConnecting(false);
    }
  }

  async function stopRecording() {
    if (!isRecording && !isConnecting) return;

    try { AudioRecord.stop(); } catch (_) {}
    stopWaveAnimation();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRecording(false);
    setIsConnecting(false);
    setStatus('idle');
    setStatusMsg('Durduruldu');
  }

  async function handleStop() {
    await stopRecording();
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const finalTokens = tokensRef.current > 0 ? tokensRef.current : Math.max(1, durationSeconds);
    apiService.createSession({
      title: 'Canlı Çeviri Oturumu',
      source_lang: detectedLang.toLowerCase() || 'en',
      target_lang: 'tr',
      duration_seconds: durationSeconds,
      tokens_used: finalTokens,
      icon: '🎤',
    });
    apiService.deductTokens(finalTokens, 'live_translation');
    navigate('Home');
  }

  const stopShadowOpacity = stopPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.8] });

  const latencyColor = latencyMs === null
    ? COLORS.accent3
    : latencyMs < 1500 ? COLORS.accent3
    : latencyMs < 3000 ? '#f4c430'
    : COLORS.accent2;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>
          {status === 'live' ? '● REC' : status === 'connecting' ? '○ ...' : '○ HAZIR'}
        </Text>
        <View style={[styles.recBadge, status === 'live' && styles.recBadgeLive]}>
          {status === 'live' && <Animated.View style={[styles.recDot, { opacity: recBlink }]} />}
          <Text style={[styles.recText, status === 'live' && styles.recTextLive]}>
            {status === 'live' ? 'CANLI' : status === 'connecting' ? 'BAĞLANIYOR' : status === 'error' ? 'HATA' : 'HAZIR'}
          </Text>
        </View>
        <Text style={styles.statusBattery}>🪙 {tokensUsed}</Text>
      </View>

      {/* Video/Audio area */}
      <View style={styles.videoArea}>
        <View style={styles.videoBg} />
        <View style={styles.videoScene}>
          {status === 'live' ? (
            <View style={styles.livePulse}>
              <Text style={styles.livePulseIcon}>🎙</Text>
            </View>
          ) : (
            <View style={styles.videoPerson} />
          )}
        </View>
        <View style={styles.videoOverlay} />

        {/* Lang indicator */}
        <View style={styles.langIndicator}>
          <Text style={styles.langIndicatorText}>🌐 {detectedLang}</Text>
          <Text style={styles.langArrow}> → </Text>
          <Text style={styles.langIndicatorText}>🇹🇷 TR</Text>
        </View>

        {/* Subtitle on video */}
        {currentTranslated !== '' && (
          <View style={styles.subtitleOnVideo}>
            {currentOriginal !== '' && (
              <Text style={styles.originalText} numberOfLines={2}>"{currentOriginal}"</Text>
            )}
            <View style={styles.translatedBox}>
              <Text style={styles.translatedText} numberOfLines={3}>{currentTranslated}</Text>
            </View>
          </View>
        )}

        {/* Status overlay when idle */}
        {status !== 'live' && (
          <View style={styles.idleOverlay}>
            <Text style={styles.idleText}>{statusMsg}</Text>
          </View>
        )}

        {/* Waveform */}
        <View style={styles.waveform}>
          {waveAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[styles.waveBar, { transform: [{ scaleY: anim }] }]}
            />
          ))}
        </View>
      </View>

      {/* Main Panel */}
      <ScrollView
        ref={scrollRef}
        style={styles.mainPanel}
        showsVerticalScrollIndicator={false}
      >
        {/* Transcript */}
        <View style={styles.transcriptArea}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptLabel}>Transkript</Text>
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>{modelOptions[activeModel].name}</Text>
            </View>
          </View>

          {transcripts.length === 0 ? (
            <Text style={styles.emptyTranscript}>
              {status === 'live' ? 'Ses bekleniyor...' : 'Çeviri başladığında burada görünecek'}
            </Text>
          ) : (
            transcripts.map((line, i) => (
              <View key={i} style={styles.transcriptLine}>
                <Text style={styles.trOriginal}>"{line.original}"</Text>
                <Text style={[styles.trTurkish, i === transcripts.length - 1 && styles.trCurrent]}>
                  {line.translated}
                  {i === transcripts.length - 1 && (
                    <Animated.Text style={[styles.typingCursor, { opacity: cursorBlink }]}>|</Animated.Text>
                  )}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: latencyColor }]}>
              {latencyMs === null ? '--' : `${(latencyMs / 1000).toFixed(1)}s`}
            </Text>
            <Text style={styles.statLabel}>Gecikme</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.accent }]}>
              {transcripts.length > 0 ? '90%+' : '--'}
            </Text>
            <Text style={styles.statLabel}>Doğruluk</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.accent2 }]}>-{tokensUsed} 🪙</Text>
            <Text style={styles.statLabel}>Harcanan</Text>
          </View>
        </View>

        {/* Model Selector */}
        <View style={styles.modelSelector}>
          {modelOptions.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.modelBtn, activeModel === i && styles.modelBtnActive]}
              onPress={() => {
                if (!isRecording) setActiveModel(i);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modelBtnName}>{m.name}</Text>
              <Text style={[styles.modelBtnCost, activeModel === i && styles.modelBtnCostActive]}>{m.cost}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {/* Start/Stop button */}
          {!isRecording && !isConnecting ? (
            <TouchableOpacity style={styles.startBtn} onPress={startRecording} activeOpacity={0.85}>
              <Text style={styles.startBtnIcon}>▶</Text>
              <Text style={styles.startBtnLabel}>Başlat</Text>
            </TouchableOpacity>
          ) : (
            <Animated.View style={[styles.stopBtn, { shadowOpacity: stopShadowOpacity }]}>
              <TouchableOpacity onPress={handleStop} activeOpacity={0.85} style={styles.stopBtnInner}>
                <Text style={styles.stopBtnIcon}>⏹</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* Status message */}
        <Text style={[
          styles.statusMsgText,
          status === 'error' && styles.statusMsgError,
          status === 'live' && styles.statusMsgLive,
        ]}>
          {statusMsg}
        </Text>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 24, paddingVertical: 8,
  },
  statusTime: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  statusBattery: { fontSize: 11, color: COLORS.text },
  recBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(107,107,138,0.2)',
    borderWidth: 1, borderColor: 'rgba(107,107,138,0.4)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2,
  },
  recBadgeLive: {
    backgroundColor: 'rgba(255,107,107,0.2)',
    borderColor: 'rgba(255,107,107,0.4)',
  },
  recDot: { width: 6, height: 6, backgroundColor: COLORS.accent2, borderRadius: 3 },
  recText: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  recTextLive: { color: COLORS.accent2 },
  videoArea: {
    width: '100%', height: 220, backgroundColor: '#000',
    position: 'relative', overflow: 'hidden',
  },
  videoBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#1a0a2e' },
  videoScene: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
  },
  videoPerson: {
    width: 80, height: 100, backgroundColor: 'rgba(244,162,97,0.4)',
    borderRadius: 40, marginTop: 30,
  },
  livePulse: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(108,99,255,0.2)',
    borderWidth: 2, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  livePulseIcon: { fontSize: 36 },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,16,0.3)' },
  langIndicator: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  langIndicatorText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  langArrow: { color: COLORS.accent, fontSize: 12 },
  subtitleOnVideo: {
    position: 'absolute', bottom: 50, left: 12, right: 12, alignItems: 'center',
  },
  originalText: {
    fontSize: 11, color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic', marginBottom: 4, textAlign: 'center',
  },
  translatedBox: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1, borderColor: 'rgba(108,99,255,0.4)',
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6,
  },
  translatedText: { fontSize: 15, color: '#fff', fontWeight: '500', textAlign: 'center' },
  idleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,8,16,0.5)',
  },
  idleText: { fontSize: 13, color: COLORS.muted, fontStyle: 'italic' },
  waveform: {
    position: 'absolute', bottom: 10, left: 20, right: 20,
    height: 36, flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  waveBar: {
    flex: 1, backgroundColor: 'rgba(108,99,255,0.5)',
    borderRadius: 2, height: 36,
  },
  mainPanel: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  transcriptArea: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 20, padding: 16, marginBottom: 12, minHeight: 100,
  },
  transcriptHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  transcriptLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  modelBadge: {
    backgroundColor: 'rgba(67,233,123,0.15)',
    borderWidth: 1, borderColor: 'rgba(67,233,123,0.3)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  modelBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.accent3 },
  emptyTranscript: { fontSize: 13, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  transcriptLine: { marginBottom: 10 },
  trOriginal: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginBottom: 3 },
  trTurkish: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  trCurrent: { color: '#fff', fontWeight: '500' },
  typingCursor: { color: COLORS.accent, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 14, padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 10, color: COLORS.muted },
  modelSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modelBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 12, alignItems: 'center',
  },
  modelBtnActive: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: 'rgba(108,99,255,0.4)',
  },
  modelBtnName: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  modelBtnCost: { fontSize: 10, color: COLORS.muted },
  modelBtnCostActive: { color: '#a39dff' },
  controls: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.accent, borderRadius: 20,
    paddingHorizontal: 40, paddingVertical: 14,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  startBtnIcon: { fontSize: 20, color: '#fff' },
  startBtnLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  stopBtn: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: COLORS.accent2, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent2, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  stopBtnInner: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  stopBtnIcon: { fontSize: 28 },
  statusMsgText: { textAlign: 'center', fontSize: 12, color: COLORS.muted, marginTop: 8 },
  statusMsgError: { color: COLORS.accent2 },
  statusMsgLive: { color: COLORS.accent3 },
});
