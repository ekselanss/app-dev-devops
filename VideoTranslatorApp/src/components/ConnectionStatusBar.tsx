/**
 * ConnectionStatusBar
 * Ekranın üstünde WebSocket bağlantı durumunu gösterir.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

interface ConnectionStatusBarProps {
  status: Status;
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: string }> = {
  connecting: { label: 'Bağlanıyor...', color: '#FF9800', icon: '⟳' },
  connected:  { label: 'Bağlı',        color: '#4CAF50', icon: '●' },
  disconnected:{ label: 'Bağlantı Yok',color: '#9E9E9E', icon: '○' },
  error:      { label: 'Bağlantı Hatası', color: '#F44336', icon: '✕' },
};

export function ConnectionStatusBar({ status }: ConnectionStatusBarProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const config = STATUS_CONFIG[status];

  // Bağlanıyor animasyonu
  useEffect(() => {
    if (status === 'connecting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  return (
    <View style={[styles.container, { backgroundColor: config.color + '22' }]}>
      <Animated.Text style={[styles.icon, { color: config.color, opacity: pulseAnim }]}>
        {config.icon}
      </Animated.Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'center',
  },
  icon: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});