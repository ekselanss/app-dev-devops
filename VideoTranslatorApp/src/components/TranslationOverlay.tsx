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
  targetLanguage: string;
  confidence: number;
  isProcessing: boolean;
  showOriginal: boolean;
  onToggleOriginal: () => void;
}

export function TranslationOverlay({
  translated,
  original,
  detectedLanguage,
  targetLanguage,
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

  const LANG_FLAGS: Record<string, { flag: string; code: string }> = {
    en: { flag: '🇬🇧', code: 'EN' },
    es: { flag: '🇪🇸', code: 'ES' },
    fr: { flag: '🇫🇷', code: 'FR' },
    de: { flag: '🇩🇪', code: 'DE' },
    ru: { flag: '🇷🇺', code: 'RU' },
    ja: { flag: '🇯🇵', code: 'JA' },
    ko: { flag: '🇰🇷', code: 'KO' },
    zh: { flag: '🇨🇳', code: 'ZH' },
    ar: { flag: '🇸🇦', code: 'AR' },
    pt: { flag: '🇧🇷', code: 'PT' },
    it: { flag: '🇮🇹', code: 'IT' },
    tr: { flag: '🇹🇷', code: 'TR' },
    nl: { flag: '🇳🇱', code: 'NL' },
    hi: { flag: '🇮🇳', code: 'HI' },
    ur: { flag: '🇵🇰', code: 'UR' },
    fa: { flag: '🇮🇷', code: 'FA' },
  };

  const srcInfo = LANG_FLAGS[detectedLanguage] ?? { flag: '🌐', code: detectedLanguage?.toUpperCase() || '??' };
  const tgtInfo = LANG_FLAGS[targetLanguage] ?? { flag: '🌐', code: targetLanguage?.toUpperCase() || 'TR' };
  const confidencePct = Math.round((confidence ?? 0) * 100);

  return (
    <View style={styles.container}>
      {/* Sol üst: Kaynak → Hedef dil */}
      <View style={styles.infoBar}>
        <View style={styles.langBadge}>
          <Text style={styles.langFlag}>{srcInfo.flag}</Text>
          <Text style={styles.langCode}>{srcInfo.code}</Text>
          <Text style={styles.langArrow}> → </Text>
          <Text style={styles.langFlag}>{tgtInfo.flag}</Text>
          <Text style={styles.langCode}>{tgtInfo.code}</Text>
        </View>
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

  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    flex: 0,
  },

  langFlag: {
    fontSize: 16,
  },

  langCode: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  langArrow: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
  },

  confidence: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
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