/**
 * Mikrofon izni yönetimi (Android + iOS)
 */

import { Platform, Alert } from 'react-native';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';

export async function requestMicrophonePermission(): Promise<boolean> {
  const permission = Platform.OS === 'ios'
    ? PERMISSIONS.IOS.MICROPHONE
    : PERMISSIONS.ANDROID.RECORD_AUDIO;

  // Mevcut durumu kontrol et
  const status = await check(permission);

  if (status === RESULTS.GRANTED) {
    return true;
  }

  if (status === RESULTS.DENIED) {
    // İzin iste
    const result = await request(permission);
    return result === RESULTS.GRANTED;
  }

  if (status === RESULTS.BLOCKED) {
    // Kullanıcı kalıcı olarak reddetti, ayarlara yönlendir
    Alert.alert(
      'Mikrofon İzni Gerekli',
      'Video çevirisi için mikrofon erişimine ihtiyaç duyulur. Ayarlardan izin verebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayarları Aç', onPress: openSettings },
      ]
    );
    return false;
  }

  return false;
}