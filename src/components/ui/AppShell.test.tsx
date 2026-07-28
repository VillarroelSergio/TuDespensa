import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AppShell } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('keeps one labelled primary navigation and marks the current destination', () => {
    const { container } = render(
      <AppShell current="plan">
        <h1>Plan</h1>
      </AppShell>,
    )

    expect(screen.getByRole('navigation', { name: /^Navegaci.n principal$/ })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Plan' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.queryAllByRole('button', { name: /Cerrar sesi.n/ })).toHaveLength(0)
    expect(container.querySelectorAll('.app-shell__dock svg')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
  })

  it('renders sign out only in Hogar', () => {
    const { container } = render(
      <AppShell current="hogar">
        <h1>Hogar</h1>
      </AppShell>,
    )

    expect(screen.getAllByRole('button', { name: /Cerrar sesi.n/ })).toHaveLength(2)
    expect(container.querySelectorAll('.app-shell__dock svg')).toHaveLength(5)
  })
})
