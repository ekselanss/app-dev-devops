import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@videocheviri_server_url';
const TIER_STORAGE_KEY = '@videocheviri_tier';
const DEFAULT_URL = 'https://rate-component-debate-companion.trycloudflare.com';

let cachedUrl: string | null = null;
let cachedTier: 'free' | 'pro' = 'free';

/**
 * Sunucu URL'sini AsyncStorage'dan yükle.
 * Uygulama başlangıcında bir kez çağrılır.
 */
export async function loadServerUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    cachedUrl = saved || DEFAULT_URL;
  } catch {
    cachedUrl = DEFAULT_URL;
  }
  return cachedUrl;
}

/**
 * Sunucu URL'sini güncelle ve kaydet.
 * Örnek: "https://abc123.ngrok-free.app" veya "http://192.168.1.50:8000"
 */
export async function saveServerUrl(url: string): Promise<void> {
  // Sondaki slash'ı kaldır
  const cleaned = url.replace(/\/+$/, '');
  cachedUrl = cleaned;
  await AsyncStorage.setItem(STORAGE_KEY, cleaned);
}

/**
 * Mevcut sunucu URL'sini getir (senkron, cache'den).
 * loadServerUrl() daha önce çağrılmış olmalı.
 */
export function getServerUrl(): string {
  return cachedUrl || DEFAULT_URL;
}

/**
 * Tier'ı yükle
 */
export async function loadTier(): Promise<'free' | 'pro'> {
  try {
    const saved = await AsyncStorage.getItem(TIER_STORAGE_KEY);
    cachedTier = (saved === 'pro') ? 'pro' : 'free';
  } catch {
    cachedTier = 'free';
  }
  return cachedTier;
}

/**
 * Tier'ı kaydet
 */
export async function saveTier(tier: 'free' | 'pro'): Promise<void> {
  cachedTier = tier;
  await AsyncStorage.setItem(TIER_STORAGE_KEY, tier);
}

/**
 * Mevcut tier'ı getir (senkron)
 */
export function getTier(): 'free' | 'pro' {
  return cachedTier;
}

/**
 * WebSocket URL'lerini oluştur.
 */
export function getWsUrls() {
  const base = getServerUrl();
  const wsBase = base.replace(/^http/, 'ws');
  return {
    translate: `${wsBase}/ws/translate`,
    fast: `${wsBase}/ws/fast`,
    pro: `${wsBase}/ws/pro`,
    http: base,
  };
}
