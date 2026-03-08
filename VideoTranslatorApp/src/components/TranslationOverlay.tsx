/**
 * TranslationOverlay
 * Ekranın altında kayan, yarı-şeffaf altyazı bileşeni.
 * Yeni çeviri geldiğinde yumuşak geçişle güncellenir.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';

interface TranslationOverlayProps {
  translated: string;
  original: string;
  detectedLanguage: string;
  confidence: number;
  isProcessing: boolean;
  showOriginal: boolean;
  onToggleOriginal: () => void;
}

export function TranslationOverlay({
  translated,
  original,
  detectedLanguage,
  confidence,
  isProcessing,
  showOriginal,
  onToggleOriginal,
}: TranslationOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevTranslated = useRef('');

  // Yeni çeviri gelince animasyon
  useEffect(() => {
    if (translated && translated !== prevTranslated.current) {
      prevTranslated.current = translated;

      // Kısa fade animasyonu
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.4, duration: 100, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // Yukarı kaydır
      Animated.spring(slideAnim, {
        toValue: -8,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start(() => {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }).start();
      });
    }
  }, [translated]);

  const LANG_LABELS: Record<string, string> = {
    en: '🇬🇧 İngilizce',
    es: '🇪🇸 İspanyolca',
    fr: '🇫🇷 Fransızca',
    de: '🇩🇪 Almanca',
    ru: '🇷🇺 Rusça',
    ja: '🇯🇵 Japonca',
    ko: '🇰🇷 Korece',
    zh: '🇨🇳 Çince',
    ar: '🇸🇦 Arapça',
    pt: '🇧🇷 Portekizce',
    it: '🇮🇹 İtalyanca',
  };

  const langLabel = LANG_LABELS[detectedLanguage] ?? `🌐 ${detectedLanguage?.toUpperCase()}`;
  const confidencePct = Math.round((confidence ?? 0) * 100);

  return (
    <View style={styles.container}>
      {/* Üst bilgi çubuğu */}
      <View style={styles.infoBar}>
        <Text style={styles.langLabel}>{langLabel}</Text>
        {confidence > 0 && (
          <Text style={styles.confidence}>%{confidencePct}</Text>
        )}
        <TouchableOpacity onPress={onToggleOriginal} style={styles.toggleBtn}>
          <Text style={styles.toggleText}>
            {showOriginal ? 'Gizle' : 'Orijinal'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Orijinal metin (isteğe bağlı) */}
      {showOriginal && original ? (
        <Text style={styles.originalText} numberOfLines={2}>
          {original}
        </Text>
      ) : null}

      {/* Türkçe çeviri */}
      <Animated.View
        style={[
          styles.translationBox,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {isProcessing && !translated ? (
          <View style={styles.processingRow}>
            <Text style={styles.processingDot}>●</Text>
            <Text style={styles.processingDot}>●</Text>
            <Text style={styles.processingDot}>●</Text>
          </View>
        ) : (
          <Text style={styles.translatedText} numberOfLines={4}>
            {translated || 'Dinleniyor...'}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.80)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 10,
  },

  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },

  langLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },

  confidence: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
  },

  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
  },

  toggleText: {
    color: '#ccc',
    fontSize: 11,
  },

  originalText: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 6,
    lineHeight: 18,
  },

  translationBox: {
    minHeight: 50,
    justifyContent: 'center',
  },

  translatedText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  processingRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
  },

  processingDot: {
    color: '#4CAF50',
    fontSize: 16,
    opacity: 0.7,
  },
});