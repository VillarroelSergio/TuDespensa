type RandomUuid = () => string

export function createIdempotencyKey(
  operation: string,
  randomUuid: RandomUuid = () => crypto.randomUUID(),
): string {
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(operation)) {
    throw new Error(
      'operation must be a safe snake_case identifier of at most 40 characters',
    )
  }

  return `${operation}:${randomUuid()}`
}
