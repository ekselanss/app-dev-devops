export type WSMessageType = 'connected' | 'translation' | 'processing' | 'empty' | 'error' | 'ping' | 'pong';

export interface WSMessage {
  type: WSMessageType;
  message?: string;
  session_id?: string;
  original?: string;
  translated?: string;
  detected_language?: string;
  confidence?: number;
  provider?: string;
}

type MessageHandler = (message: WSMessage) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

const WS_BASE_URL = __DEV__
  ? 'ws://localhost:8000/ws/translate'
  : 'wss://your-production-server.com/ws/translate';

class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private messageHandler: MessageHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isIntentionalDisconnect = false;

  constructor() {
    this.sessionId = 'mobile_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  connect(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.messageHandler = onMessage;
    this.statusHandler = onStatus;
    this.isIntentionalDisconnect = false;
    this._connect();
  }

  disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.statusHandler?.('disconnected');
  }

  sendAudioChunk(rawData: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'audio_chunk',
        data: rawData,
        sample_rate: 16000,
      }));
      console.log('JSON GONDERILDI boyut:', rawData.length);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private _connect() {
    const url = WS_BASE_URL + '/' + this.sessionId;
    this.statusHandler?.('connecting');
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        console.log('WebSocket baglandi');
        this.reconnectAttempts = 0;
        this.statusHandler?.('connected');
      };
      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          console.log('[WS<]', message.type, message.type === 'translation' ? message.translated?.slice(0, 40) : '');
          this.messageHandler?.(message);
        } catch (e) {
          console.error('Mesaj parse hatasi:', e);
        }
      };
      this.ws.onerror = (error) => {
        console.error('WebSocket hatasi:', error);
        this.statusHandler?.('error');
      };
      this.ws.onclose = () => {
        if (!this.isIntentionalDisconnect) {
          this.reconnectAttempts++;
          if (this.reconnectAttempts <= 5) {
            this.statusHandler?.('connecting');
            this.reconnectTimer = setTimeout(() => this._connect(), 3000 * this.reconnectAttempts);
          } else {
            this.statusHandler?.('error');
          }
        }
      };
    } catch (e) {
      console.error('Baglanti hatasi:', e);
    }
  }
}

export const wsService = new WebSocketService();