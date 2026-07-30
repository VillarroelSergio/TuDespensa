import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const mobileDevOrigin = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

const isDev = process.env.NODE_ENV === 'development'

// Supabase necesita HTTPS para PostgREST/Auth y WSS para Realtime. Se derivan
// del mismo origen configurado para no tener que mantener dos listas.
const supabaseOrigins = supabaseUrl
  ? [supabaseUrl, supabaseUrl.replace(/^http/, 'ws')]
  : []

// CSP mínima que la app cumple hoy (auditoría 2026-07-29). Next inyecta scripts
// y estilos en línea sin nonce, de ahí 'unsafe-inline'; endurecerlo exigiría
// generar un nonce por petición en proxy.ts. En desarrollo se añaden
// 'unsafe-eval' y websockets porque HMR los necesita.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins.join(' ')}${isDev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .join('; ')
  .replace(/\s+/g, ' ')
  .trim()

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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Solo tiene efecto sobre HTTPS, así que es inocuo en local.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
