// NEXT_PUBLIC_* values must be read as static property accesses so Next.js can
// inline them into the client bundle; process.env[name] stays undefined there.
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getPublicSupabaseEnvironment() {
  return {
    url: required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function getServiceRoleEnvironment() {
  return {
    url: required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
  }
}
