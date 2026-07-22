---
title: Evidencia de verificación — Fase 9 (puerta de calidad)
aliases:
  - Fase 9 Verification Evidence
tags:
  - midespensa
  - arquitectura
  - pruebas
  - calidad
status: in-progress
updated: 2026-07-22
related:
  - "[[MASTER-IMPLEMENTATION-PLAN]]"
  - "[[POC-TDD-EVIDENCE]]"
  - "[[ACTIVE-CONTEXT]]"
---

# Evidencia de verificación — Fase 9 (puerta de calidad)

## Alcance

La Fase 9 concentra la verificación aplazada durante las fases funcionales
(4A–8). Este documento registra los resultados reales ejecutados, no una
declaración de intenciones. Rama de trabajo: `feature/fase9-verification-gate`
(saneado de la app) y `feature/e2e-quality-gate` (arnés E2E de onboarding).

## Saneado previo: la app arrancaba en rojo

Las fases 4A–7 se fusionaron a `develop` con la verificación diferida. Al
ejecutar la puerta por primera vez, `develop` acumulaba **33 errores de tipos**
(`tsc`) y **7 de estilo** (`lint`) que los tests de runtime no detectaban
(Vitest no comprueba tipos). Se corrigieron sin cambiar comportamiento. Los de
fondo eran reales, no cosméticos:

| Área | Defecto | Corrección |
| --- | --- | --- |
| `database.ts` | `shopping_items` sin `quantity`/`unit_code` ni `source = 'plan'`, pese a la migración `20260720140000` | Tipos sincronizados con el esquema real (8 errores en `shopping/actions.ts`) |
| `recipes/RecipeEditor` | el `catch` inline ensanchaba `ok` a `boolean` e impedía estrechar la unión | `ok: false as const` |
| `plan/presentation` | `toDate`/`parseUndo` no estrechaban valores bajo `noUncheckedIndexedAccess` | defaults en el destructuring y guarda directa |
| `pantry/PantryList` | el toast «Deshacer» pasaba `PantryListItem` donde se esperaba `PresentedPantryItem` | presenta la lista antes de buscar |
| `pantry/PantryWorkspace` | `handleCreate` fijaba `zone: 'pantry'` | ampliado a `PantryZone` |
| `pantry/PantryDetail` | sincronizaba estado en un `useEffect` (lint) | el padre remonta con `key={item.id}`; efecto eliminado |
| enlaces internos | `<a href="/…">` en navegación (lint `no-html-link-for-pages`) | `<Link>` de `next/link` |
| fixtures de test | `attentionState` (requerido) e índices conocidos | valores añadidos y aserciones `!` |

## Resultados de la puerta (ejecutados el 2026-07-22)

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Estilo | `npm run lint` (`eslint . --max-warnings=0`) | PASS · 0 problemas |
| Tipos | `npx tsc --noEmit` | PASS · 0 errores |
| Unitarios | `npm test` (Vitest) | PASS · 82/82 (12 ficheros) |
| Build | `npm run build` (Next.js) | PASS · 13 rutas |
| Espacios | `git diff --check` | PASS · limpio |

## E2E de dos sesiones (onboarding)

Rama `feature/e2e-quality-gate` (PR #8). Ejecutado contra Supabase local con
navegador real y enlace mágico capturado de Mailpit.

| Recorrido | Artefacto | Resultado |
| --- | --- | --- |
| Onboarding completo con línea base vacía y persistencia del estado `completed` | `e2e/onboarding-two-sessions.spec.ts` | PASS |
| Dos sesiones convergen: Auth + callback PKCE + RLS + Realtime (A añade → B lo ve; B quita → A converge) | mismo spec | PASS · 2/2 |

## Cobertura y límites (pendiente de la Fase 9)

El plan maestro define más alcance para la Fase 9 del que cubre esta evidencia:

- **E2E del ciclo `planificar → comprar → cocinar`**: aún no escrito. El E2E
  actual valida onboarding, no el recorrido funcional completo.
- **Revisión manual responsive** a 390, 768 y 1440 px: pendiente. Existe un
  borrador sin fusionar `e2e/responsive-navigation.spec.ts`.
- **Integraciones SQL** de fases (p. ej. `supabase/tests/*.sql`): descritas en
  cada fase; su ejecución sistemática queda por consolidar aquí.
- **Cierre de Notion**: lo realiza la persona responsable (sin conector).

## Nota operativa

ESLint (flat config) no ignora la salida de Playwright (`playwright-report/`,
`test-results/`, ya en `.gitignore`). Al ejecutar E2E en local esos artefactos
ensucian `eslint .`. Lo correcto es añadirlos a `globalIgnores` de
`eslint.config.mjs`; el hook *config-protection* bloquea esa edición, así que
queda como cambio de config pendiente de aprobación. En CI no afecta si `lint`
corre antes que E2E.
