---
title: MiDespensa — Contexto activo
aliases:
  - Active Context
tags:
  - midespensa
  - proyecto
  - contexto-activo
status: active
updated: 2026-07-20
notion_task: "https://app.notion.com/p/3a2ad407cbfd816daf15ea1798996c96"
notion_architecture_task: "https://app.notion.com/p/3a1ad407cbfd81029a1be5ed18e31e6e"
figma_project: "https://www.figma.com/files/project/627466188"
figma: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih"
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[WORKFLOW]]"
  - "[[MASTER-IMPLEMENTATION-PLAN]]"
  - "[[COMPETITIVE-BENCHMARK]]"
  - "[[INFORMATION-ARCHITECTURE]]"
  - "[[ONBOARDING-WIREFLOW]]"
  - "[[ONBOARDING-SCREEN-SPEC]]"
  - "[[DOMAIN-DATA-MODEL]]"
  - "[[TECHNICAL-ARCHITECTURE]]"
  - "[[adr/README]]"
---

# MiDespensa — Contexto activo

## Tareas activas por carril

### UX/UI

[Fase 3 — UI de Despensa](https://app.notion.com/p/3a2ad407cbfd816daf15ea1798996c96)

- **Estado:** En curso
- **Fase:** UX/UI
- **Prioridad:** Alta
- **Entregable:** UI de `DESPENSA` implementada sobre la capa de datos de Fase 3, conforme al nodo de Figma `47:2`.

### Arquitectura

[Preparar la arquitectura técnica del MVP web](https://app.notion.com/p/3a1ad407cbfd81029a1be5ed18e31e6e)

- **Estado:** Hecha
- **Fase:** Arquitectura
- **Prioridad:** Alta
- **Entregable:** arquitectura técnica aceptada, con prueba E2E real de Auth, RLS y Realtime en dos sesiones.

La tarea `Definir el modelo de dominio y datos` está cerrada en Notion y su resultado canónico es [[DOMAIN-DATA-MODEL]].

## Documentación necesaria

- [[COMPETITIVE-BENCHMARK]]
- [[INFORMATION-ARCHITECTURE]]
- [[ONBOARDING-WIREFLOW]]
- [[ONBOARDING-SCREEN-SPEC]]
- [[MVP-FUNCTIONAL-BRIEF#Recorrido A — Primer valor]]
- [[MVP-FUNCTIONAL-BRIEF#AC-019 — Completar el informe inicial manual]]
- [[MVP-FUNCTIONAL-BRIEF#AC-020 — Confirmar la línea base antes del uso habitual]]

### Arquitectura

- [[PRODUCT-BRIEF]]
- [[MVP-FUNCTIONAL-BRIEF]]
- [[DOMAIN-DATA-MODEL]]
- [[TECHNICAL-ARCHITECTURE]]
- [[adr/README]]

## Flujo que debe diseñarse

Crear hogar → integrantes → frigorífico → congelador → despensa/armario → revisión → confirmar → mostrar valor inmediato.

## Restricciones activas

- Web móvil primero, adaptable a tablet y escritorio.
- Interfaz minimalista y una acción principal visible por pantalla.
- Presencia obligatoria; cantidad opcional; sin caducidades.
- Guardado automático y reanudación.
- Línea base útil, no inventario exhaustivo.
- Figma AI crea los wireframes; el equipo define el flujo y revisa el resultado.
- El archivo maestro de Figma está organizado en cinco páginas: `ONBOARDING`, `DESPENSA`, `COMPRA`, `RECETAS` y `PLAN SEMANAL`. Cada una es la fuente visual de su módulo durante la implementación.
- Objetivo de cinco minutos pendiente de validar con prototipo.
- No crear todavía diseño visual de alta fidelidad.
- Uso cerrado: un único hogar, un máximo de dos cuentas y sin crecimiento previsto.
- Recetario inicial con recetas preferidas y mediterráneas, categorías, favoritos y puntuaciones individuales para alimentar sugerencias explicables.

## Estado de implementación (2026-07-20)

- **Fases 0–2 completadas y verificadas** en `feature/mvp-init` (fusionada en `develop`, commit `2b89e6f`): scaffold Next.js + Supabase, migración con RLS/RPCs idempotentes, auth privada OTP/magic link con callback PKCE, middleware por estado de onboarding, pantallas O1–O6 según Figma + spec, rehidratación desde servidor y Realtime notificar→reconsultar con resincronización al (re)suscribirse.
- **Evidencia ejecutada:** lint, tsc, tests unitarios, build, test SQL de integración (patrón ROLLBACK) y **E2E real de dos sesiones** (`e2e/onboarding-two-sessions.spec.ts`, magic link vía Mailpit, convergencia Realtime en ambos sentidos) — criterio de salida de Fase 2 cumplido.
- **Fase 3, bloque 1 (capa de datos) completado** en `feature/pantry-catalog` (commit `8d3a668`): catálogo canónico + alias, modos `approximate|units|measure` con integridad en BD, movimientos inmutables, vista «consumir pronto», RPCs idempotentes con versión optimista, test SQL en verde.
- **Fase 3, bloque 2 (UI DESPENSA) en curso** en `feature/pantry-d3`: lista priorizada, detalle, alta y correcciones rápidas D3 conforme a los nodos `31:212` y `32:165`. `attention_state` conserva las cantidades al marcar «Queda poco» y el terminado ofrece deshacer con versión optimista.
- **Puente de Compra C1 implementado** en `feature/shopping-inbox`: lista activa persistente, alta manual o desde Despensa, marcado de compra y progreso con RPCs idempotentes y control optimista de versión. C2 (revisión y confirmación en Despensa) y C4 (ticket) siguen planificados para su fase propia.
- **Fase 4A (fundamentos de Recetas) implementada** en `feature/recipes-foundation` (migración `20260720100000_recipes_foundation.sql`): modelo privado por hogar (`recipes`, `recipe_ingredients`, `recipe_steps`) con RLS de solo lectura y mutación por RPC, RPC idempotente `recipes_create_recipe` con captura progresiva (UX-REC-001), refresco Realtime y biblioteca R1 (búsqueda por título, alta rápida nombre + tipo de plato + tiempo, estado vacío y sin resultados, responsive). Test SQL de aislamiento/idempotencia y test unitario de presentación. **Deltas conscientes:** las `recipe_categories` se difieren a 4C (por ahora `dish_type` como columna); editor estructurado de ingredientes/pasos, detalle R3, señal de disponibilidad y búsqueda por ingrediente son Fase 4B.
- **Fase 4B (editor y detalle de Recetas) implementada** en `feature/recipes-editor` (migración `20260720110000_recipes_editor.sql`): columnas `status ('pending'|'ready')` y `source_url` en `recipes`; RPC idempotente `recipes_save_recipe` que guarda la receta completa (metadatos + ingredientes con cantidad/unidad + pasos ordenados) con control optimista de versión (`serialization_failure`→CONFLICT) y reemplazo de colecciones; RPC `recipes_capture_link` que crea la receta como `pending` para revisión humana (sin OCR). UI: editor R2 (`RecipeEditor`, filas de ingredientes/pasos en línea sin modales, «Más detalles» para tipo/enlace, estados guardado/error/conflicto sin perder lo visible), detalle R3 (`RecipeDetailView`) y R2A en la biblioteca (crear manualmente / pegar enlace → editor). Tarjetas R1 ahora navegables con badge «Por revisar». Test SQL 4B (versión, idempotencia, conflicto, unidad inválida, captura pending, aislamiento) y test unitario de `formatIngredient`. **Deltas conscientes:** «Añadir al plan» y el ajuste de raciones se difieren a Fase 5 (integración con Plan); subir foto/OCR y la importación automática desde URL quedan fuera de 4B; el conflicto conserva lo visible e informa, sin merge fila a fila.
- **Fase 4C (preferencias y dataset inicial) implementada** en `feature/recipes-preferences` (migración `20260720120000_recipes_preferences.sql`): `recipe_preferences` (favorito + puntuación 1–5 por persona, única por receta/usuario), taxonomía `recipe_categories` por dimensión + `recipe_category_assignments`, y columnas de procedencia en `recipes` (`origin`, `seed_key` único por hogar, `seed_version`, `attribution`). RPCs idempotentes `recipes_set_preference`, `recipes_set_categories` (reemplazo de asignaciones, crea categorías del hogar por dimensión+nombre) y `recipes_load_seed` (carga versionada **no destructiva**: salta `seed_key` ya presentes). Dataset inicial = **contenido original del proyecto** (3 recetas mediterráneas, `origin='seed'`, atribución «Recetas base del proyecto MiDespensa»), sin licencias de terceros. UI: favorito + estrellas en R3 (`RecipePreferences`), chips de categoría en R3, edición de categorías en R2 («Más detalles»), filtros de favoritos/categoría e indicador ★ en las tarjetas R1, y «Cargar recetas base» en la biblioteca vacía. Test SQL 4C (preferencia idempotente/rango, categorías asignar+reemplazar+dimensión inválida, seed idempotente no destructivo, aislamiento) y test unitario del filtro. **Deltas conscientes:** sin columnas de licencia de terceros hasta cargar un dataset externo; el guardado de categorías es metadato secundario que no bloquea la receta; sugerencias explicables que consumen estas preferencias son Fase 5C.
- Flujo de trabajo: Fable 5 planifica/revisa/acepta; Codex Terra 5.6 (esfuerzo medio) implementa; correcciones de revisión documentadas en los mensajes de commit.

## Siguientes acciones

- **UX/UI:** conservar los wireframes finales como fuente de verdad y resolver en Figma únicamente las correcciones detectadas durante la revisión de implementación.
- **Arquitectura:** Fases 4A, 4B y 4C cerradas; sigue Fase 5A (plan semanal base: modelo `meal_plans`/`planned_meals`, vista P1 con navegación entre semanas y huecos comida/cena, responsive) según el plan maestro.
- **Desarrollo:** no ejecutar verificaciones automáticamente; la persona responsable las realizará bajo demanda. Planificar una cobertura E2E automatizada antes de declarar los flujos completos.
- **Desarrollo local:** `next dev` permite acceder a la interfaz sin autenticación ni redirecciones de onboarding; el bypass está limitado a `NODE_ENV=development` y no habilita datos privados sin sesión de Supabase.

## Bloqueos

- **Figma:** los cinco nodos canónicos están accesibles y devuelven contexto de implementación: `ONBOARDING` ([7:1261](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=7-1261)), `DESPENSA` ([47:2](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=47-2)), `COMPRA` ([29:3290](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-3290)), `RECETAS` ([29:1906](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-1906)) y `PLAN SEMANAL` ([29:5](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-5)).
- **Notion:** conexión verificada el 2026-07-19; la evidencia de Fase 2 y el estado de Fase 3 se han sincronizado con la tarea de Arquitectura.
