import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, UserProfile, SessionStats, UserSettings } from '../services/ApiService';
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

export interface ProfileScreenProps {
  navigate: (screen: string) => void;
}

const achievements = [
  { icon: '🎯', name: 'İlk Çeviri', desc: 'İlk oturumu tamamla', earned: true },
  { icon: '⚡', name: 'Hızlı Başlangıç', desc: '10 oturum aç', earned: true },
  { icon: '🌍', name: 'Çok Dilli', desc: '3 farklı dil', earned: true },
  { icon: '🏆', name: '100 Oturum', desc: 'Çok yakında', earned: false },
  { icon: '💫', name: 'Power User', desc: '50 saat çeviri', earned: false },
];

interface SettingRowProps {
  icon: string;
  iconBg: string;
  name: string;
  sub?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onPress?: () => void;
}

function SettingRow({ icon, iconBg, name, sub, right, danger, onPress }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, danger && styles.settingRowDanger]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.settingIconText}>{icon}</Text>
      </View>
      <View style={styles.settingText}>
        <Text style={[styles.settingName, danger && styles.settingNameDanger]}>{name}</Text>
        {sub ? <Text style={styles.settingSub}>{sub}</Text> : null}
      </View>
      <View style={styles.settingRight}>
        {right ?? <Text style={styles.chevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

const MODEL_OPTIONS = ['base', 'small', 'pro'];
const LANG_OPTIONS = [
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'en', flag: '🇬🇧', name: 'İngilizce' },
  { code: 'de', flag: '🇩🇪', name: 'Almanca' },
  { code: 'fr', flag: '🇫🇷', name: 'Fransızca' },
  { code: 'es', flag: '🇪🇸', name: 'İspanyolca' },
  { code: 'ja', flag: '🇯🇵', name: 'Japonca' },
  { code: 'ar', flag: '🇸🇦', name: 'Arapça' },
];
const SUBTITLE_OPTIONS = ['small', 'medium', 'large'];

export function ProfileScreen({ navigate }: ProfileScreenProps) {
  const [tokenNotif, setTokenNotif] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Edit profile modal
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    userStore.getSetting('tokenNotif', true).then(setTokenNotif);
    userStore.getSetting('darkMode', true).then(setDarkMode);

    let cancelled = false;
    async function loadData() {
      const [profileResp, statsResp, settingsResp] = await Promise.all([
        apiService.getUserProfile(),
        apiService.getStats(),
        apiService.getUserSettings(),
      ]);
      if (cancelled) return;
      if (profileResp) { setProfile(profileResp); userStore.setProfile(profileResp); }
      if (statsResp) setStats(statsResp);
      if (settingsResp) setSettings(settingsResp);
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  function handleTokenNotif(value: boolean) {
    setTokenNotif(value);
    userStore.setSetting('tokenNotif', value);
    apiService.updateUserSettings({ token_alert_enabled: value });
  }

  function handleDarkMode(value: boolean) {
    setDarkMode(value);
    userStore.setSetting('darkMode', value);
    apiService.updateUserSettings({ dark_mode: value });
  }

  function openEditProfile() {
    setEditName(profile?.name ?? '');
    setEditEmail(profile?.email ?? '');
    setEditModal(true);
  }

  async function saveProfile() {
    if (!editName.trim()) return;
    setSaving(true);
    const result = await apiService.updateUserProfile(editName.trim(), editEmail.trim());
    setSaving(false);
    if (result) {
      setProfile(result);
      userStore.setProfile(result);
    }
    setEditModal(false);
  }

  function showModelPicker() {
    Alert.alert('Varsayılan Model', 'Model seçin:', [
      ...MODEL_OPTIONS.map(m => ({
        text: m.charAt(0).toUpperCase() + m.slice(1) + (settings?.default_model === m ? ' ✓' : ''),
        onPress: async () => {
          const updated = await apiService.updateUserSettings({ default_model: m });
          if (updated) setSettings(updated);
        },
      })),
      { text: 'İptal', style: 'cancel' },
    ]);
  }

  function showLangPicker() {
    Alert.alert('Hedef Dil', 'Çeviri dilini seçin:', [
      ...LANG_OPTIONS.map(l => ({
        text: `${l.flag} ${l.name}` + (settings?.target_language === l.code ? ' ✓' : ''),
        onPress: async () => {
          const updated = await apiService.updateUserSettings({ target_language: l.code });
          if (updated) setSettings(updated);
        },
      })),
      { text: 'İptal', style: 'cancel' },
    ]);
  }

  function showSubtitlePicker() {
    const labels: Record<string, string> = { small: 'Küçük', medium: 'Orta', large: 'Büyük' };
    Alert.alert('Altyazı Boyutu', 'Boyut seçin:', [
      ...SUBTITLE_OPTIONS.map(s => ({
        text: labels[s] + (settings?.subtitle_size === s ? ' ✓' : ''),
        onPress: async () => {
          const updated = await apiService.updateUserSettings({ subtitle_size: s });
          if (updated) setSettings(updated);
        },
      })),
      { text: 'İptal', style: 'cancel' },
    ]);
  }

  const displayName = profile?.name ?? 'İsmail Özçelik';
  const displayEmail = profile?.email ?? 'ismail@subvoice.app';
  const displayAvatar = profile?.avatar_emoji ?? '😎';
  const displayTier = profile?.tier === 'pro' ? 'PRO' : 'FREE';
  const totalSessions = stats?.total_sessions ?? 47;
  const totalHours = stats ? (stats.total_minutes / 60).toFixed(1) : '12.4';
  const totalTokens = stats?.total_tokens_used ?? 8550;

  const modelLabel = settings?.default_model
    ? settings.default_model.charAt(0).toUpperCase() + settings.default_model.slice(1)
    : 'Base';
  const langLabel = LANG_OPTIONS.find(l => l.code === settings?.target_language);
  const subtitleLabel: Record<string, string> = { small: 'Küçük', medium: 'Orta', large: 'Büyük' };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>9:41</Text>
        <Text style={styles.statusIcons}>📶 🔋 68%</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Hero */}
        <View style={styles.profileHero}>
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarIcon}>{displayAvatar}</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>{displayTier}</Text>
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileEmail}>{displayEmail}</Text>
              <View style={styles.profileSince}>
                <Text style={styles.profileSinceText}>✨ Mart 2026'dan beri</Text>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: COLORS.accent }]}>{totalSessions}</Text>
              <Text style={styles.statLbl}>Oturum</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: COLORS.accent3 }]}>{totalHours}</Text>
              <Text style={styles.statLbl}>Saat çeviri</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: COLORS.accent4 }]}>{totalTokens.toLocaleString('tr-TR')}</Text>
              <Text style={styles.statLbl}>Token harcandı</Text>
            </View>
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.achievements}>
          <Text style={styles.achievementsLabel}>Rozetler</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achievementScroll}>
            {achievements.map((a, i) => (
              <View
                key={i}
                style={[
                  styles.achievement,
                  a.earned && styles.achievementEarned,
                  !a.earned && styles.achievementLocked,
                ]}
              >
                <Text style={styles.achievementIcon}>{a.icon}</Text>
                <Text style={styles.achievementName}>{a.name}</Text>
                <Text style={styles.achievementDesc}>{a.desc}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Preferences */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsLabel}>Tercihler</Text>
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="🤖"
              iconBg="rgba(108,99,255,0.15)"
              name="Varsayılan Model"
              sub="Whisper model seçimi"
              right={<Text style={styles.settingValue}>{modelLabel} <Text style={styles.chevron}>›</Text></Text>}
              onPress={showModelPicker}
            />
            <SettingRow
              icon="🌍"
              iconBg="rgba(67,233,123,0.15)"
              name="Hedef Dil"
              sub="Çevirilen dil"
              right={<Text style={styles.settingValue}>{langLabel ? `${langLabel.flag} ${langLabel.name}` : '🇹🇷 Türkçe'} <Text style={styles.chevron}>›</Text></Text>}
              onPress={showLangPicker}
            />
            <SettingRow
              icon="✨"
              iconBg="rgba(247,183,49,0.15)"
              name="Altyazı Boyutu"
              sub="Ekranda görünen metin"
              right={<Text style={styles.settingValue}>{subtitleLabel[settings?.subtitle_size ?? 'medium'] ?? 'Orta'} <Text style={styles.chevron}>›</Text></Text>}
              onPress={showSubtitlePicker}
            />
            <SettingRow
              icon="🔔"
              iconBg="rgba(255,107,107,0.15)"
              name="Token Uyarısı"
              sub="Azaldığında bildir"
              right={
                <Switch
                  value={tokenNotif}
                  onValueChange={handleTokenNotif}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accent }}
                  thumbColor="#fff"
                />
              }
            />
            <SettingRow
              icon="🌙"
              iconBg="rgba(108,99,255,0.15)"
              name="Karanlık Mod"
              sub="Uygulama teması"
              right={
                <Switch
                  value={darkMode}
                  onValueChange={handleDarkMode}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accent }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        {/* Account */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsLabel}>Hesap</Text>
          <View style={styles.settingsGroup}>
            <SettingRow icon="👤" iconBg="rgba(108,99,255,0.15)" name="Profili Düzenle" onPress={openEditProfile} />
            <SettingRow icon="🔒" iconBg="rgba(67,233,123,0.15)" name="Güvenlik" sub="Şifre, 2FA"
              onPress={() => Alert.alert('Güvenlik', 'Bu özellik yakında eklenecek.')} />
            <SettingRow icon="📊" iconBg="rgba(247,183,49,0.15)" name="Kullanım Geçmişi"
              onPress={() => navigate('History')} />
            <SettingRow
              icon="🚪"
              iconBg="rgba(255,107,107,0.15)"
              name="Çıkış Yap"
              danger
              right={<Text style={[styles.chevron, { color: COLORS.accent2 }]}>›</Text>}
              onPress={() => navigate('Onboarding')}
            />
          </View>
        </View>

        {/* Version */}
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>
            SubVoice v1.0.0 · <Text style={{ color: COLORS.accent }}>Gizlilik</Text> · <Text style={{ color: COLORS.accent }}>Şartlar</Text>
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Profili Düzenle</Text>
            <Text style={styles.modalLabel}>Ad Soyad</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Ad Soyad"
              placeholderTextColor="#6b6b8a"
            />
            <Text style={styles.modalLabel}>E-posta</Text>
            <TextInput
              style={styles.modalInput}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="E-posta"
              placeholderTextColor="#6b6b8a"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveProfile} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  profileHero: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  profileAvatarIcon: {
    fontSize: 32,
  },
  proBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: COLORS.accent4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
  },
  profileSince: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(67,233,123,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(67,233,123,0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  profileSinceText: {
    fontSize: 11,
    color: COLORS.accent3,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLbl: {
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 13,
  },
  achievements: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  achievementsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  achievementScroll: {
    gap: 10,
    paddingBottom: 4,
  },
  achievement: {
    width: 90,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  achievementEarned: {
    borderColor: 'rgba(247,183,49,0.3)',
    backgroundColor: 'rgba(247,183,49,0.06)',
  },
  achievementLocked: {
    opacity: 0.4,
  },
  achievementIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  achievementName: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  achievementDesc: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 12,
  },
  settingsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  settingsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  settingsGroup: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  settingRowDanger: {
    backgroundColor: 'rgba(255,107,107,0.05)',
    borderBottomWidth: 0,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingIconText: {
    fontSize: 18,
  },
  settingText: {
    flex: 1,
  },
  settingName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  settingNameDanger: {
    color: COLORS.accent2,
  },
  settingSub: {
    fontSize: 11,
    color: COLORS.muted,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 12,
    color: COLORS.muted,
  },
  chevron: {
    color: COLORS.muted,
    fontSize: 16,
    fontWeight: '400',
  },
  versionRow: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 20,
  },
  versionText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1a1a28', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 20,
  },
  modalLabel: {
    fontSize: 11, color: COLORS.muted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    color: COLORS.text, fontSize: 15, marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: {
    flex: 1, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, alignItems: 'center',
  },
  modalCancelText: { color: COLORS.muted, fontWeight: '600' },
  modalSave: {
    flex: 2, paddingVertical: 14,
    backgroundColor: COLORS.accent, borderRadius: 14, alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
