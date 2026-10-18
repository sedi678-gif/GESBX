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
};

export default nextConfig;
