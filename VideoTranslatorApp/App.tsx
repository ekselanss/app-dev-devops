import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { TranslatorScreen } from './src/screens/TranslatorScreen';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  return (
    <SafeAreaProvider>
      {loggedIn ? (
        <TranslatorScreen />
      ) : (
        <LoginScreen onLogin={() => setLoggedIn(true)} />
      )}
    </SafeAreaProvider>
  );
}
