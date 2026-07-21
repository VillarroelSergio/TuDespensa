# Fase 3 — Despensa cotidiana y catálogo (bloque 1: capa de datos)

Rama de trabajo: `feature/pantry-catalog` (creada desde `develop`, que ya contiene el vertical slice de onboarding). Sin commits ni push (el revisor commitea). No toques `AGENTS.md`, `docs/**` (solo lectura), ni ficheros ajenos. Sin secretos.

**Alcance de este bloque: solo backend/datos.** La UI de DESPENSA queda explícitamente FUERA: la integración de Figma aún no expone esa página y el plan maestro prohíbe implementar pantallas por intuición.

Documentos vinculantes (lectura obligatoria antes de escribir nada):
- `docs/05-Architecture/DOMAIN-DATA-MODEL.md` (entidades, invariantes, operaciones idempotentes)
- `docs/05-Architecture/TECHNICAL-ARCHITECTURE.md` (modelo de seguridad, convenciones RPC/RLS/idempotencia, §16 protocolo de pruebas)
- `docs/03-UX/PANTRY-SCREEN-SPEC.md` (solo como contrato de comportamiento que la capa de datos debe poder servir; nada de UI)
- `docs/02-Requirements/MVP-FUNCTIONAL-BRIEF.md` (AC-013, AC-014, AC-016, AC-017, AC-018)

Primero: crea/actualiza la tarea activa del carril Arquitectura en Notion (única tarea activa) reflejando esta fase, como hiciste en fases anteriores.

## Entregables

1. **Migración** `supabase/migrations/<timestamp>_pantry_catalog.sql` siguiendo exactamente los patrones existentes en `20260719103248_mvp_onboarding_vertical_slice.sql` (RLS con `private.is_active_household_member`, tablas SELECT-only para `authenticated`, escrituras solo vía RPCs SECURITY DEFINER con `set search_path = ''`, idempotencia con claim `insert ... on conflict do nothing` + `request_hash`, versión optimista con `serialization_failure`, triggers de inmutabilidad):
   - Catálogo canónico + alias + nombres personalizados por hogar (extiende `household_foods` o añade lo que el modelo de dominio dicte — sin duplicar lo que ya existe).
   - Estado aproximado (`plenty|some|low|out` o lo que fije el modelo), unidades exactas o peso/volumen opcionales.
   - Movimientos inmutables: entrada, corrección, consumo, ajuste (reusa `pantry_movements` si encaja; verifica su forma actual antes).
   - Cantidades nunca negativas (constraint en BD, no solo en RPC).
   - Señal «consumir pronto» derivable de categoría + antigüedad (vista o columna calculada; nunca caducidad inventada).
   - Realtime: añade las tablas nuevas necesarias a la publicación `supabase_realtime` (patrón notificación → re-consulta).
2. **RPCs** transaccionales e idempotentes para: alta/entrada, corrección, consumo, ajuste, acciones rápidas «queda poco» y «se terminó», renombrado/alias por hogar. Conflictos de edición → `serialization_failure` (40001).
3. **Test SQL de integración** `supabase/tests/pantry_catalog.sql` con el patrón ROLLBACK existente (identidades JWT sintéticas): cubre concurrencia (dos miembros, versión desfasada), no-negatividad, inmutabilidad de movimientos, idempotencia de reintentos y aislamiento RLS frente a un tercer hogar. No podrás ejecutarlo en tu sandbox: déjalo listo; el revisor lo ejecuta.
4. **Tipos y módulo** `src/modules/pantry`: tipos de dominio + Server Actions finas sobre los RPCs (mismo estilo que `src/modules/onboarding/actions.ts`), con tests unitarios de validación. Actualiza `src/types/database.ts` con las tablas/columnas nuevas.
5. Nada de UI nueva; la ruta `/despensa` sigue siendo placeholder honesto.

## Verificación exigida
`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` en verde y `git diff --check`. Reporta honestamente qué ejecutaste y qué quedó pendiente.
