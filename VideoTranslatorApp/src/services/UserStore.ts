import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, Session } from './ApiService';

const STORAGE_KEY = '@subvoice_user_store';

interface StoredState {
  tokenBalance: number;
  userProfile: UserProfile | null;
  sessions: Session[];
}

const DEFAULT_STATE: StoredState = {
  tokenBalance: 0,
  userProfile: null,
  sessions: [],
};

class UserStore {
  private static instance: UserStore;

  private state: StoredState = { ...DEFAULT_STATE };

  private constructor() {}

  static getInstance(): UserStore {
    if (!UserStore.instance) {
      UserStore.instance = new UserStore();
    }
    return UserStore.instance;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  async loadFromStorage(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredState>;
        this.state = {
          tokenBalance: parsed.tokenBalance ?? DEFAULT_STATE.tokenBalance,
          userProfile: parsed.userProfile ?? DEFAULT_STATE.userProfile,
          sessions: parsed.sessions ?? DEFAULT_STATE.sessions,
        };
      }
    } catch {
      // keep defaults on error
    }
  }

  async saveToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // silently ignore storage errors
    }
  }

  // ── Token balance ────────────────────────────────────────────────────────

  getBalance(): number {
    return this.state.tokenBalance;
  }

  updateBalance(delta: number): void {
    this.state.tokenBalance = Math.max(0, this.state.tokenBalance + delta);
    this.saveToStorage();
  }

  setBalance(balance: number): void {
    this.state.tokenBalance = Math.max(0, balance);
    this.saveToStorage();
  }

  // ── User profile ─────────────────────────────────────────────────────────

  getProfile(): UserProfile | null {
    return this.state.userProfile;
  }

  setProfile(profile: UserProfile): void {
    this.state.userProfile = profile;
    this.saveToStorage();
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  getSessions(): Session[] {
    return this.state.sessions;
  }

  setSessions(sessions: Session[]): void {
    this.state.sessions = sessions;
    this.saveToStorage();
  }

  // ── Settings toggles (AsyncStorage direct) ───────────────────────────────

  async getSetting(key: string, defaultValue: boolean): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(`@subvoice_setting_${key}`);
      if (raw === null) return defaultValue;
      return raw === 'true';
    } catch {
      return defaultValue;
    }
  }

  async setSetting(key: string, value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(`@subvoice_setting_${key}`, value ? 'true' : 'false');
    } catch {
      // silently ignore
    }
  }
}

export const userStore = UserStore.getInstance();
