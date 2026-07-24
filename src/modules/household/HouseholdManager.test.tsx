import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on() {
        return this
      },
      subscribe: () => ({}),
    }),
    removeChannel: vi.fn(),
  }),
}))
vi.mock('./actions', () => ({
  inviteMember: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}))

import { HouseholdManager } from './HouseholdManager'

describe('HouseholdManager', () => {
  it('shows every active account separately from pending invitations', () => {
    render(
      <HouseholdManager
        data={{
          isOwner: true,
          householdName: 'Casa de pruebas',
          activeMemberCount: 2,
          activeMembers: [
            { id: 'owner', label: 'Tú', role: 'owner' },
            { id: 'member', label: 'invitada@example.com', role: 'member' },
          ],
          pendingInvitations: [{ id: 'pending', email: 'pendiente@example.com' }],
        }}
      />,
    )

    expect(screen.getByText('Cuentas con acceso')).toBeInTheDocument()
    expect(screen.getByText('Tú')).toBeInTheDocument()
    expect(screen.getByText('invitada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Propietaria')).toBeInTheDocument()
    expect(screen.getByText('Integrante')).toBeInTheDocument()
    expect(screen.getByText('Invitaciones pendientes')).toBeInTheDocument()
    expect(screen.getByText('pendiente@example.com')).toBeInTheDocument()
  })
})
