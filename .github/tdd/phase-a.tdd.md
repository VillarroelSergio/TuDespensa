# Evidencia TDD — Fase A

## Fuente

Contrato de implementación: `.agents/handoff/PHASE-A-TASK.md`.

## Recorridos

1. Como cliente del onboarding, valido y normalizo nombres domésticos antes de persistirlos.
2. Como cliente que reintenta una mutación, genero una clave opaca y segura ligada a la operación.
3. Como miembro del hogar, comparto despensa y progreso sin exponer filas a una identidad ajena.
4. Como sistema, rechazo una tercera membresía, versiones antiguas y confirmaciones incompletas.
5. Como cliente que reintenta la confirmación, obtengo el resultado inicial sin duplicar efectos.

## RED → GREEN

| Fase             | Orden                                                     | Resultado real                                                   |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| RED validación   | `npm test -- --run src/lib/validation/onboarding.test.ts` | Falló al resolver `./onboarding`, todavía inexistente.           |
| GREEN validación | misma orden tras implementar                              | 14 pruebas superadas.                                            |
| RED idempotencia | `npm test -- --run src/lib/idempotency/keys.test.ts`      | Falló al resolver `./keys`, todavía inexistente.                 |
| GREEN completo   | `npm test`                                                | 18 pruebas superadas en 2 archivos.                              |
| Cobertura        | `npm run test:coverage`                                   | 96,55% statements; 93,75% branches; 90% functions; 96,42% lines. |

## Garantías

| #   | Garantía                                                               | Artefacto                                    | Tipo                          | Resultado    |
| --- | ---------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- | ------------ |
| 1   | Los nombres válidos se normalizan y los límites/duplicados se rechazan | `src/lib/validation/onboarding.test.ts`      | unidad                        | PASS         |
| 2   | Las claves idempotentes ligan una operación segura a un UUID opaco     | `src/lib/idempotency/keys.test.ts`           | unidad                        | PASS         |
| 3   | Dos miembros comparten hogar y una identidad ajena no lee filas        | `supabase/tests/mvp_onboarding_security.sql` | integración SQL/RLS           | NO EJECUTADO |
| 4   | La tercera membresía y la versión antigua se rechazan                  | mismo script                                 | integración SQL               | NO EJECUTADO |
| 5   | Confirmar la línea base es idempotente                                 | mismo script                                 | integración SQL               | NO EJECUTADO |
| 6   | `pantry_items` pertenece a `supabase_realtime`                         | mismo script                                 | integración SQL/configuración | NO EJECUTADO |

## Límites conocidos

La integración SQL está preparada con `BEGIN/ROLLBACK`, pero no se ejecutó: Docker Desktop no alcanzó estado operativo, `psql` no está instalado y `SUPABASE_DB_URL` no está definida. `npx supabase db reset` confirmó el bloqueo al no encontrar el pipe `docker_engine`.

Los checkpoints Git tampoco pudieron escribirse porque el sandbox permite leer `.git` pero deniega crear `.git/index.lock`.
