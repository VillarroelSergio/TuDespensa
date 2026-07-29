import { AppError } from '@/lib/errors/AppError'

// Estos fallos son entrada inválida del usuario, no errores inesperados: van
// como AppError('INVALID_INPUT') para no romper el contrato de errores tipados
// que sigue el resto de la app (auditoría 2026-07-29).
function invalid(message: string): never {
  throw new AppError('INVALID_INPUT', message)
}

const HOUSEHOLD_NAME_MAX_LENGTH = 80
const PERSON_NAME_MAX_LENGTH = 80
const FOOD_NAME_MAX_LENGTH = 120
const RECIPE_TITLE_MAX_LENGTH = 160
const PEOPLE_MAX_COUNT = 10
const IDEMPOTENCY_KEY_MIN_LENGTH = 8
const IDEMPOTENCY_KEY_MAX_LENGTH = 120

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function parseBoundedText(
  value: string,
  fieldName: string,
  maxLength: number,
): string {
  const normalized = normalizeText(value)

  if (normalized.length === 0 || normalized.length > maxLength) {
    invalid(`${fieldName} must contain between 1 and ${maxLength} characters`)
  }

  return normalized
}

export function parseHouseholdName(value: string): string {
  return parseBoundedText(value, 'household name', HOUSEHOLD_NAME_MAX_LENGTH)
}

export function parsePeople(values: readonly string[]): string[] {
  if (values.length > PEOPLE_MAX_COUNT) {
    invalid(`people must contain at most ${PEOPLE_MAX_COUNT} entries`)
  }

  const people = values.map((value) =>
    parseBoundedText(value, 'person name', PERSON_NAME_MAX_LENGTH),
  )
  const normalizedNames = new Set(
    people.map((person) => person.toLocaleLowerCase('es')),
  )

  if (normalizedNames.size !== people.length) {
    invalid('people must not contain duplicate names')
  }

  return people
}

export function parseFoodName(value: string): string {
  return parseBoundedText(value, 'food name', FOOD_NAME_MAX_LENGTH)
}

export function parseRecipeTitle(value: string): string {
  return parseBoundedText(value, 'recipe title', RECIPE_TITLE_MAX_LENGTH)
}

export function parseIdempotencyKey(value: string): string {
  if (
    value.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    value.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    invalid(
      `idempotency key must contain ${IDEMPOTENCY_KEY_MIN_LENGTH}-${IDEMPOTENCY_KEY_MAX_LENGTH} safe characters`,
    )
  }

  return value
}
