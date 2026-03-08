import { useState, useRef, useCallback, useEffect } from 'react';
import AudioRecord from 'react-native-audio-record';
import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';

export type RecordingStatus = 'idle' | 'recording' | 'error';
export type AudioMode = 'microphone' | 'system';

interface Props {
  onChunkReady: (base64Audio: string) => void;
  onError?: (error: string) => void;
  onModeChange?: (mode: AudioMode) => void;
}

const SystemAudio = NativeModules.SystemAudio;

// base64 → Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Uint8Array → base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 0.5 saniye @ 16kHz 16-bit mono = 16000 byte
const MIN_CHUNK_BYTES = 16000 * 2 * 0.5;

export function useAudioRecorder({ onChunkReady, onError, onModeChange }: Props) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [audioMode, setAudioMode] = useState<AudioMode>('microphone');
  const [hasProjectionPermission, setHasProjectionPermission] = useState(false);

  const isRecordingRef = useRef(false);
  const onChunkReadyRef = useRef(onChunkReady);
  const pcmBufferRef = useRef<Uint8Array>(new Uint8Array(0));

  useEffect(() => { onChunkReadyRef.current = onChunkReady; }, [onChunkReady]);

  const flushBuffer = useCallback(() => {
    const chunk = pcmBufferRef.current;
    if (chunk.length === 0) return;
    pcmBufferRef.current = new Uint8Array(0);
    onChunkReadyRef.current(bytesToBase64(chunk));
  }, []);

  // Sistem ses event listener (kulaklık modu)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onSystemAudioData', (base64: string) => {
      if (!isRecordingRef.current) return;
      const newBytes = base64ToBytes(base64);
      const merged = new Uint8Array(pcmBufferRef.current.length + newBytes.length);
      merged.set(pcmBufferRef.current);
      merged.set(newBytes, pcmBufferRef.current.length);
      pcmBufferRef.current = merged;

      if (pcmBufferRef.current.length >= MIN_CHUNK_BYTES) {
        flushBuffer();
      }
    });
    return () => sub.remove();
  }, [flushBuffer]);

  /** MediaProjection izni al (kulaklık modu için, tek seferlik) */
  const requestSystemAudioPermission = useCallback(async (): Promise<boolean> => {
    if (!SystemAudio || Platform.OS !== 'android') return false;
    try {
      // Android 14+: MediaProjection tokenı alınmadan ÖNCE mediaProjection tipinde
      // foreground service başlatmak zorunlu. Aksi hâlde uygulama çöküyor.
      if (NativeModules.ForegroundService?.startServiceForProjection) {
        NativeModules.ForegroundService.startServiceForProjection('Ekran yakalama hazırlanıyor...');
        // Servisin başlaması için kısa bekleme
        await new Promise(r => setTimeout(r, 300));
      }
      const granted = await SystemAudio.requestProjectionPermission();
      setHasProjectionPermission(granted);
      return granted;
    } catch (e: any) {
      console.warn('MediaProjection izni reddedildi:', e.message);
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    try {
      isRecordingRef.current = true;
      pcmBufferRef.current = new Uint8Array(0);
      setStatus('recording');

      // YouTube/Instagram/TikTok/Brave/Twitter/Google ALLOW_CAPTURE_BY_NONE ile
      // AudioPlaybackCapture'ı bloke eder. Mikrofon modu her uygulamada çalışır.
      {
        // Mikrofon modu
        setAudioMode('microphone');
        onModeChange?.('microphone');

        AudioRecord.init({
          sampleRate: 16000,
          channels: 1,
          bitsPerSample: 16,
          // audioSource 1 = MIC (ham, işlemsiz)
          // audioSource 6 = VOICE_RECOGNITION: noise suppression hoparlör sesini siliyor
          audioSource: 1,
          wavFile: '',
        });

        AudioRecord.on('data', (data: string) => {
          if (!isRecordingRef.current) return;
          const newBytes = base64ToBytes(data);
          const merged = new Uint8Array(pcmBufferRef.current.length + newBytes.length);
          merged.set(pcmBufferRef.current);
          merged.set(newBytes, pcmBufferRef.current.length);
          pcmBufferRef.current = merged;

          if (pcmBufferRef.current.length >= MIN_CHUNK_BYTES) {
            flushBuffer();
          }
        });

        AudioRecord.start();
        console.log('MİKROFON MODU BAŞLADI');
      }

    } catch (e: any) {
      console.error('Kayıt hatası:', e);
      setStatus('error');
      onError?.(e.message);
    }
  }, [flushBuffer, onModeChange]);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (Platform.OS === 'android' && NativeModules.ForegroundService) {
      NativeModules.ForegroundService.stopService();
    }

    try {
      if (audioMode === 'system' && SystemAudio) {
        await SystemAudio.stopSystemCapture();
      } else {
        await AudioRecord.stop();
      }
    } catch (e) {
      console.error('Stop hatası:', e);
    }

    flushBuffer();
    setStatus('idle');
    setAudioMode('microphone');
  }, [flushBuffer, audioMode]);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        AudioRecord.stop().catch(() => {});
        if (SystemAudio) SystemAudio.stopSystemCapture();
        if (Platform.OS === 'android' && NativeModules.ForegroundService) {
          NativeModules.ForegroundService.stopService();
        }
      }
    };
  }, []);

  return {
    status,
    audioMode,
    hasProjectionPermission,
    startRecording,
    stopRecording,
    requestSystemAudioPermission,
    isRecording: status === 'recording',
  };
}
