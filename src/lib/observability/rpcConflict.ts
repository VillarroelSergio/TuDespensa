/**
 * Controlled result returned by versioned RPCs when an old client submits an
 * obsolete item version. It avoids raising an exception (and therefore a
 * rollback) for an expected optimistic-concurrency outcome.
 */
export function isRpcConflictResult(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'conflict'
  )
}
