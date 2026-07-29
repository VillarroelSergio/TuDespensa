import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'

import './styles.css'

// Servida localmente en vez de por @import de Google Fonts, que bloqueaba el
// primer render (auditoría 2026-07-29).
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'MiDespensa',
    template: '%s | MiDespensa',
  },
  description:
    'Aplicación doméstica para organizar la despensa y la planificación semanal.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', type: 'image/svg+xml' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#f6f6f4',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
