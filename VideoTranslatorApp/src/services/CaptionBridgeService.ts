/**
 * CaptionBridgeService — Platform-agnostic caption abstraction
 *
 * Android (öncelik sırası):
 *  1. live_caption  — LiveCaptionModule (AccessibilityService → sistem Live Caption)
 *                     Mikrofon YOK, sistem sesi okunur (~100-200ms, Google SODA)
 *  2. speech        — SpeechRecognizerModule (Android built-in SpeechRecognizer)
 *                     Mikrofon kullanır, Accessibility Service gerekmez
 *                     TECNO/Xiaomi/Samsung gibi OEM'lerde Live Caption güvenilmez
 *
 * iOS:
 *  speech           — SpeechModule (SFSpeechRecognizer, on-device ~300-500ms)
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { LiveCaptionModule, SpeechRecognizerModule, SpeechModule } = NativeModules;

export type CaptionMode = 'live_caption' | 'speech' | 'unavailable';

type CaptionTextHandler = (text: string) => void;
type StatusHandler = (status: string) => void;

class CaptionBridgeService {
  private textHandler: CaptionTextHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private subscriptions: any[] = [];
  private _isRunning = false;

  // ── Platform seçimi ──────────────────────────────────────

  getMode(): CaptionMode {
    if (Platform.OS === 'android') {
      // LiveCaptionModule varsa tercih et (sistem sesi, mikrofon gerekmez)
      if (LiveCaptionModule) return 'live_caption';
      // Fallback: Android built-in SpeechRecognizer (mikrofon)
      if (SpeechRecognizerModule) return 'speech';
    }
    if (Platform.OS === 'ios' && SpeechModule) return 'speech';
    return 'unavailable';
  }

  isAvailable(): boolean {
    return this.getMode() !== 'unavailable';
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  // ── Accessibility Service açık mı? ──────────────────────

  async isAccessibilityEnabled(): Promise<boolean> {
    if (Platform.OS === 'android' && LiveCaptionModule) {
      try {
        return await LiveCaptionModule.isEnabled();
      } catch {
        return false;
      }
    }
    return true;
  }

  async openSettings(): Promise<void> {
    if (Platform.OS === 'android' && LiveCaptionModule) {
      try {
        await LiveCaptionModule.openSettings();
      } catch (e) {
        console.error('[CaptionBridge] openSettings hatası:', e);
      }
    }
  }

  // ── Başlat ───────────────────────────────────────────────

  async start(
    onText: CaptionTextHandler,
    onStatus: StatusHandler,
  ): Promise<boolean> {
    if (this._isRunning) return true;
    this.textHandler = onText;
    this.statusHandler = onStatus;

    const mode = this.getMode();
    if (mode === 'live_caption') return this._startAndroidLiveCaption();
    if (mode === 'speech')       return this._startSpeechRecognizer();
    return false;
  }

  // ── Durdur ───────────────────────────────────────────────

  async stop(): Promise<void> {
    this._isRunning = false;
    this.subscriptions.forEach(s => s?.remove?.());
    this.subscriptions = [];

    // Android SpeechRecognizer'ı durdur
    if (Platform.OS === 'android' && SpeechRecognizerModule && this.getMode() === 'speech') {
      try { await SpeechRecognizerModule.stopListening(); } catch {}
    }
    // iOS SpeechModule'ü durdur
    if (Platform.OS === 'ios' && SpeechModule) {
      try { await SpeechModule.stopListening(); } catch {}
    }

    this.statusHandler?.('stopped');
  }

  // ── Android: LiveCaptionModule (AccessibilityService) ────

  private async _startAndroidLiveCaption(): Promise<boolean> {
    try {
      const enabled = await LiveCaptionModule.isEnabled();
      if (!enabled) {
        this.statusHandler?.('needs_permission');
        return false;
      }

      const emitter = new NativeEventEmitter(LiveCaptionModule);

      this.subscriptions.push(
        emitter.addListener('onCaptionText', ({ text }: { text: string }) => {
          if (text?.trim()) this.textHandler?.(text.trim());
        }),
      );

      this.subscriptions.push(
        emitter.addListener('onCaptionStatus', ({ status }: { status: string }) => {
          this.statusHandler?.(status);
        }),
      );

      this._isRunning = true;
      this.statusHandler?.('connected');
      return true;
    } catch (e) {
      console.error('[CaptionBridge] Android LiveCaption hatası:', e);
      this.statusHandler?.('error');
      return false;
    }
  }

  // ── Android: SpeechRecognizerModule (built-in, fallback) ─
  // iOS: SpeechModule (SFSpeechRecognizer)
  // Her iki modülün olay formatı aynı: onSpeechText / onSpeechStatus

  private async _startSpeechRecognizer(): Promise<boolean> {
    const module = Platform.OS === 'android' ? SpeechRecognizerModule : SpeechModule;
    if (!module) return false;

    try {
      const emitter = new NativeEventEmitter(module);

      this.subscriptions.push(
        emitter.addListener('onSpeechText', ({ text }: { text: string }) => {
          if (text?.trim()) this.textHandler?.(text.trim());
        }),
      );

      this.subscriptions.push(
        emitter.addListener('onSpeechStatus', ({ status }: { status: string }) => {
          this.statusHandler?.(status);
        }),
      );

      this.subscriptions.push(
        emitter.addListener('onSpeechError', ({ error }: { error: string }) => {
          console.warn('[CaptionBridge] SpeechError:', error);
        }),
      );

      const started: boolean = await module.startListening('en-US');
      this._isRunning = started;
      return started;
    } catch (e) {
      console.error('[CaptionBridge] Speech başlatma hatası:', e);
      return false;
    }
  }
}

export const captionBridge = new CaptionBridgeService();
