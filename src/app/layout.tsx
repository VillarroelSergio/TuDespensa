import type { Metadata, Viewport } from 'next'

import './styles.css'

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
  themeColor: '#f6f1e8',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
