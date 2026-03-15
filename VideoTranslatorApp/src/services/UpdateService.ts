/**
 * UpdateService
 * GitHub Releases'dan güncelleme kontrolü.
 * ekselanss/app-dev-devops reposundan latest release'i çeker.
 */

import { Alert, Linking, Platform } from 'react-native';

const GITHUB_OWNER = 'ekselanss';
const GITHUB_REPO = 'app-dev-devops';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// Mevcut uygulama versiyonu (build.gradle ile eşleşmeli)
const CURRENT_VERSION = '1.1.0';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string | null;
  changelog: string;
  isRequired: boolean;
}

/**
 * Versiyon karşılaştırma: "1.2.0" > "1.1.0" → true
 */
function isNewer(remote: string, local: string): boolean {
  const r = remote.replace(/^v/, '').split('.').map(Number);
  const l = local.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

/**
 * GitHub Releases'dan güncelleme kontrol et.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const noUpdate: UpdateInfo = {
    hasUpdate: false,
    latestVersion: CURRENT_VERSION,
    currentVersion: CURRENT_VERSION,
    downloadUrl: null,
    changelog: '',
    isRequired: false,
  };

  try {
    const response = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
      console.log('[Update] GitHub API hatası:', response.status);
      return noUpdate;
    }

    const release = await response.json();
    const latestVersion = (release.tag_name || '').replace(/^v/, '');

    if (!latestVersion || !isNewer(latestVersion, CURRENT_VERSION)) {
      return noUpdate;
    }

    // APK dosyasını bul (assets içinde .apk uzantılı)
    const apkAsset = (release.assets || []).find(
      (a: any) => a.name?.endsWith('.apk')
    );

    const changelog = release.body || '';
    // Changelog'da [REQUIRED] varsa zorunlu güncelleme
    const isRequired = changelog.includes('[REQUIRED]');

    return {
      hasUpdate: true,
      latestVersion,
      currentVersion: CURRENT_VERSION,
      downloadUrl: apkAsset?.browser_download_url || null,
      changelog: changelog.replace('[REQUIRED]', '').trim(),
      isRequired,
    };
  } catch (error) {
    console.log('[Update] Kontrol hatası:', error);
    return noUpdate;
  }
}

/**
 * Güncelleme dialogu göster.
 */
export function showUpdateDialog(info: UpdateInfo): void {
  if (!info.hasUpdate) return;

  const buttons: any[] = [];

  if (!info.isRequired) {
    buttons.push({ text: 'Sonra', style: 'cancel' });
  }

  buttons.push({
    text: 'Guncelle',
    onPress: () => {
      if (info.downloadUrl) {
        Linking.openURL(info.downloadUrl);
      }
    },
  });

  const changelogPreview = info.changelog
    ? `\n\nYenilikler:\n${info.changelog.slice(0, 200)}`
    : '';

  Alert.alert(
    `Guncelleme Mevcut v${info.latestVersion}`,
    `Mevcut: v${info.currentVersion}\n` +
    `Yeni: v${info.latestVersion}` +
    changelogPreview +
    (info.isRequired ? '\n\nBu guncelleme zorunludur.' : ''),
    buttons,
    { cancelable: !info.isRequired }
  );
}

/**
 * Tek satırda çağır: kontrol et + dialog göster
 */
export async function checkAndPromptUpdate(): Promise<void> {
  const info = await checkForUpdate();
  if (info.hasUpdate) {
    showUpdateDialog(info);
  }
}
