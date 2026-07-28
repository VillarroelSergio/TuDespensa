// Código de invitación del piloto: nunca se guarda ni se registra en claro en
// ningún log. Solo se muestra una vez a la propietaria del hogar; a partir de
// ahí solo existe su hash SHA-256, que es lo único que llega a PostgreSQL.

import { createHash, randomInt } from 'node:crypto'

// Base32 de Crockford: sin I, L, O ni U, para que no haya confusión al
// dictar el código en voz alta o teclearlo desde un mensaje de WhatsApp.
export const INVITATION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const CODE_LENGTH = 10

// Mapeo estándar de Crockford para los caracteres que se prestan a confusión
// al teclear el código a mano.
const AMBIGUOUS_CHAR_MAP: Record<string, string> = {
  I: '1',
  L: '1',
  O: '0',
}

export function generateInvitationCode(): string {
  let raw = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    raw +=
      INVITATION_CODE_ALPHABET[randomInt(0, INVITATION_CODE_ALPHABET.length)]
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

export function normalizeInvitationCode(raw: string): string | null {
  const withoutSeparators = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const mapped = withoutSeparators
    .split('')
    .map((char) => AMBIGUOUS_CHAR_MAP[char] ?? char)
    .join('')

  if (mapped.length !== CODE_LENGTH) return null
  if (
    !mapped.split('').every((char) => INVITATION_CODE_ALPHABET.includes(char))
  ) {
    return null
  }
  return mapped
}

export function hashInvitationCode(raw: string): string | null {
  const normalized = normalizeInvitationCode(raw)
  if (normalized === null) return null
  return createHash('sha256').update(normalized).digest('hex')
}
