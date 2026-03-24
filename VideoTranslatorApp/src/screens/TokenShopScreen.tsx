import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, TokenPackage } from '../services/ApiService';
import { userStore } from '../services/UserStore';

const COLORS = {
  bg: '#0a0a14',
  card: '#181828',
  accent: '#6c63ff',
  accent2: '#ff6b6b',
  accent3: '#43e97b',
  accent4: '#f7b731',
  text: '#f0f0f8',
  muted: '#6b6b8a',
  border: 'rgba(108,99,255,0.15)',
};

export interface TokenShopScreenProps {
  navigate: (screen: string) => void;
}

// UI metadata keyed by package id — used to enrich API data
const PKG_META: Record<string, {
  iconBg: string;
  tokensColor: string;
  priceColor: string;
  discountColor: string;
  features: { label: string; bg: string; color: string }[];
  desc: string;
}> = {
  starter: {
    iconBg: 'rgba(108,99,255,0.15)',
    tokensColor: COLORS.text,
    priceColor: COLORS.text,
    discountColor: COLORS.accent3,
    features: [{ label: 'Başlangıç', bg: 'rgba(108,99,255,0.15)', color: '#a39dff' }],
    desc: '~8 dk Base / ~4 dk Small',
  },
  popular: {
    iconBg: 'rgba(108,99,255,0.2)',
    tokensColor: '#a39dff',
    priceColor: '#a39dff',
    discountColor: COLORS.accent3,
    features: [
      { label: 'Önerilen', bg: 'rgba(108,99,255,0.15)', color: '#a39dff' },
    ],
    desc: '~20 dk Base / ~10 dk Small',
  },
  pro: {
    iconBg: 'rgba(247,183,49,0.15)',
    tokensColor: COLORS.text,
    priceColor: COLORS.text,
    discountColor: COLORS.accent4,
    features: [
      { label: 'Pro', bg: 'rgba(67,233,123,0.15)', color: COLORS.accent3 },
    ],
    desc: '~50 dk Base / ~25 dk Small',
  },
};

const paymentMethods = [
  { icon: '💳', name: 'Kredi Kartı' },
  { icon: '🏦', name: 'Havale' },
  { icon: '📱', name: 'Mobil' },
  { icon: '🍎', name: 'Apple Pay' },
];

