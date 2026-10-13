import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Yolüstü',
  webDir: 'out',
  loggingBehavior: 'production',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'yolustu.vercel.app',
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
    appendUserAgent: ' YolustuNative/1.1',
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
