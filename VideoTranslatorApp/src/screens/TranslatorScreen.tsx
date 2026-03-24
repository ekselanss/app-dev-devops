import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getServerUrl } from '../utils/serverConfig';

interface Props {
  navigate: (screen: string) => void;
}

const TARGET_LANGS = [
  { code: 'tr', label: '🇹🇷 Türkçe' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'es', label: '🇪🇸 Español' },
];

export function TranslatorScreen({ navigate }: Props) {
  const [mode, setMode] = useState<'link' | 'text'>('text');
  const [inputText, setInputText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [targetLang, setTargetLang] = useState('tr');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const translateText = async () => {
    const text = inputText.trim();
    if (!text) return;

    setLoading(true);
    setResult('');
    try {
      const base = getServerUrl();
      const res = await fetch(`${base}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target_language: targetLang }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.translated_text || data.translated || '');
      } else {
        Alert.alert('Hata', 'Çeviri başarısız. Sunucu bağlantısını kontrol et.');
      }
    } catch {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkTranslate = () => {
    Alert.alert(
      'Yakında',
      'Video/link çevirisi yakında eklenecek.\n\nŞu an için Canlı Çeviri özelliğini kullanabilirsin.',
      [
        { text: 'Tamam' },
        { text: 'Canlı Çeviri Aç', onPress: () => navigate('LiveTranslation') },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('Home')} style={styles.backBtn}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Çevirici</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Mode Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'text' && styles.tabActive]}
            onPress={() => setMode('text')}
          >
            <Text style={[styles.tabText, mode === 'text' && styles.tabTextActive]}>✏️ Metin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'link' && styles.tabActive]}
            onPress={() => setMode('link')}
          >
            <Text style={[styles.tabText, mode === 'link' && styles.tabTextActive]}>🔗 Video / Link</Text>
          </TouchableOpacity>
        </View>

        {/* Target Language */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hedef Dil</Text>
          <View style={styles.langRow}>
            {TARGET_LANGS.map(l => (
              <TouchableOpacity
                key={l.code}
                style={[styles.langChip, targetLang === l.code && styles.langChipActive]}
                onPress={() => setTargetLang(l.code)}
              >
                <Text style={[styles.langChipText, targetLang === l.code && styles.langChipTextActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {mode === 'text' ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Çevrilecek Metin</Text>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Çevirmek istediğin metni buraya yaz..."
                placeholderTextColor="#444"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.translateBtn, (!inputText.trim() || loading) && styles.translateBtnDisabled]}
              onPress={translateText}
              disabled={!inputText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.translateBtnText}>Çevir →</Text>
              )}
            </TouchableOpacity>

            {result ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Çeviri</Text>
                <Text style={styles.resultText}>{result}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Video / Sayfa Linki</Text>
              <TextInput
                style={styles.textInput}
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor="#444"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <TouchableOpacity style={styles.translateBtn} onPress={handleLinkTranslate}>
              <Text style={styles.translateBtnText}>Çevir →</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>💡 Canlı Çeviri Dene</Text>
              <Text style={styles.infoText}>
                Videoyu telefon hoparlöründen çal ve Canlı Çeviri özelliğiyle gerçek zamanlı çeviri al.
              </Text>
              <TouchableOpacity style={styles.liveBtn} onPress={() => navigate('LiveTranslation')}>
                <Text style={styles.liveBtnText}>▶ Canlı Çeviri Aç</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0a0f' },
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#13131f',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#6c63ff' },
  tabText: { color: '#6b6b8a', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  section: { gap: 8 },
  sectionLabel: { color: '#6b6b8a', fontSize: 13, fontWeight: '600' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    backgroundColor: '#13131f',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  langChipActive: { backgroundColor: 'rgba(108,99,255,0.15)', borderColor: '#6c63ff' },
  langChipText: { color: '#6b6b8a', fontSize: 13 },
  langChipTextActive: { color: '#6c63ff', fontWeight: '600' },
  textInput: {
    backgroundColor: '#13131f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    color: '#fff',
    fontSize: 15,
    padding: 14,
    minHeight: 120,
  },
  translateBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  translateBtnDisabled: { opacity: 0.5 },
  translateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resultBox: {
    backgroundColor: 'rgba(108,99,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.2)',
    gap: 8,
  },
  resultLabel: { color: '#6c63ff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  resultText: { color: '#fff', fontSize: 16, lineHeight: 24 },
  infoBox: {
    backgroundColor: '#13131f',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#222',
  },
  infoTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  infoText: { color: '#6b6b8a', fontSize: 14, lineHeight: 20 },
  liveBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  liveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