export function TokenShopScreen({ navigate }: TokenShopScreenProps) {
  const [selectedPkg, setSelectedPkg] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState(0);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number>(userStore.getBalance());
  const [purchasing, setPurchasing] = useState(false);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      const [pkgs, tokens] = await Promise.all([
        apiService.getTokenPackages(),
        apiService.getUserTokens(),
      ]);
      if (cancelled) return;
      if (pkgs.length > 0) {
        setPackages(pkgs);
        // Default select the popular package
        const popularIdx = pkgs.findIndex((p) => p.popular);
        setSelectedPkg(popularIdx >= 0 ? popularIdx : 0);
      }
      if (tokens !== null) {
        setTokenBalance(tokens.balance);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  async function handlePurchase() {
    if (packages.length === 0 || purchasing) return;
    const pkg = packages[selectedPkg];
    setPurchasing(true);
    const result = await apiService.purchaseTokens(pkg.id);
    setPurchasing(false);
    if (result && result.success) {
      userStore.setBalance(result.new_balance);
      Alert.alert(
        'Satın Alma Başarılı',
        `${pkg.tokens.toLocaleString('tr-TR')} token hesabınıza eklendi!`,
        [{ text: 'Tamam', onPress: () => navigate('Home') }],
      );
    } else {
      Alert.alert('Hata', 'İşlem gerçekleştirilemedi, tekrar deneyin.');
    }
  }

  const shimmerTranslate = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] });

  const pkg = packages[selectedPkg] ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>9:41</Text>
        <Text style={styles.statusIcons}>📶 🔋 68%</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigate('Home')} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Token Satın Al 🪙</Text>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Mevcut Bakiye</Text>
          <Text style={styles.balanceAmount}>
            {tokenBalance.toLocaleString('tr-TR')} <Text style={styles.balanceUnit}>token</Text>
          </Text>
          <View style={styles.balanceBar}>
            <View style={styles.balanceFill} />
          </View>
          <View style={styles.balanceMeta}>
            <Text style={styles.balanceMetaText}>~28 dakika Base modeli</Text>
            <Text style={styles.balanceMetaText}>~14 dakika Small</Text>
          </View>
        </View>

        {/* Packages */}
        <Text style={styles.sectionLabel}>Paket Seçin</Text>

        <View style={styles.packages}>
          {packages.map((p, idx) => {
            const meta = PKG_META[p.id] ?? PKG_META['starter'];
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.pkgCard, p.popular && styles.pkgCardPopular, selectedPkg === idx && styles.pkgCardSelected]}
                onPress={() => setSelectedPkg(idx)}
                activeOpacity={0.85}
              >
                {p.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>🔥 POPÜLER</Text>
                  </View>
                )}
                <View style={[styles.pkgIcon, { backgroundColor: meta.iconBg }]}>
                  <Text style={styles.pkgIconText}>{p.icon}</Text>
                </View>
                <View style={styles.pkgInfo}>
                  <Text style={[styles.pkgTokens, { color: meta.tokensColor }]}>
                    {p.tokens.toLocaleString('tr-TR')} Token
                  </Text>
                  <Text style={styles.pkgDesc}>{meta.desc}</Text>
                  <View style={styles.pkgFeatures}>
                    {meta.features.map((f, fi) => (
                      <View key={fi} style={[styles.pkgFeature, { backgroundColor: f.bg }]}>
                        <Text style={[styles.pkgFeatureText, { color: f.color }]}>{f.label}</Text>
                      </View>
                    ))}
                    {p.discount_label && (
                      <View style={[styles.pkgFeature, { backgroundColor: 'rgba(67,233,123,0.15)' }]}>
                        <Text style={[styles.pkgFeatureText, { color: COLORS.accent3 }]}>{p.discount_label}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.pkgPriceCol}>
                  <Text style={[styles.pkgPrice, { color: meta.priceColor }]}>₺{p.price_tl}</Text>
                  <Text style={styles.pkgPer}>₺{p.price_per_token.toFixed(3)}/token</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentSection}>
          <Text style={styles.paymentLabel}>Ödeme Yöntemi</Text>
          <View style={styles.paymentMethods}>
            {paymentMethods.map((pm, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.paymentMethod, selectedPayment === i && styles.paymentMethodActive]}
                onPress={() => setSelectedPayment(i)}
                activeOpacity={0.8}
              >
                <Text style={styles.paymentIcon}>{pm.icon}</Text>
                <Text style={[styles.paymentName, selectedPayment === i && styles.paymentNameActive]}>{pm.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaArea}>
          {pkg && (
            <View style={styles.selectedSummary}>
              <View>
                <Text style={styles.summaryLabel}>Seçilen Paket</Text>
                <Text style={styles.summaryPkg}>{pkg.tokens.toLocaleString('tr-TR')} Token {pkg.icon}</Text>
              </View>
              <Text style={styles.summaryPrice}>₺{pkg.price_tl}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.buyBtn} activeOpacity={0.85} onPress={handlePurchase}>
            <Text style={styles.buyBtnText}>{purchasing ? 'İşleniyor...' : 'Güvenli Satın Al 🔒'}</Text>
            <Animated.View
              style={[styles.buyBtnShimmer, { transform: [{ translateX: shimmerTranslate }] }]}
            />
          </TouchableOpacity>

          <View style={styles.securityNote}>
            <Text style={styles.securityNoteText}>🔐 İyzico güvencesiyle korunan ödeme</Text>
          </View>
        </View>
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
  statusIcons: {
    fontSize: 10,
    color: COLORS.text,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 16,
    color: COLORS.text,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  balanceCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#1a0a3e',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.2)',
    overflow: 'hidden',
  },
  balanceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
    marginBottom: 16,
  },
  balanceUnit: {
    fontSize: 18,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.4)',
  },
  balanceBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  balanceFill: {
    height: '100%',
    width: '28%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  balanceMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  sectionLabel: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  packages: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  pkgCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
  },
  pkgCardPopular: {
    borderColor: 'rgba(108,99,255,0.4)',
    backgroundColor: 'rgba(108,99,255,0.08)',
  },
  pkgCardSelected: {
    borderColor: 'rgba(108,99,255,0.6)',
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pkgIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pkgIconText: {
    fontSize: 26,
  },
  pkgInfo: {
    flex: 1,
  },
  pkgTokens: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  pkgDesc: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 6,
  },
  pkgFeatures: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pkgFeature: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pkgFeatureText: {
    fontSize: 10,
    fontWeight: '600',
  },
  pkgPriceCol: {
    alignItems: 'flex-end',
  },
  pkgPrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  pkgPer: {
    fontSize: 10,
    color: COLORS.muted,
  },
  pkgDiscount: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  paymentSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  paymentLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentMethod: {
    flex: 1,
    padding: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
  },
  paymentMethodActive: {
    borderColor: 'rgba(108,99,255,0.5)',
    backgroundColor: 'rgba(108,99,255,0.1)',
  },
  paymentIcon: {
    fontSize: 22,
  },
  paymentName: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
  },
  paymentNameActive: {
    color: '#a39dff',
  },
  ctaArea: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  selectedSummary: {
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.2)',
    borderRadius: 14,
    padding: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  summaryPkg: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.accent,
  },
  buyBtn: {
    width: '100%',
    paddingVertical: 18,
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  buyBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  buyBtnShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  securityNote: {
    alignItems: 'center',
    marginTop: 10,
  },
  securityNoteText: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
