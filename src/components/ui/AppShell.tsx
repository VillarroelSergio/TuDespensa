import Link from 'next/link'
import type { ReactNode } from 'react'

import { SignOutButton } from './SignOutButton'

const destinations = [
  { id: 'plan', href: '/plan', label: 'Plan', icon: '⌂' },
  { id: 'recetas', href: '/recetas', label: 'Recetas', icon: '⌘' },
  { id: 'compra', href: '/compra', label: 'Compra', icon: '◌' },
  { id: 'despensa', href: '/despensa', label: 'Despensa', icon: '□' },
  { id: 'hogar', href: '/hogar', label: 'Hogar', icon: '⌂' },
] as const

type Destination = (typeof destinations)[number]['id']

function AppNavigation({
  current,
  className,
  label = 'Navegación principal',
}: {
  current: Destination
  className: string
  label?: string
}) {
  return (
    <nav className={className} aria-label={label}>
      {destinations.map((destination) => (
        <Link
          aria-current={destination.id === current ? 'page' : undefined}
          href={destination.href}
          key={destination.id}
        >
          <span aria-hidden="true" className="app-shell__nav-icon">
            {destination.icon}
          </span>
          <span>{destination.label}</span>
        </Link>
      ))}
    </nav>
  )
}

export function AppShell({
  children,
  current,
  contentClassName = '',
}: {
  children: ReactNode
  current: Destination
  contentClassName?: string
}) {
  return (
    <main className={`app-shell app-shell--${current}`}>
      <aside className="app-shell__rail">
        <Link className="app-shell__brand" href="/plan">
          <span aria-hidden="true" className="app-shell__brand-mark">
            M
          </span>
          <span>MiDespensa</span>
        </Link>
        <AppNavigation className="app-shell__rail-nav" current={current} />
        <SignOutButton className="app-shell__sign-out" />
      </aside>
      <section className={`app-shell__content ${contentClassName}`}>
        {children}
      </section>
      <AppNavigation
        className="app-shell__dock"
        current={current}
        label="Navegación principal móvil"
      />
      <SignOutButton className="app-shell__sign-out-mobile" />
    </main>
  )
}
