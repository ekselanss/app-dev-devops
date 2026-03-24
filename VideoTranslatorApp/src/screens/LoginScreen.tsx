import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const COLORS = {
  bg: '#0a0a0f',
  surface: '#12121a',
  accent: '#6c63ff',
  accent2: '#ff6b6b',
  accent3: '#43e97b',
  text: '#f0f0f8',
  muted: '#6b6b8a',
  border: 'rgba(108,99,255,0.2)',
  inputBg: 'rgba(255,255,255,0.05)',
};

interface Props {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeInput, setActiveInput] = useState<'email' | 'password' | null>(null);

  // Orb animasyonları
  const orb1 = useRef(new Animated.Value(0)).current;
  const orb2 = useRef(new Animated.Value(0)).current;
  const orb3 = useRef(new Animated.Value(0)).current;

  // Globe ring animasyonları
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  // Globe pulse
  const globePulse = useRef(new Animated.Value(1)).current;

  // Giriş animasyonu
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Badge badge animasyonu
  const badgePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Orb float animasyonları
    const floatOrb = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 4000, delay, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 4000, useNativeDriver: true }),
        ]),
      ).start();

    floatOrb(orb1, 0);
    floatOrb(orb2, 1500);
    floatOrb(orb3, 3000);

    // Ring spin simülasyonu (opacity ile)
    const spinRing = (anim: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: duration / 2, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: duration / 2, useNativeDriver: true }),
        ]),
      ).start();

    spinRing(ring1, 3000);
    spinRing(ring2, 5000);
    spinRing(ring3, 2500);

    // Globe pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(globePulse, { toValue: 1.04, duration: 1500, useNativeDriver: true }),
        Animated.timing(globePulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();

    // Badge pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.2, duration: 750, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 750, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const orb1Y = orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const orb2Y = orb2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });
  const orb3Y = orb3.interpolate({ inputRange: [0, 1], outputRange: [0, -25] });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Arka plan orb'ları */}
      <Animated.View
        style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.orb, styles.orb3, { transform: [{ translateY: orb3Y }] }]}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}>

            {/* Globe animasyonu */}
            <View style={styles.globeArea}>
              <Animated.View style={[styles.globeContainer, { transform: [{ scale: globePulse }] }]}>
                <Animated.View style={[styles.globeRing, styles.globeRing1, { opacity: ring1 }]} />
                <Animated.View style={[styles.globeRing, styles.globeRing2, { opacity: ring2 }]} />
                <Animated.View style={[styles.globeRing, styles.globeRing3, { opacity: ring3 }]} />
                <View style={styles.globeCenter}>
                  <Text style={styles.globeIcon}>🌍</Text>
                </View>

                {/* Dil etiketleri */}
                <View style={[styles.langBadge, styles.langBadge1]}>
                  <Text style={[styles.langBadgeText, { color: '#a39dff' }]}>English 🇺🇸</Text>
                </View>
                <View style={[styles.langBadge, styles.langBadge2]}>
                  <Text style={[styles.langBadgeText, { color: '#ff9d9d' }]}>Türkçe 🇹🇷</Text>
                </View>
                <View style={[styles.langBadge, styles.langBadge3]}>
                  <Text style={[styles.langBadgeText, { color: '#7dffa6' }]}>日本語 🇯🇵</Text>
                </View>
              </Animated.View>
            </View>

            {/* App badge */}
            <View style={styles.appBadge}>
              <Animated.View style={[styles.appBadgeDot, { transform: [{ scale: badgePulse }] }]} />
              <Text style={styles.appBadgeText}>SUBVOICE AI</Text>
            </View>

            {/* Başlık */}
            <Text style={styles.title}>
              Tekrar{'\n'}
              <Text style={styles.titleAccent}>hoş geldin</Text>
            </Text>
            <Text style={styles.desc}>
              Hesabına giriş yap ve altyazılarına kaldığın yerden devam et.
            </Text>

            {/* Form */}
            <View style={styles.form}>
              <View
                style={[
                  styles.inputWrapper,
                  activeInput === 'email' && styles.inputWrapperActive,
                ]}>
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="E-posta adresi"
                  placeholderTextColor={COLORS.muted}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setActiveInput('email')}
                  onBlur={() => setActiveInput(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  activeInput === 'password' && styles.inputWrapperActive,
                ]}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Şifre"
                  placeholderTextColor={COLORS.muted}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setActiveInput('password')}
                  onBlur={() => setActiveInput(null)}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Şifremi unuttum</Text>
              </TouchableOpacity>
            </View>

            {/* Butonlar */}
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={onLogin}
              activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Giriş Yap →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSecondary} activeOpacity={0.7}>
              <Text style={styles.btnSecondaryText}>Hesap oluştur</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>veya</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Misafir girişi */}
            <TouchableOpacity
              style={styles.btnGuest}
              onPress={onLogin}
              activeOpacity={0.7}>
              <Text style={styles.btnGuestText}>Misafir olarak devam et</Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  content: {
    flex: 1,
  },

  // Orbs
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 350,
    height: 350,
    backgroundColor: 'rgba(108,99,255,0.12)',
    top: -120,
    left: -120,
  },
  orb2: {
    width: 280,
    height: 280,
    backgroundColor: 'rgba(255,107,107,0.08)',
    bottom: 100,
    right: -100,
  },
  orb3: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(67,233,123,0.06)',
    top: height * 0.4,
    left: width * 0.5,
  },

  // Globe
  globeArea: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  globeContainer: {
    width: 160,
    height: 160,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  globeRing1: {
    inset: 0,
    width: 160,
    height: 160,
    borderColor: 'rgba(108,99,255,0.7)',
  },
  globeRing2: {
    width: 130,
    height: 130,
    borderColor: 'rgba(255,107,107,0.5)',
  },
  globeRing3: {
    width: 100,
    height: 100,
    borderColor: 'rgba(67,233,123,0.5)',
  },
  globeCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(108,99,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  globeIcon: {
    fontSize: 36,
  },
  langBadge: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  langBadge1: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.4)',
    top: 8,
    right: -30,
  },
  langBadge2: {
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
    bottom: 10,
    left: -35,
  },
  langBadge3: {
    backgroundColor: 'rgba(67,233,123,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(67,233,123,0.4)',
    top: 40,
    left: -40,
  },
  langBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Badge
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
    marginTop: 8,
  },
  appBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  appBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a39dff',
    letterSpacing: 1,
  },

  // Başlık
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 40,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  titleAccent: {
    color: COLORS.accent,
  },
  desc: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 28,
  },

  // Form
  form: {
    gap: 12,
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 54,
  },
  inputWrapperActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(108,99,255,0.08)',
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    color: COLORS.accent,
  },

  // Butonlar
  btnPrimary: {
    width: '100%',
    height: 54,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    letterSpacing: 0.3,
  },
  btnSecondary: {
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: COLORS.muted,
    fontSize: 14,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
  },

  // Misafir
  btnGuest: {
    width: '100%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGuestText: {
    color: COLORS.muted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
