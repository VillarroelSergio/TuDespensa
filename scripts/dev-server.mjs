import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const modes = new Set(process.argv.slice(2))
const env = { ...process.env }

function loadLocalSupabaseEnvironment(targetEnv) {
  const file = resolve(process.cwd(), '.env.test.local')
  let contents
  try {
    contents = readFileSync(file, 'utf8')
  } catch {
    throw new Error(
      'No se encuentra ' +
        file +
        '. Copia las credenciales de Supabase local en .env.test.local antes de usar --auth.',
    )
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*)\s*$/,
    )
    if (!match) continue
    targetEnv[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

if (modes.has('--auth')) {
  // .env.local suele apuntar al proyecto remoto de Vercel. La cuenta admin
  // sintética solo existe en el seed de Supabase local, así que --auth debe
  // aislarse de esas credenciales aunque Next anuncie .env.local.
  loadLocalSupabaseEnvironment(env)
  env.NEXT_PUBLIC_DEV_AUTH_ENABLED = 'true'
  env.NEXT_PUBLIC_E2E_AUTH_ENABLED = 'false'
  env.NEXT_PUBLIC_DEMO_FIXTURES = 'false'
}
if (modes.has('--demo')) {
  env.NEXT_PUBLIC_E2E_AUTH_ENABLED = 'false'
  env.NEXT_PUBLIC_DEMO_FIXTURES = 'true'
}

const nextArgs = ['node_modules/next/dist/bin/next', 'dev']
// Escucha fuera de localhost solo cuando se solicita para revisar en la red local.
if (modes.has('--mobile')) nextArgs.push('--hostname', '0.0.0.0')

const child = spawn(
  process.execPath,
  nextArgs,
  { env, stdio: 'inherit', windowsHide: true },
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
