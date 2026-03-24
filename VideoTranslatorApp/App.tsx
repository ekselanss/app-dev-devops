import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LiveTranslationScreen } from './src/screens/LiveTranslationScreen';
import { TokenShopScreen } from './src/screens/TokenShopScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { TranslatorScreen } from './src/screens/TranslatorScreen';

// All possible screens
type ScreenName = 'Onboarding' | 'Home' | 'LiveTranslation' | 'TokenShop' | 'Profile' | 'History' | 'Translator';

// Bottom tab definitions (shown after onboarding)
const TABS: { screen: ScreenName; icon: string; label: string }[] = [
  { screen: 'Home', icon: '🏠', label: 'Ana Sayfa' },
  { screen: 'LiveTranslation', icon: '▶', label: 'Canlı' },
  { screen: 'TokenShop', icon: '🪙', label: 'Token' },
  { screen: 'Profile', icon: '👤', label: 'Profil' },
];

const ACCENT = '#6c63ff';
const MUTED = '#6b6b8a';
const BG_NAV = 'rgba(13,13,20,0.97)';
const NAV_BORDER = 'rgba(108,99,255,0.15)';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('Onboarding');

  const navigate = (screen: string) => {
    setCurrentScreen(screen as ScreenName);
  };

  const showTabs = currentScreen !== 'Onboarding';
  // LiveTranslation is a full-screen overlay — hide bottom tabs when active
  const hideTabs = currentScreen === 'LiveTranslation';

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Onboarding':
        return <OnboardingScreen navigate={navigate} />;
      case 'Home':
        return <HomeScreen navigate={navigate} />;
      case 'LiveTranslation':
        return <LiveTranslationScreen navigate={navigate} />;
      case 'TokenShop':
        return <TokenShopScreen navigate={navigate} />;
      case 'Profile':
        return <ProfileScreen navigate={navigate} />;
      case 'History':
        return <HistoryScreen navigate={navigate} />;
      case 'Translator':
        return <TranslatorScreen navigate={navigate} />;
      default:
        return <HomeScreen navigate={navigate} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {/* Main screen content */}
        <View style={styles.screenContainer}>
          {renderScreen()}
        </View>

        {/* Bottom tab bar — only shown after onboarding, hidden on LiveTranslation */}
        {showTabs && !hideTabs && (
          <SafeAreaView edges={['bottom']} style={styles.bottomNav}>
            {TABS.map((tab) => {
              const isActive = currentScreen === tab.screen;
              const isCenter = tab.screen === 'LiveTranslation';
              return (
                <TouchableOpacity
                  key={tab.screen}
                  style={[styles.navItem, isCenter && styles.navItemCenter]}
                  onPress={() => navigate(tab.screen)}
                  activeOpacity={0.7}
                >
                  {isCenter ? (
                    <View style={styles.navCenterBtn}>
                      <Text style={styles.navCenterIcon}>{tab.icon}</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.navIcon}>{tab.icon}</Text>
                      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                        {tab.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  screenContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: BG_NAV,
    borderTopWidth: 1,
    borderTopColor: NAV_BORDER,
    paddingTop: 8,
    paddingBottom: 4,
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingBottom: 4,
  },
  navItemCenter: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  navCenterBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  navCenterIcon: {
    fontSize: 22,
    color: '#fff',
  },
  navIcon: {
    fontSize: 20,
  },
  navLabel: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '600',
  },
  navLabelActive: {
    color: ACCENT,
  },
});
