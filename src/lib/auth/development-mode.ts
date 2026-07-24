export function isDevelopmentAuthBypassEnabled(
  nodeEnv: string | undefined,
  e2eAuthEnabled: string | undefined,
  devAuthEnabled: string | undefined = process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
) {
  return (
    nodeEnv === 'development' &&
    e2eAuthEnabled !== 'true' &&
    devAuthEnabled !== 'true'
  )
}

/** The persistent local account is never available in test or production. */
export function isDevelopmentAccountEnabled(
  nodeEnv: string | undefined,
  devAuthEnabled: string | undefined = process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
) {
  return nodeEnv === 'development' && devAuthEnabled === 'true'
}
