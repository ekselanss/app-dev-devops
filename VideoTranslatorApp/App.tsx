import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TranslatorScreen } from './src/screens/TranslatorScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <TranslatorScreen />
    </SafeAreaProvider>
  );
}
