import { execFileSync } from 'node:child_process'

// Un intento de e2e anterior interrumpido a la fuerza (Ctrl+C fallido, proceso
// matado desde el gestor de tareas del agente) puede dejar `next dev` o el
// test-server de Playwright vivos, ocupando el puerto. La siguiente ejecución
// entonces se queda colgada esperando un servidor que nunca arranca. Se libera
// el puerto antes de lanzar nada nuevo.
export function freeE2EPort(port) {
  if (process.platform === 'win32') {
    let output = ''
    try {
      output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
    } catch {
      return
    }
    const pids = new Set()
    for (const line of output.split('\n')) {
      if (!line.includes(`:${port} `) && !line.includes(`:${port}\r`)) continue
      const match = line.trim().match(/(\d+)$/)
      if (match) pids.add(match[1])
    }
    for (const pid of pids) {
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', pid])
      } catch {
        // El proceso ya no existe o no se pudo matar: seguimos con el resto.
      }
    }
    return
  }
  try {
    const pids = execFileSync('lsof', ['-ti', `tcp:${port}`], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
    for (const pid of pids) {
      try {
        execFileSync('kill', ['-9', pid])
      } catch {
        // El proceso ya no existe o no se pudo matar: seguimos con el resto.
      }
    }
  } catch {
    // Nada escuchando en el puerto: no hay nada que limpiar.
  }
}
