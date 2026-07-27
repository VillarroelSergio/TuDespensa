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
    auth: { signOut: vi.fn() },
  }),
}))
vi.mock('./actions', () => ({
  claimHouseholdPerson: vi.fn(),
  createInvitationCode: vi.fn(),
  resetPilotHousehold: vi.fn(),
  revokeInvitation: vi.fn(),
}))

import { claimHouseholdPerson, createInvitationCode } from './actions'

import { HouseholdManager } from './HouseholdManager'

const baseData = {
  isOwner: true,
  householdName: 'Casa de pruebas',
  activeMemberCount: 1,
  activeMembers: [
    { id: 'owner', label: 'Tú', role: 'owner' as const, isSelf: true },
  ],
  pendingInvitations: [
    { id: 'pending', expiresAt: '2026-08-02T00:00:00.000Z' },
  ],
  needsNameClaim: false,
  unclaimedPeople: [],
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
    expect(screen.getByText('Propietaria')).toBeInTheDocument()
    expect(screen.getByText('Invitaciones pendientes')).toBeInTheDocument()
    expect(screen.getByText(/Código pendiente · caduca el/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Borrar hogar y cuentas de prueba' }),
    ).toBeDisabled()
  })

  it('requires the explicit confirmation before enabling the pilot reset', () => {
    render(<HouseholdManager data={baseData} />)

    const button = screen.getByRole('button', {
      name: 'Borrar hogar y cuentas de prueba',
    })
    fireEvent.change(screen.getByLabelText('Escribe BORRAR para continuar'), {
      target: { value: 'BORRAR' },
    })

    expect(button).toBeEnabled()
  })

  it('generates an invitation code and shows it on screen', async () => {
    vi.mocked(createInvitationCode).mockResolvedValue({
      code: 'ABCDE-F2345',
      expiresAt: '2026-08-02T00:00:00.000Z',
    })
    render(<HouseholdManager data={baseData} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Generar código de invitación' }),
    )

    await waitFor(() =>
      expect(screen.getByText('ABCDE-F2345')).toBeInTheDocument(),
    )
    expect(
      screen.getByText(/Dale este código a la otra persona/),
    ).toBeInTheDocument()
  })

  it('disables generating a code when the household is already full', () => {
    render(
      <HouseholdManager
        data={{
          ...baseData,
          activeMemberCount: 2,
          activeMembers: [
            { id: 'owner', label: 'Tú', role: 'owner' as const, isSelf: true },
            {
              id: 'member',
              label: 'Integrante del hogar',
              role: 'member' as const,
              isSelf: false,
            },
          ],
        }}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Generar código de invitación',
    })
    expect(button).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)
    expect(createInvitationCode).not.toHaveBeenCalled()
  })

  it('lets an unclaimed account pick its name from the onboarding list', async () => {
    vi.mocked(claimHouseholdPerson).mockResolvedValue(undefined)
    render(
      <HouseholdManager
        data={{
          ...baseData,
          needsNameClaim: true,
          unclaimedPeople: [{ id: 'person-1', name: 'María' }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'María' }))

    await waitFor(() =>
      expect(claimHouseholdPerson).toHaveBeenCalledWith({
        personId: 'person-1',
      }),
    )
  })
})
