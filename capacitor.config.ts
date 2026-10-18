import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID ?? 'com.example.app',
  appName: 'GESBX',
  webDir: 'out',
  loggingBehavior: 'production',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'gesbx.vercel.app',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.google.com',
      '*.googleusercontent.com',
      '*.firebasestorage.app',
      '*.cloudfunctions.net',
      '*.zegocloud.com',
      '*.zego.im',
    ],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#020617',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: '#020617',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    appendUserAgent: ' GesbxNative/1.1',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
      overlaysWebView: false,
    },
  },
};

export default config;
