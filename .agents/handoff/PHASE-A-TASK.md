# Tarea Fase A — Scaffold Next.js + capa de datos Supabase (sin UI de pantallas)

Eres el implementador. Fable 5 (Claude) planifica y revisará tu entrega. Trabaja en la raíz del repo actual.

## Contexto obligatorio (leer antes de escribir código)

- `AGENTS.md`
- `docs/05-Architecture/TECHNICAL-ARCHITECTURE.md`
- `docs/05-Architecture/DOMAIN-DATA-MODEL.md`
- `docs/05-Architecture/POC-TDD-EVIDENCE.md`
- `docs/03-UX/ONBOARDING-SCREEN-SPEC.md` (§4–5: modelo de estado y datos a persistir)
- `supabase/migrations/*.sql` y `supabase/tests/poc_two_session_security.sql` (POC existente: patrón a seguir; NO borrarlo ni modificarlo)

## Reglas de repo/git

- Estás en la rama `feature/mvp-init`. Commits pequeños y verificables. NO push, NO PR.
- NO hacer stage ni commit de `AGENTS.md`, `docs/**` ni `"# MiDespensa — inicialización del MVP.md"` (tienen cambios ajenos sin commitear). Añade a los commits solo archivos que tú crees.
- No borrar, revertir ni sobrescribir nada existente.
- Nunca incluir secretos, tokens, claves ni correos reales. `.env.example` solo con nombres.

## A) Scaffold Next.js en la raíz (convivirá con `docs/` y `supabase/`)

- Next.js (App Router) + React + TypeScript estricto. npm. La raíz no está vacía: genera el proyecto manualmente o en un directorio temporal y mueve los archivos, sin tocar los existentes.
- ESLint + Prettier, Vitest + @testing-library/react.
- Estructura modular mínima (solo lo que tendrá contenido ahora):
  `src/app/`, `src/modules/{identity,household,onboarding,pantry}/`, `src/components/ui/`, `src/lib/supabase/`, `src/lib/validation/`, `src/lib/errors/`, `src/lib/idempotency/`, `src/types/`
- `src/lib/supabase`: cliente navegador (`@supabase/ssr` `createBrowserClient`) y servidor (`createServerClient` con cookies) separados; helper admin con `service_role` SOLO servidor, protegido con `server-only`.
- `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
- PWA básica: `manifest.webmanifest` + iconos placeholder + metadata. Sin service worker complejo.
- GitHub Actions `.github/workflows/ci.yml`: npm ci, lint, `tsc --noEmit`, `vitest run`.
- `README.md` raíz: arranque local (incluye `supabase start` / `db reset`) y comandos de verificación.
- Página raíz mínima honesta (placeholder; la redirección real a `/onboarding` llega en la fase de UI). Nada que simule funciones inexistentes.

## B) Migraciones Supabase del esquema real del vertical slice

Nuevas migraciones con timestamp posterior a las del POC; tablas sin prefijo `poc_`. Todas con `household_id` donde aplique, RLS activada y políticas de lectura/escritura por membresía activa:

- `profiles` (user_id PK → auth.users, display_name)
- `households` (id, name, onboarding_status, baseline_confirmed_at, created_by)
- `household_members` (household_id, user_id, role `owner|member`, status, UNIQUE(household_id,user_id); trigger que rechaza más de 2 membresías activas — patrón del POC)
- `household_people` (personas sin cuenta del paso O1: household_id, name; no son invitaciones)
- `pantry_locations` (household_id, kind `fridge|freezer|pantry`, UNIQUE(household_id,kind); las 3 se crean al crear el hogar)
- `household_foods` (household_id, name; UNIQUE por hogar case-insensitive)
- `pantry_items` (household_id, location_id, food_id, tracking_mode `approximate` por defecto, presence boolean, quantity opcional CHECK >= 0, version int, confirmed_at, confirmed_by, UNIQUE(household_id,location_id,food_id))
- `pantry_movements` (histórico inmutable: household_id, item_id, tipo `entry|removal|correction`, actor, created_at)
- `onboarding_progress` (household_id PK, global_state `household_draft|inventory_in_progress|awaiting_review|confirming|completed`, active_zone, return_target)
- `onboarding_zone_progress` (household_id, zone, state `not_started|in_progress|reviewed_nonempty|reviewed_empty`, UNIQUE(household_id,zone))
- `idempotency_keys` (household_id, actor, operation, key, request_hash, result jsonb; claim con `INSERT ... ON CONFLICT DO NOTHING` como en el POC)

Funciones RPC transaccionales `SECURITY DEFINER` con comprobación de membresía interna:

- `create_household_with_onboarding(name, people, idempotency_key)`: hogar + membresía owner + personas + 3 zonas + progreso; idempotente.
- `onboarding_add_pantry_item(zone, food_name, idempotency_key)`: upsert de food + item + movimiento; un duplicado devuelve resultado marcado como duplicado, sin error.
- `onboarding_remove_pantry_item(item_id, version)`: control optimista (`serialization_failure` si versión antigua) + movimiento de retirada.
- `onboarding_set_zone_state(zone, state)`: valida las transiciones de `ONBOARDING-SCREEN-SPEC.md` §4.
- `confirm_baseline(idempotency_key)`: exige las 3 zonas en `reviewed_*`, marca `completed` y `baseline_confirmed_at`; idempotente.

Añadir `pantry_items` y `onboarding_progress` a la publicación `supabase_realtime`.

Tipos TS del esquema en `src/types/database.ts` (con `supabase gen types` si el CLI está disponible; si no, escritos a mano coherentes con el esquema).

## C) Tests SQL de integración

`supabase/tests/mvp_onboarding_security.sql` siguiendo el patrón ROLLBACK del POC:

1. dos identidades sintéticas comparten hogar y despensa;
2. una identidad ajena no lee nada;
3. la tercera membresía activa se rechaza;
4. conflicto de versión en edición concurrente;
5. confirmación de línea base idempotente (el reintento no duplica);
6. la publicación realtime incluye `pantry_items`.

Ejecutarlo si hay Postgres/Supabase local disponible (`supabase db reset` + psql). Si no hay entorno, dejar el script listo y documentar en el resumen el comando exacto y el bloqueo. No declarar éxito sin ejecución real.

## D) Verificación

Ejecutar de verdad y reportar salida real: `npm run lint`, `npx tsc --noEmit`, `npm test` (al menos pruebas unitarias de `src/lib/validation`).

## Entrega

Resumen final: archivos creados, comandos ejecutados con resultado real, bloqueos y por qué, lista de commits.
