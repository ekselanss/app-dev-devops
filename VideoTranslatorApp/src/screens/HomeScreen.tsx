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
import { apiService, Session } from '../services/ApiService';
import { userStore } from '../services/UserStore';

const COLORS = {
  bg: '#0d0d14',
  card: '#1a1a28',
  accent: '#6c63ff',
  accent2: '#ff6b6b',
  accent3: '#43e97b',
  accent4: '#f7b731',
  text: '#f0f0f8',
  muted: '#6b6b8a',
  border: 'rgba(108,99,255,0.15)',
};

export interface HomeScreenProps {
  navigate: (screen: string) => void;
}

const FALLBACK_SESSIONS = [
  {
    icon: '📺',
    iconBg: 'rgba(108,99,255,0.15)',
    title: 'Netflix Dizi - Stranger Things S4',
    lang: 'EN → TR',
    langStyle: 'en',
    time: '2 saat önce',
    tokens: '-245 🪙',
  },
  {
    icon: '🎬',
    iconBg: 'rgba(255,107,107,0.15)',
    title: 'YouTube - Tokyo Vlog 2026',
    lang: 'JP → TR',
    langStyle: 'jp',
    time: 'Dün',
    tokens: '-180 🪙',
  },
  {
    icon: '📱',
    iconBg: 'rgba(247,183,49,0.15)',
    title: 'TikTok - Cooking Recipe',
    lang: 'ES → TR',
    langStyle: 'es',
    time: '2 gün önce',
    tokens: '-92 🪙',
  },
];

const langStyles: Record<string, object> = {
  en: { backgroundColor: 'rgba(108,99,255,0.2)', color: '#a39dff' } as object,
  jp: { backgroundColor: 'rgba(255,107,107,0.2)', color: '#ff9d9d' } as object,
  es: { backgroundColor: 'rgba(247,183,49,0.2)', color: '#f7b731' } as object,
};

function getLangStyle(lang: string): object {
  return langStyles[lang.toLowerCase()] ?? (langStyles['en'] as object);
}

function formatSessionLang(session: Session): string {
  return `${session.source_lang.toUpperCase()} → ${session.target_lang.toUpperCase()}`;
}

function formatSessionTime(createdAt: string): string {
  try {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return 'Az önce';
    if (diffH < 24) return `${diffH} saat önce`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Dün';
    return `${diffD} gün önce`;
  } catch {
    return '';
  }
}

