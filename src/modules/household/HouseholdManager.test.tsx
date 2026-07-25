import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace }),
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
vi.mock('@/modules/auth/device-verification', () => ({
  revokeTrustedBrowsers: vi.fn(),
}))

import { revokeTrustedBrowsers } from '@/modules/auth/device-verification'

import { HouseholdManager } from './HouseholdManager'

const baseData = {
  isOwner: true,
  householdName: 'Casa de pruebas',
  activeMemberCount: 2,
  activeMembers: [
    { id: 'owner', label: 'Tú', role: 'owner' as const },
    { id: 'member', label: 'invitada@example.com', role: 'member' as const },
  ],
  pendingInvitations: [{ id: 'pending', email: 'pendiente@example.com' }],
}

describe('HouseholdManager', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows every active account separately from pending invitations', () => {
    render(<HouseholdManager data={baseData} />)

    expect(screen.getByText('Cuentas con acceso')).toBeInTheDocument()
    expect(screen.getByText('Tú')).toBeInTheDocument()
    expect(screen.getByText('invitada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Propietaria')).toBeInTheDocument()
    expect(screen.getByText('Integrante')).toBeInTheDocument()
    expect(screen.getByText('Invitaciones pendientes')).toBeInTheDocument()
    expect(screen.getByText('pendiente@example.com')).toBeInTheDocument()
  })

  it('revokes trusted browsers and redirects to login on success', async () => {
    vi.mocked(revokeTrustedBrowsers).mockResolvedValue(undefined)
    render(<HouseholdManager data={baseData} />)

    fireEvent.click(screen.getByText('Cerrar la confianza de mis navegadores'))

    await waitFor(() => expect(revokeTrustedBrowsers).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.getByText('Hemos retirado la confianza de tus navegadores.'),
      ).toBeInTheDocument(),
    )
    expect(replace).toHaveBeenCalledWith('/login')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an error message when revoking trusted browsers fails', async () => {
    vi.mocked(revokeTrustedBrowsers).mockRejectedValue(new Error('boom'))
    render(<HouseholdManager data={baseData} />)

    fireEvent.click(screen.getByText('Cerrar la confianza de mis navegadores'))

    await waitFor(() =>
      expect(
        screen.getByText('No hemos podido retirar los navegadores confiables.'),
      ).toBeInTheDocument(),
    )
    expect(replace).not.toHaveBeenCalled()
  })
})
