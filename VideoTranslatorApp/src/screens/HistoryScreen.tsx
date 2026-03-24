import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Session } from '../services/ApiService';

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹',
  pt: '🇵🇹', ru: '🇷🇺', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳',
  ar: '🇸🇦', nl: '🇳🇱', tr: '🇹🇷',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}sn`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}dk ${s}sn` : `${m}dk`;
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return isoStr;
  }
}

interface Props {
  navigate: (screen: string) => void;
}

export function HistoryScreen({ navigate }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [sess, stats] = await Promise.all([
      apiService.getSessions(),
      apiService.getStats(),
    ]);
    setSessions(sess);
    if (stats) {
      setTotalMinutes(stats.total_minutes);
      setTotalTokens(stats.total_tokens_used);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Oturumu Sil',
      `"${title}" silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const ok = await apiService.deleteSession(id);
            if (ok) {
              setSessions(prev => prev.filter(s => s.id !== id));
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Session }) => {
    const srcFlag = LANG_FLAGS[item.source_lang] ?? '🌐';
    const tgtFlag = LANG_FLAGS[item.target_lang] ?? '🌐';

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>{item.icon || '🎙'}</Text>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardMeta}>
              {srcFlag} → {tgtFlag}  ·  {formatDuration(item.duration_seconds)}  ·  {item.tokens_used} 🪙
            </Text>
            <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item.id, item.title)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteBtn}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('Home')} style={styles.backBtn}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Geçmiş</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Stats */}
      {sessions.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sessions.length}</Text>
            <Text style={styles.statLabel}>Oturum</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalMinutes}</Text>
            <Text style={styles.statLabel}>Dakika</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalTokens}</Text>
            <Text style={styles.statLabel}>Token</Text>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6c63ff" size="large" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>Henüz çeviri geçmişi yok</Text>
          <Text style={styles.emptyHint}>Canlı çeviri yaptıktan sonra burada görünür</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => navigate('LiveTranslation')}>
            <Text style={styles.startBtnText}>Çeviri Başlat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={loadData}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108,99,255,0.12)',
  },
  backBtn: { width: 60 },
  backText: { color: '#6c63ff', fontSize: 15 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(108,99,255,0.08)',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.15)',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  statValue: { color: '#6c63ff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#6b6b8a', fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  emptyHint: { color: '#6b6b8a', fontSize: 14, textAlign: 'center' },
  startBtn: {
    marginTop: 8,
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#13131f',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  cardIcon: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardMeta: { color: '#6b6b8a', fontSize: 12, marginTop: 3 },
  cardDate: { color: '#444', fontSize: 11, marginTop: 2 },
  deleteBtn: { color: '#444', fontSize: 16, padding: 4 },
});
