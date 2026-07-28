import { spawnSync } from 'node:child_process'

// Puertos del stack local declarados en supabase/config.toml (api, db, shadow,
// studio, smtp, analytics). Si un arranque anterior no se cerró, quedan ocupados
// y `supabase start` aborta con "port is already allocated".
const SUPABASE_PORTS = [57320, 57321, 57322, 57323, 57324, 57327, 57329]

const run = (args, opts = {}) =>
  spawnSync('npx', args, { stdio: 'inherit', shell: true, ...opts })

const capture = (cmd) =>
  spawnSync(cmd, { shell: true, encoding: 'utf8' }).stdout ?? ''

// ponytail: mata lo que escuche en el puerto; suficiente para tooling de dev
// local. Si algún día conviene solo matar procesos de Supabase, filtrar por nombre.
function freePort(port) {
  if (process.platform === 'win32') {
    const rows = capture(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`)
    const pids = [...new Set(
      rows.trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).pop()).filter(Boolean),
    )]
    for (const pid of pids) spawnSync(`taskkill /PID ${pid} /F`, { shell: true })
  } else {
    spawnSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { shell: true })
  }
}

// Primero el cierre limpio (para los contenedores de Supabase); luego libera a la
// fuerza cualquier puerto que siga ocupado por un proceso colgado.
console.log('› Cerrando el stack anterior y liberando puertos…')
run(['supabase', 'stop'])
for (const port of SUPABASE_PORTS) freePort(port)

const { status } = run(['supabase', 'start'])
process.exit(status ?? 0)
