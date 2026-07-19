function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getPublicSupabaseEnvironment() {
  return {
    url: requireEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnvironmentVariable('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function getServiceRoleEnvironment() {
  return {
    url: requireEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: requireEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
  }
}
