import { spawn } from 'node:child_process'

const modes = new Set(process.argv.slice(2))
const env = { ...process.env }

if (modes.has('--auth')) env.NEXT_PUBLIC_DEV_AUTH_ENABLED = 'true'
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
