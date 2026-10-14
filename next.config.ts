import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '',
  trailingSlash: true,
  // Static export: buradaki env dəyişənləri build zamanı KLIENT bundle-ına yazılır.
  // TƏHLÜKƏSİZLİK: serverSecret bu bloka heç vaxt əlavə edilməməlidir — o, token
  // imzalama açarıdır və yalnız serverdə (server.js / Cloud Function) qalmalıdır.
  env: {
    NEXT_PUBLIC_ZEGO_APP_ID:
      process.env.NEXT_PUBLIC_ZEGO_APP_ID ?? process.env.ZEGO_APP_ID ?? '',
    NEXT_PUBLIC_ZEGO_APP_SIGN:
      process.env.NEXT_PUBLIC_ZEGO_APP_SIGN ?? process.env.ZEGO_APP_SIGN ?? '',
  },
};

export default nextConfig;