import type { NextConfig } from 'next'

const mobileDevOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright starts its own authenticated dev server while a manual `next
  // dev` may already own `.next`. Keeping its build output separate prevents
  // Next's single-dev-server lock from making E2E unavailable.
  distDir: process.env.E2E_AUTH_ENABLED === 'true' ? '.next-e2e' : '.next',
  // Dev-only: E2E reaches the server through loopback; a phone on the private
  // network needs its current LAN host for React hydration and HMR.
  allowedDevOrigins: [
    '127.0.0.1',
    ...(mobileDevOrigin ? [mobileDevOrigin] : []),
  ],
}

export default nextConfig
