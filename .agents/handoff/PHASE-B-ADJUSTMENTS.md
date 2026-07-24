# Fase B — Iteración de ajustes (revisión de Fable 5)

Contexto: continuación de `.agents/handoff/PHASE-B-TASK.md`. La entrega parcial está en el árbol de trabajo (sin commit). Verificado por el revisor: `npx tsc --noEmit` limpio y 25/25 tests. Los documentos vinculantes siguen siendo `docs/03-UX/ONBOARDING-SCREEN-SPEC.md` y `.agents/handoff/FIGMA-ONBOARDING-CONTEXT.md`.

Corrige lo siguiente, por orden de prioridad. No toques `AGENTS.md`, `docs/**` ni ficheros ajenos. Sin secretos, sin push, sin commits (el revisor commitea).

## A1 — BUG crítico: eliminar alimento nunca llega al servidor
En `src/app/onboarding/page.tsx` el botón «Quitar …» solo muta estado local; `removePantryFood` (`src/modules/onboarding/actions.ts:26`) no se llama nunca. Además `add()` descarta `item_id` y `version` que devuelve `onboarding_add_pantry_item`, así que el tipo `Food.itemId/version` está muerto. Consecuencia: un alimento quitado sigue en BD y `confirm_baseline` lo consolida.
- Captura `item_id`/`version` de la respuesta del RPC en `add()`.
- Llama a `removePantryFood(itemId, version)` al quitar; trata el conflicto 40001 (re-consulta y reintento o mensaje del spec §13).
- El microcopy «… eliminado · Deshacer» promete un deshacer que no existe: implementa el deshacer real (re-alta idempotente) o elimina la promesa. Nada simulado.

## A2 — BUG: callback de auth incompatible con PKCE
`src/app/auth/callback/route.ts` pasa `getAll: () => []`, pero `@supabase/ssr` usa flujo PKCE por defecto: `exchangeCodeForSession` necesita leer la cookie del code verifier de la petición. Lee las cookies reales de la request (patrón `createServerClient` con `request.cookies`). Verifica el flujo completo login→callback→sesión contra el Supabase local si puedes; si no, deja el código correcto según la doc oficial de `@supabase/ssr`.

## A3 — Rehidratación desde servidor + Realtime (cierre del vertical slice)
Hoy la reanudación es solo `localStorage`; la segunda cuenta no ve nada (UX-ONB-001/007 incumplidos).
- Al entrar en `/onboarding`, carga el estado del servidor (household, `onboarding_progress`, `onboarding_zone_progress`, `pantry_items` con id+version) y úsalo como fuente de verdad; el borrador local solo complementa (p. ej. paso visual). Server Component o carga inicial vía cliente, a tu criterio, pero el estado servido manda.
- Suscríbete a Realtime (publicación existente: `pantry_items`, `onboarding_progress`) como **notificación**: al recibir evento, invalida y re-consulta (nunca aplicar el payload directamente). Ambas sesiones deben converger.

## A4 — Middleware por estado de onboarding
- Usuario con onboarding `completed` que va a `/login` u `/onboarding` → redirige a `/despensa`.
- Usuario con onboarding incompleto que va a rutas de app (`/despensa`, `/compra`, `/recetas`, `/plan`) → redirige a `/onboarding`.
- Sin household todavía → `/onboarding` (O1).
Consulta mínima del estado en el middleware o en layouts de servidor; evita duplicar la query en cada ruta.

## A5 — Edición desde revisión (O5) con retorno
Al pulsar «Editar {zona}» desde la revisión, la pantalla de zona debe volver a la revisión al confirmar (return_target), no continuar el flujo lineal. Spec §5.

## A6 — E2E de dos sesiones ejecutable
`e2e/onboarding-two-sessions.spec.ts` es un `test.skip` vacío. Escríbelo completo y ejecutable: config de Playwright (webServer contra `npm run dev` o build), dos contextos con usuarios sintéticos provisionados vía Admin API del Supabase **local** (usar `SUPABASE_SERVICE_ROLE_KEY` desde entorno, jamás hardcodear; emails sintéticos tipo `a@example.test`), flujo O1→O6 en sesión A, aserción en sesión B de que ve el estado tras re-consulta/Realtime. Añade script npm `test:e2e`. Si el entorno del sandbox no permite ejecutarlo, déjalo listo y documenta el comando exacto; no lo marques skip.

## Verificación exigida antes de entregar
`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` en verde, y `git diff --check`. Reporta honestamente qué ejecutaste y qué no.
