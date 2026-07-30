import Link from 'next/link'
import type { ReactNode, SVGProps } from 'react'

import { SignOutButton } from './SignOutButton'

type IconName = 'plan' | 'recipes' | 'shopping' | 'pantry' | 'home'

const destinations = [
  { id: 'plan', href: '/plan', label: 'Plan', icon: 'plan' },
  { id: 'recetas', href: '/recetas', label: 'Recetas', icon: 'recipes' },
  { id: 'compra', href: '/compra', label: 'Compra', icon: 'shopping' },
  { id: 'despensa', href: '/despensa', label: 'Despensa', icon: 'pantry' },
  { id: 'hogar', href: '/hogar', label: 'Hogar', icon: 'home' },
] as const

type Destination = (typeof destinations)[number]['id']

function NavigationIcon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>
      {name === 'plan' ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3.5v3M16 3.5v3M4 9.5h16M8 13h3M13 13h3M8 16.5h3" />
        </>
      ) : null}
      {name === 'recipes' ? (
        <>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z" />
          <path d="M5 5.5v16M9 7h6M9 10h6M9 13h4" />
        </>
      ) : null}
      {name === 'shopping' ? (
        <>
          <path d="M7 8h13l-1 11H6L5 5H2.5" />
          <path d="M9 8a4 4 0 0 0 8 0M9 12h.01M13 12h.01M17 12h.01" />
        </>
      ) : null}
      {name === 'pantry' ? (
        <>
          <path d="M4 8h16v12H4zM3 8l2-4h14l2 4M8 12h8M8 16h8" />
        </>
      ) : null}
      {name === 'home' ? (
        <>
          <path d="m3.5 10.5 8.5-7 8.5 7M5.5 9v11h13V9M9 20v-6h6v6" />
        </>
      ) : null}
    </svg>
  )
}

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
          <span className="app-shell__nav-icon">
            <NavigationIcon name={destination.icon} />
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
    // El contenido es <main> y la navegación queda fuera de él: antes el raíl,
    // el dock y el contenido vivían dentro de un único <main>, así que con un
    // lector de pantalla no había forma de saltar de la navegación al
    // contenido. El enlace de salto es lo primero que recibe el foco (2.4.1).
    <div className={`app-shell app-shell--${current}`}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="app-shell__rail">
        <Link className="app-shell__brand" href="/plan">
          <span aria-hidden="true" className="app-shell__brand-mark">
            M
          </span>
          <span>MiDespensa</span>
        </Link>
        <AppNavigation className="app-shell__rail-nav" current={current} />
        {current === 'hogar' ? (
          <SignOutButton className="app-shell__sign-out" />
        ) : null}
      </aside>
      <main
        className={`app-shell__content ${contentClassName}`}
        id="contenido"
        tabIndex={-1}
      >
        {children}
      </main>
      <AppNavigation
        className="app-shell__dock"
        current={current}
        label="Navegación principal móvil"
      />
      {current === 'hogar' ? (
        <SignOutButton className="app-shell__sign-out-mobile" />
      ) : null}
    </div>
  )
}
