import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["*"]
    }
  },
  serverExternalPackages: ["@react-pdf/renderer", "@sparticuz/chromium", "puppeteer-core"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bamlo.com',
      },
    ],
  },
};

export default nextConfig;
