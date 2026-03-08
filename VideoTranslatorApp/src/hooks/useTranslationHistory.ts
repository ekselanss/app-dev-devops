import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HistoryItem {
  id: string;
  timestamp: number;
  original: string;
  translated: string;
  detectedLanguage: string;
}

const STORAGE_KEY = '@translation_history';
const MAX_ITEMS = 200;

export function useTranslationHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Kayıtlı geçmişi yükle
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setHistory(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  const saveToStorage = useCallback(async (items: HistoryItem[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Geçmiş kayıt hatası:', e);
    }
  }, []);

  const addEntry = useCallback((entry: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    if (!entry.original.trim() || !entry.translated.trim()) return;

    setHistory((prev) => {
      const newItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        ...entry,
      };
      // En fazla MAX_ITEMS kayıt, yeniler başta
      const updated = [newItem, ...prev].slice(0, MAX_ITEMS);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const deleteEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const clearAll = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addEntry, deleteEntry, clearAll };
}
