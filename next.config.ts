import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Dev-only: E2E and local tooling reach the dev server via 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
