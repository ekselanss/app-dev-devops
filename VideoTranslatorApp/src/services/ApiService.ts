import { getServerUrl } from '../utils/serverConfig';

// ── Response type interfaces ───────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  tier: string;
  avatar_emoji: string;
  created_at: string;
}

export interface TokenBalance {
  balance: number;
  lifetime_used: number;
  lifetime_purchased: number;
}

export interface Session {
  id: string;
  title: string;
  source_lang: string;
  target_lang: string;
  duration_seconds: number;
  tokens_used: number;
  created_at: string;
  icon: string;
}

export interface CreateSessionPayload {
  title: string;
  source_lang?: string;
  target_lang?: string;
  duration_seconds?: number;
  tokens_used?: number;
  icon?: string;
}

export interface SessionStats {
  total_sessions: number;
  total_minutes: number;
  total_tokens_used: number;
}

export interface TokenPackage {
  id: string;
  name: string;
  icon: string;
  tokens: number;
  price_tl: number;
  price_per_token: number;
  popular: boolean;
  discount_label: string | null;
}

export interface PurchaseResponse {
  success: boolean;
  tokens_added: number;
  new_balance: number;
  package_id: string;
}

export interface DeductResponse {
  success: boolean;
  deducted: number;
  new_balance: number;
}

// ── Singleton ApiService ───────────────────────────────────────────────────

class ApiService {
  private static instance: ApiService;

  private constructor() {}

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private baseUrl(): string {
    return getServerUrl();
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const base = this.baseUrl();
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async post<T>(path: string, body: object): Promise<T | null> {
    try {
      const base = this.baseUrl();
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async del<T>(path: string): Promise<T | null> {
    try {
      const base = this.baseUrl();
      const res = await fetch(`${base}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  // ── User ──────────────────────────────────────────────────────────────────

  async getUserProfile(): Promise<UserProfile | null> {
    return this.get<UserProfile>('/api/user/profile');
  }

  async updateUserProfile(name: string): Promise<UserProfile | null> {
    return this.post<UserProfile>('/api/user/profile', { name });
  }

  async getUserTokens(): Promise<TokenBalance | null> {
    return this.get<TokenBalance>('/api/user/tokens');
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async getSessions(): Promise<Session[]> {
    const result = await this.get<Session[]>('/api/sessions');
    return result ?? [];
  }

  async createSession(data: CreateSessionPayload): Promise<Session | null> {
    return this.post<Session>('/api/sessions', data);
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.del<{ deleted: string }>(`/api/sessions/${id}`);
    return result !== null;
  }

  async getStats(): Promise<SessionStats | null> {
    return this.get<SessionStats>('/api/sessions/stats');
  }

  // ── Tokens ────────────────────────────────────────────────────────────────

  async getTokenPackages(): Promise<TokenPackage[]> {
    const result = await this.get<TokenPackage[]>('/api/tokens/packages');
    return result ?? [];
  }

  async purchaseTokens(packageId: string): Promise<PurchaseResponse | null> {
    return this.post<PurchaseResponse>('/api/tokens/purchase', { package_id: packageId });
  }

  async deductTokens(amount: number, reason: string = ''): Promise<DeductResponse | null> {
    return this.post<DeductResponse>('/api/tokens/deduct', { amount, reason });
  }
}

export const apiService = ApiService.getInstance();
