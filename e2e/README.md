# Pruebas E2E

La suite valida el recorrido real de la app contra Supabase local: enlace
mágico, cookies y callback de Auth, RLS, Realtime y la persistencia del estado.
Cada ejecución crea usuarios sintéticos con un correo `example.test`. El
comando de preparación `db reset` los elimina junto con el resto de datos
locales antes de una ejecución aislada. No borra ni recrea los contenedores de
Docker: `supabase start` puede mantenerse activo durante todo el trabajo.

## Cómo lanzar los tests

| Comando | Qué valida | Necesita Supabase local |
| --- | --- | --- |
| `npm run test:e2e` | Onboarding con dos sesiones (Auth, RLS, Realtime) | Sí |
| `npm run test:e2e:founder` | Recorrido de valor completo del hogar fundador | Sí |
| `npm run test:e2e:actions` | Matriz de acciones por módulo (despensa, compra, recetas, plan) | Sí |
| `npm run test:e2e:realtime` | Convergencia entre dos sesiones en Compra y Plan | Sí |
| `npm run test:e2e:ux` | Auditoría visual/semántica en 3 viewports | No (fixtures de demo, sin login) |

Para los cuatro primeros, sigue la preparación local de abajo. `test:e2e:ux`
arranca su propio servidor Next con `NEXT_PUBLIC_DEMO_FIXTURES=true` en el
puerto `E2E_PORT` (por defecto 3002) y no toca Supabase ni requiere login: se
puede lanzar directamente con `npm run test:e2e:ux`.

Para observar las interacciones en Chromium en cualquiera de los comandos,
añade `-- --headed` (ej. `npm run test:e2e:founder -- --headed`); para abrir
el informe de la última ejecución, usa `npm run test:e2e:report`. Los fallos
conservan captura, vídeo y traza en `test-results/`; el informe HTML se
escribe en `playwright-report/`. Ambos directorios están excluidos de Git.

## Preparación local (tests que requieren Supabase)

1. Inicia Supabase y aplica las migraciones:

   ```powershell
   npx supabase start
   npx supabase db reset
   ```

2. Copia las variables mostradas por `npx supabase status -o env` a `.env.local`.
   Deben incluir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY`. No se versionan credenciales.

3. Ejecuta la suite que quieras (ver tabla arriba), por ejemplo:

   ```powershell
   npm run test:e2e:founder
   ```

Playwright inicia Next.js si no se indica `E2E_BASE_URL`.

## Suite de validación del hogar fundador

Diseño completo en
[`docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md`](../docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md).
Todas usan correos sintéticos `@example.test` y limpian el usuario al terminar,
incluso si el recorrido falla.

- `founder-journey.spec.ts` (`npm run test:e2e:founder`) — recorrido de valor
  completo: acceso, línea base, receta, plan, compra, cocina y ticket, en una
  sola sesión.
- `founder-actions.spec.ts` (`npm run test:e2e:actions`) — matriz de acciones
  por módulo: despensa, compra, recetas y plan, cada caso independiente del
  resto.
- `founder-realtime.spec.ts` (`npm run test:e2e:realtime`) — convergencia
  entre dos sesiones en Compra y Plan; reutiliza el patrón de
  `onboarding-two-sessions.spec.ts` con una cuenta propia.
- `founder-ux-audit.spec.ts` (`npm run test:e2e:ux`) — auditoría
  visual/semántica en 3 viewports con fixtures de demo
  (`NEXT_PUBLIC_DEMO_FIXTURES=true`, sin login); arranca su propio servidor en
  el puerto `E2E_PORT` en vez del `webServer` de `playwright.config.ts`.

Los helpers de enlace mágico (Mailpit) y limpieza de usuarios están en
`e2e/support/auth.ts`, compartidos por todos los specs autenticados.
