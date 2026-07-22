export function isDevelopmentAuthBypassEnabled(
  nodeEnv: string | undefined,
  e2eAuthEnabled: string | undefined,
) {
  return nodeEnv === 'development' && e2eAuthEnabled !== 'true'
}
