import './globals.css';
import type { Metadata, Viewport } from 'next';
import { UserProvider } from '@/context/UserContext';
import { SettingsProvider } from '@/context/SettingsContext';
import AppBrainProvider from '@/app/components/AppBrainProvider';
import AppShell from '@/app/components/AppShell';
import { ThemeInitScript } from '@/app/components/ThemeInitScript';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#020617',
};

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Yolüstü',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="az" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeInitScript />
        <UserProvider>
          <SettingsProvider>
            <AppBrainProvider>
              <AppShell>{children}</AppShell>
            </AppBrainProvider>
          </SettingsProvider>
        </UserProvider>
        <div id="call-overlay-root" aria-hidden="true" />
      </body>
    </html>
  );
}