import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '',
  trailingSlash: true,
  // Static export: env dəyişənləri build zamanı klient bundle-a yazılır (Vercel-də deploy əvvəl təyin edilməlidir)
  env: {
    NEXT_PUBLIC_ZEGO_APP_ID:
      process.env.NEXT_PUBLIC_ZEGO_APP_ID ?? process.env.ZEGO_APP_ID ?? '',
    NEXT_PUBLIC_ZEGO_APP_SIGN:
      process.env.NEXT_PUBLIC_ZEGO_APP_SIGN ?? process.env.ZEGO_APP_SIGN ?? '',
    ZEGO_APP_SIGN:
      process.env.ZEGO_APP_SIGN ?? process.env.NEXT_PUBLIC_ZEGO_APP_SIGN ?? '',
    ZEGO_SERVER_SECRET:
      process.env.ZEGO_SERVER_SECRET ?? process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET ?? '',
  },
};

export default nextConfig;