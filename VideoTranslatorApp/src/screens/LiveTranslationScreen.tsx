import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const WAVE_HEIGHTS = [0.30, 0.60, 0.90, 0.50, 0.80, 0.40, 0.70, 0.55, 0.85, 0.35, 0.65, 0.45, 0.75, 0.55, 0.30, 0.90, 0.60, 0.40, 0.70, 0.50];

const transcriptLines = [
  {
    original: '"We are living in an era of rapid technological change."',
    turkish: 'Hızlı teknolojik değişimin yaşandığı bir çağda yaşıyoruz.',
    current: false,
  },
  {
    original: '"Artificial intelligence is at the center of everything."',
    turkish: 'Yapay zeka her şeyin merkezinde yer alıyor.',
    current: false,
  },
  {
    original: '"The technology is changing everything around us..."',
    turkish: 'Teknoloji etrafımızdaki her şeyi değiştiriyor',
    current: true,
  },
];

const modelOptions = [
  { name: 'Base', cost: '1 🪙/sn' },
  { name: 'Small', cost: '2 🪙/sn' },
  { name: 'Medium', cost: '4 🪙/sn' },
];

export function LiveTranslationScreen({ navigate }: LiveTranslationScreenProps) {
  const [activeModel, setActiveModel] = useState(1);
  const sessionStartRef = useRef<number>(Date.now());
  const tokensUsedRef = useRef<number>(0);

  // REC dot blink
  const recBlink = useRef(new Animated.Value(1)).current;
  // Wave animations
  const waveAnims = useRef(WAVE_HEIGHTS.map(() => new Animated.Value(0.3))).current;
  // Cursor blink
  const cursorBlink = useRef(new Animated.Value(1)).current;
  // Stop button pulse
  const stopPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // REC blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(recBlink, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(recBlink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

    // Wave bars
    waveAnims.forEach((anim, i) => {
      const delay = (i % 10) * 100;
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    });

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
  }, []);

  const stopShadowOpacity = stopPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.8] });

  async function handleStop() {
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const tokensUsed = tokensUsedRef.current > 0 ? tokensUsedRef.current : Math.max(1, durationSeconds * 2);
    // Fire-and-forget: create session record and deduct tokens
    apiService.createSession({
      title: 'Canlı Mikrofon Oturumu',
      source_lang: 'en',
      target_lang: 'tr',
      duration_seconds: durationSeconds,
      tokens_used: tokensUsed,
      icon: '🎤',
    });
    apiService.deductTokens(tokensUsed, 'live_translation');
    navigate('Home');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Status bar area */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>9:41</Text>
        <View style={styles.recBadge}>
          <Animated.View style={[styles.recDot, { opacity: recBlink }]} />
          <Text style={styles.recText}>CANLI</Text>
        </View>
        <Text style={styles.statusBattery}>🔋 68%</Text>
      </View>

      {/* Video Area */}
      <View style={styles.videoArea}>
        <View style={styles.videoBg} />
        {/* Simulated person silhouette */}
        <View style={styles.videoScene}>
          <View style={styles.videoPerson} />
        </View>
        <View style={styles.videoOverlay} />

        {/* Lang indicator */}
        <View style={styles.langIndicator}>
          <Text style={styles.langIndicatorText}>🇺🇸 EN</Text>
          <Text style={styles.langArrow}> → </Text>
          <Text style={styles.langIndicatorText}>🇹🇷 TR</Text>
        </View>

        {/* Subtitle on video */}
        <View style={styles.subtitleOnVideo}>
          <Text style={styles.originalText}>"The technology is changing everything around us..."</Text>
          <View style={styles.translatedBox}>
            <Text style={styles.translatedText}>Teknoloji etrafımızdaki her şeyi değiştiriyor...</Text>
          </View>
        </View>

        {/* Waveform */}
        <View style={styles.waveform}>
          {waveAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                { transform: [{ scaleY: anim }] },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Main Panel */}
      <ScrollView style={styles.mainPanel} showsVerticalScrollIndicator={false}>
        {/* Transcript */}
        <View style={styles.transcriptArea}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptLabel}>Transkript</Text>
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>Whisper Small</Text>
            </View>
          </View>
          {transcriptLines.map((line, i) => (
            <View key={i} style={styles.transcriptLine}>
              <Text style={styles.trOriginal}>{line.original}</Text>
              <Text style={[styles.trTurkish, line.current && styles.trCurrent]}>
                {line.turkish}
                {line.current && (
                  <Animated.Text style={[styles.typingCursor, { opacity: cursorBlink }]}>|</Animated.Text>
                )}
              </Text>
            </View>
          ))}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.accent3 }]}>0.8s</Text>
            <Text style={styles.statLabel}>Gecikme</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.accent }]}>96%</Text>
            <Text style={styles.statLabel}>Doğruluk</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.accent2 }]}>-12 🪙</Text>
            <Text style={styles.statLabel}>Harcanan</Text>
          </View>
        </View>

        {/* Model Selector */}
        <View style={styles.modelSelector}>
          {modelOptions.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.modelBtn, activeModel === i && styles.modelBtnActive]}
              onPress={() => setActiveModel(i)}
              activeOpacity={0.8}
            >
              <Text style={styles.modelBtnName}>{m.name}</Text>
              <Text style={[styles.modelBtnCost, activeModel === i && styles.modelBtnCostActive]}>{m.cost}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7}>
            <Text style={styles.ctrlBtnIcon}>💾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7}>
            <Text style={styles.ctrlBtnIcon}>📋</Text>
          </TouchableOpacity>
          <Animated.View style={[styles.stopBtn, { shadowOpacity: stopShadowOpacity }]}>
            <TouchableOpacity onPress={handleStop} activeOpacity={0.85} style={styles.stopBtnInner}>
              <Text style={styles.stopBtnIcon}>⏹</Text>
            </TouchableOpacity>
          </Animated.View>
          <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7}>
            <Text style={styles.ctrlBtnIcon}>🔊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7}>
            <Text style={styles.ctrlBtnIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  statusTime: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBattery: {
    fontSize: 10,
    color: COLORS.text,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,107,107,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  recDot: {
    width: 6,
    height: 6,
    backgroundColor: COLORS.accent2,
    borderRadius: 3,
  },
  recText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent2,
  },
  videoArea: {
    width: '100%',
    height: 240,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  videoBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a0a2e',
  },
  videoScene: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPerson: {
    width: 80,
    height: 100,
    backgroundColor: 'rgba(244,162,97,0.4)',
    borderRadius: 40,
    marginTop: 30,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,16,0.3)',
  },
  langIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  langIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  langArrow: {
    color: COLORS.accent,
    fontSize: 12,
  },
  subtitleOnVideo: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  originalText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    marginBottom: 4,
    textAlign: 'center',
  },
  translatedBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  translatedText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  waveform: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    flex: 1,
    backgroundColor: 'rgba(108,99,255,0.6)',
    borderRadius: 2,
    height: 40,
  },
  mainPanel: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  transcriptArea: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    maxHeight: 200,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modelBadge: {
    backgroundColor: 'rgba(67,233,123,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(67,233,123,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accent3,
  },
  transcriptLine: {
    marginBottom: 10,
  },
  trOriginal: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: 3,
  },
  trTurkish: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  trCurrent: {
    color: '#fff',
    fontWeight: '500',
  },
  typingCursor: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '400',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.muted,
  },
  modelSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modelBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.15)',
    borderRadius: 12,
    alignItems: 'center',
  },
  modelBtnActive: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: 'rgba(108,99,255,0.4)',
  },
  modelBtnName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  modelBtnCost: {
    fontSize: 10,
    color: COLORS.muted,
  },
  modelBtnCostActive: {
    color: '#a39dff',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  ctrlBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ctrlBtnIcon: {
    fontSize: 20,
  },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  stopBtnInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnIcon: {
    fontSize: 28,
  },
});
