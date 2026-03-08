import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { HistoryItem } from '../hooks/useTranslationHistory';

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹',
  pt: '🇵🇹', ru: '🇷🇺', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳',
  ar: '🇸🇦', nl: '🇳🇱',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;

  if (diff < 60000) return 'Az önce';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  history: HistoryItem[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function HistoryScreen({ history, onDelete, onClearAll, onClose }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleClearAll = () => {
    Alert.alert(
      'Geçmişi Sil',
      'Tüm çeviri geçmişi silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: onClearAll },
      ]
    );
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Kaydı Sil',
      'Bu çeviri kaydı silinecek.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => onDelete(id) },
      ]
    );
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const isExpanded = expandedId === item.id;
    const flag = LANG_FLAGS[item.detectedLanguage] ?? '🌐';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardMeta}>
            <Text style={styles.flag}>{flag}</Text>
            <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.deleteBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.translated} numberOfLines={isExpanded ? undefined : 2}>
          {item.translated}
        </Text>

        {isExpanded && (
          <Text style={styles.original}>{item.original}</Text>
        )}

        {!isExpanded && item.translated.length > 80 && (
          <Text style={styles.expandHint}>Daha fazla göster</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Çeviri Geçmişi</Text>
        {history.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearBtn}>Temizle</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>Henüz çeviri geçmişi yok</Text>
          <Text style={styles.emptyHint}>Kayıt başlatıp konuşunca çeviriler burada görünür</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  closeBtn: {
    width: 60,
  },
  closeBtnText: {
    color: '#4CAF50',
    fontSize: 15,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  clearBtn: {
    color: '#ff5252',
    fontSize: 14,
    width: 60,
    textAlign: 'right',
  },
  list: {
    padding: 12,
    gap: 10,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flag: {
    fontSize: 16,
  },
  time: {
    color: '#555',
    fontSize: 12,
  },
  deleteBtn: {
    color: '#444',
    fontSize: 14,
    padding: 2,
  },
  translated: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  original: {
    color: '#666',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  expandHint: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
  },
});
