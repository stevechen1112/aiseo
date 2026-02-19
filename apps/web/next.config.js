/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aiseo/core'],
  allowedDevOrigins: ['127.0.0.1'],
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ensure standalone output is traced relative to the repo root (not an inferred workspace root).
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  async rewrites() {
    const apiBaseUrl = process.env.AISEO_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
