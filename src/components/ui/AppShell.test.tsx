import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AppShell } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('keeps one labelled primary navigation and marks the current destination', () => {
    render(
      <AppShell current="plan">
        <h1>Plan</h1>
      </AppShell>,
    )

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Plan' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('button', { name: 'Cerrar sesión' })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
  })
})