export function HomeScreen({ navigate }: HomeScreenProps) {
  const scanAnim = useRef(new Animated.Value(0)).current;
  const [tokenBalance, setTokenBalance] = useState<number>(2450);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      const [tokensResp, sessionsResp] = await Promise.all([
        apiService.getUserTokens(),
        apiService.getSessions(),
      ]);
      if (cancelled) return;
      if (tokensResp !== null) {
        setTokenBalance(tokensResp.balance);
        userStore.setBalance(tokensResp.balance);
      }
      if (sessionsResp.length > 0) {
        setSessions(sessionsResp);
        userStore.setSessions(sessionsResp);
      }
      setLoading(false);
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 60],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Merhaba, İsmail 👋</Text>
            <Text style={styles.headerSub}>Bugün ne izlemek istiyorsun?</Text>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={() => navigate('Profile')} activeOpacity={0.8}>
            <Text style={styles.avatarText}>İ</Text>
            <View style={styles.avatarBadge} />
          </TouchableOpacity>
        </View>

        {/* Token Card */}
        <View style={styles.tokenCard}>
          <Text style={styles.tokenLabel}>Token Bakiyesi</Text>
          <Text style={styles.tokenAmount}>
            {tokenBalance.toLocaleString('tr-TR')} <Text style={styles.tokenUnit}>token</Text>
          </Text>
          <View style={styles.tokenProgress}>
            <View style={styles.tokenProgressFill}>
              <Animated.View
                style={[styles.tokenProgressShimmer, { transform: [{ translateX: scanTranslate }] }]}
              />
            </View>
          </View>
          <View style={styles.tokenMeta}>
            <Text style={styles.tokenMetaText}>Bu ay 1.150 harcandı</Text>
            <Text style={styles.tokenMetaText}>~68 dk kaldı</Text>
          </View>
          <TouchableOpacity style={styles.tokenBuyBtn} onPress={() => navigate('TokenShop')} activeOpacity={0.8}>
            <Text style={styles.tokenBuyText}>+ Satın Al</Text>
          </TouchableOpacity>
        </View>

        {/* Modes */}
        <View style={styles.sectionTitle}>
          <Text style={styles.sectionTitleText}>Çeviri Modu</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modeScroll} contentContainerStyle={styles.modeScrollContent}>
          <TouchableOpacity style={[styles.modeCard, styles.modeCardActive]} onPress={() => navigate('LiveTranslation')} activeOpacity={0.8}>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>CANLI</Text>
            </View>
            <View style={[styles.modeIcon, styles.modeIcon1]}>
              <Text style={styles.modeIconText}>🎤</Text>
            </View>
            <Text style={styles.modeName}>Canlı Mikrofon</Text>
            <Text style={styles.modeDesc}>Gerçek zamanlı çeviri</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modeCard} activeOpacity={0.8} onPress={() => navigate('Translator')}>
            <View style={[styles.modeIcon, styles.modeIcon2]}>
              <Text style={styles.modeIconText}>🎥</Text>
            </View>
            <Text style={styles.modeName}>Video Yükle</Text>
            <Text style={styles.modeDesc}>Galeriden video seç</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modeCard} activeOpacity={0.8} onPress={() => navigate('Translator')}>
            <View style={[styles.modeIcon, styles.modeIcon3]}>
              <Text style={styles.modeIconText}>🔗</Text>
            </View>
            <Text style={styles.modeName}>Link Paylaş</Text>
            <Text style={styles.modeDesc}>Instagram, TikTok, YouTube</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Recent Sessions */}
        <View style={styles.sectionTitle}>
          <Text style={styles.sectionTitleText}>Son Oturumlar</Text>
          <TouchableOpacity onPress={() => navigate('History')}>
            <Text style={styles.sectionLink}>Tümü →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recentList}>
          {(sessions ?? FALLBACK_SESSIONS).map((item, i) => {
            const isSession = 'source_lang' in item;
            if (isSession) {
              const s = item as Session;
              const lStyle = getLangStyle(s.source_lang) as any;
              return (
                <TouchableOpacity key={s.id} style={styles.recentItem} activeOpacity={0.8}>
                  <View style={[styles.recentThumb, { backgroundColor: 'rgba(108,99,255,0.15)' }]}>
                    <Text style={styles.recentThumbIcon}>{s.icon}</Text>
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentTitle} numberOfLines={1}>{s.title}</Text>
                    <View style={styles.recentMeta}>
                      <View style={[styles.recentLangBadge, { backgroundColor: lStyle.backgroundColor }]}>
                        <Text style={[styles.recentLangText, { color: lStyle.color }]}>{formatSessionLang(s)}</Text>
                      </View>
                      <Text style={styles.recentTime}>{formatSessionTime(s.created_at)}</Text>
                    </View>
                  </View>
                  <Text style={styles.recentTokens}>-{s.tokens_used} 🪙</Text>
                </TouchableOpacity>
              );
            }
            const fb = item as typeof FALLBACK_SESSIONS[0];
            return (
              <TouchableOpacity key={i} style={styles.recentItem} activeOpacity={0.8}>
                <View style={[styles.recentThumb, { backgroundColor: fb.iconBg }]}>
                  <Text style={styles.recentThumbIcon}>{fb.icon}</Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{fb.title}</Text>
                  <View style={styles.recentMeta}>
                    <View style={[styles.recentLangBadge, { backgroundColor: (langStyles[fb.langStyle] as any).backgroundColor }]}>
                      <Text style={[styles.recentLangText, { color: (langStyles[fb.langStyle] as any).color }]}>{fb.lang}</Text>
                    </View>
                    <Text style={styles.recentTime}>{fb.time}</Text>
                  </View>
                </View>
                <Text style={styles.recentTokens}>{fb.tokens}</Text>
              </TouchableOpacity>
            );
          })}
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
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
  },
  avatarBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    backgroundColor: COLORS.accent3,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  tokenCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
  },
  tokenLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 6,
  },
  tokenAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tokenUnit: {
    fontSize: 16,
    color: COLORS.muted,
    fontWeight: '400',
  },
  tokenProgress: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
    width: '68%',
  },
  tokenProgressFill: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    overflow: 'hidden',
  },
  tokenProgressShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  tokenMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tokenMetaText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  tokenBuyBtn: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -16,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tokenBuyText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionLink: {
    fontSize: 12,
    color: COLORS.accent,
  },
  modeScroll: {
    marginBottom: 24,
  },
  modeScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  modeCard: {
    width: 150,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  modeCardActive: {
    borderColor: 'rgba(108,99,255,0.5)',
    backgroundColor: 'rgba(108,99,255,0.1)',
  },
  modeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: COLORS.accent3,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  modeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000',
  },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modeIcon1: { backgroundColor: 'rgba(108,99,255,0.2)' },
  modeIcon2: { backgroundColor: 'rgba(255,107,107,0.2)' },
  modeIcon3: { backgroundColor: 'rgba(67,233,123,0.2)' },
  modeIconText: { fontSize: 22 },
  modeName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 11,
    color: COLORS.muted,
    lineHeight: 15,
  },
  recentList: {
    paddingHorizontal: 20,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    marginBottom: 10,
  },
  recentThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentThumbIcon: { fontSize: 22 },
  recentInfo: { flex: 1, minWidth: 0 },
  recentTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 4,
  },
  recentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentLangBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recentLangText: {
    fontSize: 10,
    fontWeight: '600',
  },
  recentTime: {
    fontSize: 10,
    color: COLORS.muted,
  },
  recentTokens: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
  },
});
