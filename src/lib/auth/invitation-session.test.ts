import { describe, expect, it, vi } from 'vitest'

import { persistInvitationSession } from './invitation-session'

describe('persistInvitationSession', () => {
  it('copies the session obtained from an invitation link into the SSR cookie client', async () => {
    const session = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    }
    const setSession = vi.fn().mockResolvedValue({ error: null })

    await expect(
      persistInvitationSession(
        session as never,
        { auth: { setSession } } as never,
      ),
    ).resolves.toBeUndefined()

    expect(setSession).toHaveBeenCalledWith(session)
  })

  it('reports an error when the SSR cookie client cannot persist the session', async () => {
    const setSession = vi.fn().mockResolvedValue({
      error: new Error('cookie write failed'),
    })

    await expect(
      persistInvitationSession(
        { access_token: 'access-token', refresh_token: 'refresh-token' } as never,
        { auth: { setSession } } as never,
      ),
    ).rejects.toThrow('cookie write failed')
  })
})
