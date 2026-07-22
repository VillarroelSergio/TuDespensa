import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright starts its own authenticated dev server while a manual `next
  // dev` may already own `.next`. Keeping its build output separate prevents
  // Next's single-dev-server lock from making E2E unavailable.
  distDir: process.env.E2E_AUTH_ENABLED === 'true' ? '.next-e2e' : '.next',
  // Dev-only: E2E and local tooling reach the dev server via 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
