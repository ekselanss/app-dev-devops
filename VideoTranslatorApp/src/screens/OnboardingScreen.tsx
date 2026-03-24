import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#0a0a0f',
  surface: '#12121a',
  accent: '#6c63ff',
  accent2: '#ff6b6b',
  accent3: '#43e97b',
  text: '#f0f0f8',
  muted: '#6b6b8a',
  border: 'rgba(108,99,255,0.2)',
};

export interface OnboardingScreenProps {
  navigate: (screen: string) => void;
}

export function OnboardingScreen({ navigate }: OnboardingScreenProps) {
  // Globe pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Ring spin animations
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  // Badge float animations
  const badge1Anim = useRef(new Animated.Value(0)).current;
  const badge2Anim = useRef(new Animated.Value(0)).current;
  const badge3Anim = useRef(new Animated.Value(0)).current;
  // Blink for subtitle indicator
  const blinkAnim = useRef(new Animated.Value(1)).current;
  // Fade-in for hero text
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Globe pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Rings spinning (using rotation)
    Animated.loop(
      Animated.timing(ring1Anim, { toValue: 1, duration: 8000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(ring2Anim, { toValue: -1, duration: 12000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(ring3Anim, { toValue: 1, duration: 6000, useNativeDriver: true })
    ).start();

    // Badge floats
    const makeFloat = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: -8, duration: 2000, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    makeFloat(badge1Anim, 0);
    makeFloat(badge2Anim, 750);
    makeFloat(badge3Anim, 1500);

    // Blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 750, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    ).start();

    // Fade in text
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const ring1Rotate = ring1Anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ring2Rotate = ring2Anim.interpolate({ inputRange: [-1, 0], outputRange: ['-360deg', '0deg'] });
  const ring3Rotate = ring3Anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Area */}
        <View style={styles.heroArea}>
          {/* Globe */}
          <Animated.View style={[styles.globeContainer, { transform: [{ scale: pulseAnim }] }]}>
            {/* Spinning rings */}
            <Animated.View style={[styles.globeRing, styles.globeRing1, { transform: [{ rotate: ring1Rotate }] }]} />
            <Animated.View style={[styles.globeRing, styles.globeRing2, { transform: [{ rotate: ring2Rotate }] }]} />
            <Animated.View style={[styles.globeRing, styles.globeRing3, { transform: [{ rotate: ring3Rotate }] }]} />
            {/* Center */}
            <View style={styles.globeCenter}>
              <Text style={styles.globeIcon}>🌍</Text>
            </View>
            {/* Floating language badges */}
            <Animated.View style={[styles.langBadge, styles.langBadge1, { transform: [{ translateY: badge1Anim }] }]}>
              <Text style={styles.langBadge1Text}>English 🇺🇸</Text>
            </Animated.View>
            <Animated.View style={[styles.langBadge, styles.langBadge2, { transform: [{ translateY: badge2Anim }] }]}>
              <Text style={styles.langBadge2Text}>Türkçe 🇹🇷</Text>
            </Animated.View>
            <Animated.View style={[styles.langBadge, styles.langBadge3, { transform: [{ translateY: badge3Anim }] }]}>
              <Text style={styles.langBadge3Text}>日本語 🇯🇵</Text>
            </Animated.View>
          </Animated.View>

          {/* Subtitle preview */}
          <View style={styles.subtitlePreview}>
            <Text style={styles.subtitleLine}>"The future is already here..."</Text>
            <Text style={styles.subtitleTranslated}>
              <Animated.View style={[styles.subtitleIndicator, { opacity: blinkAnim }]} />
              {'  "Gelecek zaten burada..."'}
            </Text>
          </View>
        </View>

        {/* Hero Text */}
        <Animated.View style={[styles.heroText, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.appBadge}>
            <View style={styles.appBadgeDot} />
            <Text style={styles.appBadgeText}>SubVoice AI</Text>
          </View>

          <Text style={styles.heroTitle}>
            {'Her videoyu\n'}
            <Text style={styles.heroTitleAccent}>anında Türkçe</Text>
            {'\nizle'}
          </Text>

          <Text style={styles.heroDesc}>
            Gerçek zamanlı AI altyazı ile dil bariyerini kaldır.
            {'\n'}İngilizce, Japonca, İspanyolca — her dil.
          </Text>
        </Animated.View>

        {/* Dots */}
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        {/* Buttons */}
        <TouchableOpacity style={styles.btnPrimary} onPress={() => navigate('Home')} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>Hemen Başla →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => navigate('Home')} activeOpacity={0.7}>
          <Text style={styles.btnSecondaryText}>Zaten hesabım var</Text>
        </TouchableOpacity>

        {/* Home indicator */}
        <View style={styles.homeIndicator} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 16,
    flexGrow: 1,
  },
  heroArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    minHeight: 320,
  },
  globeContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  globeRing: {
    position: 'absolute',
    borderRadius: 110,
    borderWidth: 2,
  },
  globeRing1: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderColor: 'rgba(108,99,255,0.5)',
  },
  globeRing2: {
    top: 15,
    left: 15,
    right: 15,
    bottom: 15,
    borderColor: 'rgba(255,107,107,0.3)',
  },
  globeRing3: {
    top: 30,
    left: 30,
    right: 30,
    bottom: 30,
    borderColor: 'rgba(67,233,123,0.3)',
  },
  globeCenter: {
    position: 'absolute',
    top: 45,
    left: 45,
    right: 45,
    bottom: 45,
    backgroundColor: 'rgba(108,99,255,0.4)',
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  globeIcon: {
    fontSize: 42,
  },
  langBadge: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  langBadge1: {
    backgroundColor: 'rgba(108,99,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.4)',
    top: 20,
    right: -10,
  },
  langBadge1Text: {
    color: '#a39dff',
    fontSize: 12,
    fontWeight: '600',
  },
  langBadge2: {
    backgroundColor: 'rgba(255,107,107,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
    bottom: 30,
    left: -20,
  },
  langBadge2Text: {
    color: '#ff9d9d',
    fontSize: 12,
    fontWeight: '600',
  },
  langBadge3: {
    backgroundColor: 'rgba(67,233,123,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(67,233,123,0.4)',
    top: 60,
    left: -30,
  },
  langBadge3Text: {
    color: '#7dffa6',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitlePreview: {
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  subtitleLine: {
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  subtitleTranslated: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleIndicator: {
    width: 6,
    height: 6,
    backgroundColor: COLORS.accent3,
    borderRadius: 3,
    marginRight: 6,
  },
  heroText: {
    paddingHorizontal: 4,
  },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
    gap: 6,
  },
  appBadgeDot: {
    width: 6,
    height: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  appBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a39dff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 12,
    letterSpacing: -0.5,
    color: COLORS.text,
  },
  heroTitleAccent: {
    color: COLORS.accent,
  },
  heroDesc: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
    opacity: 0.3,
  },
  dotActive: {
    width: 20,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    opacity: 1,
  },
  btnPrimary: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnSecondary: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  btnSecondaryText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
});
