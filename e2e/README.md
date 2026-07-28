# Pruebas E2E

La suite valida el recorrido real de la app contra Supabase local: acceso con
correo y contraseña, cookies y callback de Auth, RLS, Realtime y la
persistencia del estado. El piloto no tiene SMTP propio: no hay enlaces
mágicos, ni OTP, ni verificación de navegador — toda cuenta se autentica con
contraseña, y el único camino para unirse al hogar ya existente es un código
de invitación de un solo uso.

Cada ejecución crea usuarios sintéticos (`@example.test` o `@example.invalid`,
según el spec). `resetPilotState` (usado por `pilot-invitation.spec.ts`)
elimina el hogar único y esas cuentas para dejar la base lista para la
siguiente ejecución. No borra ni recrea los contenedores de Docker: `supabase
start` puede mantenerse activo durante todo el trabajo.

## Cómo lanzar los tests

| Comando | Qué valida | Necesita Supabase local |
| --- | --- | --- |
| `npm run test:e2e` | Misma cuenta en dos sesiones (Auth, RLS, Realtime) | Sí |
| `npm run test:e2e:invitation` | Código de invitación: dos cuentas distintas comparten hogar, sin código no se entra, uso único, hogar lleno, alta de cuenta huérfana por `/unirme` | Sí |
| `npm run test:e2e:founder` | Recorrido de valor completo del hogar fundador | Sí |
| `npm run test:e2e:actions` | Matriz de acciones por módulo (despensa, compra, recetas, plan) | Sí |
| `npm run test:e2e:realtime` | Convergencia entre dos sesiones en Compra y Plan | Sí |
| `npm run test:e2e:ux` | Auditoría visual/semántica en 3 viewports | No (fixtures de demo, sin login) |

Para todos salvo el último, sigue la preparación local de abajo. `test:e2e:ux`
arranca su propio servidor Next con `NEXT_PUBLIC_DEMO_FIXTURES=true` en el
puerto `E2E_PORT` (por defecto 3002) y no toca Supabase ni requiere login: se
puede lanzar directamente con `npm run test:e2e:ux`.

### Ver la ejecución en directo

Por defecto Playwright corre "en modo invisible" (sin ventana). Para ver el
navegador de verdad mientras ejecuta cada paso, añade `-- --headed` a
cualquiera de los comandos anteriores:

```powershell
npm run test:e2e:founder -- --headed
```

Para ir aún más despacio y controlar el ritmo (útil para seguir el recorrido
paso a paso):

```powershell
npm run test:e2e:founder -- --headed --workers=1 --timeout=0
```

Y para la experiencia más cómoda de "ver qué hace" — una ventana con la lista
de pasos, el navegador en directo al lado y la posibilidad de pausar/rebobinar
cada acción — usa el modo UI de Playwright:

```powershell
npm run test:e2e:founder -- --ui
```

Los fallos conservan captura, vídeo y traza en `test-results/` aunque se
ejecute en modo invisible; para revisar la última ejecución fallida sin
relanzarla, usa `npx playwright show-report`. Tanto `test-results/` como
`playwright-report/` están excluidos de Git.

## Preparación local (tests que requieren Supabase)

1. Inicia Supabase y aplica las migraciones:

   ```powershell
   npx supabase start
   npx supabase db reset
   ```

2. Copia las variables mostradas por `npx supabase status -o env` a
   `.env.test.local`. Deben incluir `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No se
   versionan credenciales.

3. Ejecuta la suite que quieras (ver tabla arriba), por ejemplo:

   ```powershell
   npm run test:e2e:founder
   ```

Playwright inicia Next.js si no se indica `E2E_BASE_URL`.

## Suite de validación del hogar fundador

Diseño completo en
[`docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md`](../docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md).
Cada spec limpia sus propias cuentas sintéticas al terminar, incluso si el
recorrido falla.

- `onboarding-two-sessions.spec.ts` (`npm run test:e2e`) — la MISMA cuenta
  abierta en dos navegadores distintos: valida que la sesión y el estado
  convergen entre dispositivos/navegadores, no que dos cuentas distintas
  puedan compartir hogar (eso lo cubre `pilot-invitation.spec.ts`).
- `pilot-invitation.spec.ts` (`npm run test:e2e:invitation`) — el requisito
  central del piloto: dos cuentas DISTINTAS comparten el mismo hogar mediante
  un código de invitación de un solo uso, leído del DOM
  (`household-invite-code__value`) tras generarlo desde `/hogar`. Cubre
  también: registro sin código rechazado (y sin cuenta creada), reutilizar un
  código ya canjeado (y sin cuenta huérfana, gracias a la acción compensatoria
  de `registerAccount`), el botón de generar código deshabilitado con el hogar
  lleno, y una cuenta ya existente sin membresía que el middleware lleva a
  `/unirme` y que se une canjeando un código nuevo. Usa `resetPilotState` al
  empezar y al terminar porque el hogar es un singleton estricto
  (`households_singleton_guard`): un hogar sobrante de una ejecución anterior
  bloquearía la creación del primero en cualquier otro spec.
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

Los helpers de autenticación por contraseña y limpieza de cuentas/hogar están
en `e2e/support/auth.ts`, compartidos por todos los specs autenticados.
