---
title: Plan maestro de implementación — MiDespensa
aliases:
  - Master Implementation Plan
tags:
  - midespensa
  - proyecto
  - roadmap
  - implementación
status: active
updated: 2026-07-21
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[ACTIVE-CONTEXT]]"
  - "[[WORKFLOW]]"
  - "[[MVP-FUNCTIONAL-BRIEF]]"
  - "[[DOMAIN-DATA-MODEL]]"
---

# Plan maestro de implementación — MiDespensa

## Regla de ejecución

Cada entrega se implementa en una rama nueva `feature/<nombre>`, con una única tarea **En curso** por carril en Notion. El agente debe seguir Notion → Obsidian → Figma cuando aplique → repositorio, y cerrar cada entrega actualizando esta documentación, la especificación afectada, `ACTIVE-CONTEXT.md` y Notion.

No ejecutar `test`, `test:e2e`, `lint`, `typecheck` ni `build` durante las fases funcionales. La validación manual y automatizada se concentra en la Fase 9, salvo que la persona responsable solicite una excepción explícita.

## Estado trazable al 2026-07-21

El estado **implementado** significa que existe una entrega local identificable. No equivale a aceptación funcional ni a cierre de la tarea en Notion: esa evidencia sigue pendiente hasta que se ejecute la Fase 9 o se solicite una verificación concreta.

| Entrega | Estado en repositorio | Evidencia principal |
| --- | --- | --- |
| Fases 0–2 | Implementadas y verificadas | `2b89e6f` en `develop` |
| Fase 3 · datos | Implementada | `8d3a668` / `feature/pantry-catalog` |
| Fase 3 · UI DESPENSA | En curso en Notion | `feature/pantry-d3`; faltan criterios de aceptación de la tarea UX/UI |
| Fases 4A–4C | Implementadas | `d84a573`, `42949c8`, `a618613` |
| Fases 5A–5C | Implementadas | `ebb7715`, `dccf025`, `b7b5af4` |
| Fase 6 | Implementada | `87d9dda` |
| Fase 7 | Implementada | `81e74a8` / merge `035edbc` |
| Fase 8 | Implementada | `45a0034` |
| C4 · ticket | Pendiente; fuera de las fases numeradas de este plan | [[SHOPPING-SCREEN-SPEC#C4 — Registrar una compra desde un ticket]] |
| Fase 9 | Pendiente | Cierre de calidad y aceptación |

Antes de abrir otra fase funcional, Notion debe reflejar estas entregas o agruparlas explícitamente en una tarea de Desarrollo. No se debe inferir que están aceptadas solo por existir el código.

## Fase 0 — Historial de esquema

**Rama:** `feature/schema-history-baseline`

### Objetivo

Reconciliar el historial local de migraciones con el proyecto Supabase Development antes de volver a utilizar `supabase db push`.

### Contexto

Las migraciones MVP y de Compra ya se aplicaron correctamente a Development, pero el conector las registró con timestamps remotos distintos a los nombres de ficheros locales. La base está vacía; no se debe aplicar un `db push` hasta resolver la divergencia.

### Entregable

- Decisión documentada sobre reset/recreación de Development o alineación controlada del historial.
- Migraciones locales en orden de dependencia: onboarding → catálogo → atención D3 → Compra.
- Historial remoto y nombres locales alineados.

### Dependencia y autorización

Recrear o resetear Development borra el esquema existente y requiere autorización explícita antes de hacerlo.

## Fase 4A — Fundamentos de Recetas

**Rama:** `feature/recipes-foundation`  
**Figma:** `RECETAS`, nodo `29:1906`

### Alcance

- Modelo, RLS y RPCs idempotentes de recetas, ingredientes, pasos y categorías.
- Biblioteca R1: búsqueda, estado vacío, tarjetas y navegación responsive.
- Datos privados por hogar y refresco Realtime de los recursos de receta.

### Fuera de alcance

- Editor completo, dataset inicial, preferencias y sugerencias.

## Fase 4B — Editor y detalle de Recetas

**Rama:** `feature/recipes-editor`  
**Figma:** `RECETAS`, flujos R2, R2A y R3

### Alcance

- Crear, editar y consultar una receta estructurada.
- Ingredientes con cantidades/unidades compatibles, pasos ordenados y raciones base.
- Captura rápida de enlace como receta `pending`, con revisión humana; sin OCR.
- Estados de guardado, error y conflicto sin perder lo visible.

### Fuera de alcance

- Importación automática desde URL, imágenes generadas y publicación fuera del hogar.

## Fase 4C — Preferencias y dataset inicial

**Rama:** `feature/recipes-preferences`

### Alcance

- Favorito y puntuación individual de 1 a 5 por receta y miembro.
- Dataset inicial versionado, con procedencia, licencia y carga idempotente que no sobrescriba cambios del hogar.
- Categorías necesarias para filtros y futuras sugerencias.

## Fase 5A — Plan semanal base

**Rama:** `feature/weekly-plan-core`  
**Figma:** `PLAN SEMANAL`, nodo `29:5`

### Alcance

- Modelo de `meal_plans` y `planned_meals`, con una comida/cena por fecha y hogar.
- Vista P1: semana actual, navegación entre semanas y huecos de comida/cena.
- Responsive: lista vertical a 390 px, dos columnas en tablet y siete columnas más barra lateral en escritorio.

## Fase 5B — Selección y edición del plan

**Rama:** `feature/weekly-plan-selection`

### Alcance

- Selector P2 de recetas guardadas para un hueco concreto.
- Asignación directa al elegir una receta; retroceso sin borradores ni cambios.
- Cambiar receta, ajustar raciones, mover y eliminar con confirmación y Deshacer.

## Fase 5C — Sugerencias explicables

**Rama:** `feature/meal-suggestions`

### Alcance

- Ranking determinista de hasta tres recetas elegibles.
- Factores visibles: disponibilidad, productos prioritarios, preferencias, variedad, repetición, tiempo y orientación mediterránea.
- Pesos versionados; el sistema nunca crea recetas ni rellena huecos sin acción del usuario.

## Fase 6 — Consolidación del plan en Compra

**Rama:** `feature/shopping-plan-consolidation`

### Alcance

- Ingredientes faltantes de recetas planificadas se añaden a Compra como fuente trazable.
- Consolidación sin duplicados y sin fusionar unidades incompatibles.
- Se preservan los productos manuales de Compra y se informa mediante toast de los productos añadidos.

## Fase 7 — Cierre de Compra

**Rama:** `feature/shopping-checkout`  
**Figma:** `COMPRA`, nodo `29:3290`

### Alcance

- C2: revisión de productos marcados, previsión de cambios y CTA **Confirmar en despensa**.
- Confirmación idempotente: crea entradas o actualiza presencia en Despensa una sola vez, con movimientos trazables.
- Volver desde revisión conserva las marcas; conflictos y cambios remotos ofrecen recarga sin ocultar el estado visible.

### Fuera de alcance

- Ticket/OCR, supermercados avanzados e historial de gasto.

## Fase 8 — Cocinar y consumo asistido

**Rama:** `feature/cook-and-consume`

### Alcance

- Desde una receta planificada, marcar como cocinada.
- Proponer descuentos de ingredientes conocidos y requerir confirmación o corrección antes de alterar la Despensa.
- Movimientos idempotentes y control optimista de versión.

## Fase 9 — Cierre de calidad y aceptación

**Rama:** `feature/final-qa-e2e`

### Alcance

- Revisión manual integral a 390, 768 y 1440 px.
- Ejecución solicitada de tests unitarios, lint, typecheck y build.
- E2E de dos sesiones: aislamiento RLS, Realtime, reintentos idempotentes y ciclo planificar → comprar → cocinar.
- Cierre de las tareas de Notion y actualización final de documentación y evidencias.

## Orden funcional

```text
Recetas → Plan semanal → faltantes en Compra → confirmar compra → cocinar/consumir → QA final
```

## Trabajo pendiente fuera de la secuencia cerrada

- **C4 · captura de ticket:** OCR/importación de líneas con revisión humana; se mantiene como alcance futuro en [[SHOPPING-SCREEN-SPEC]]. Requiere una tarea de Notion propia antes de implementarse.
- **Fase 9:** validación bajo demanda del ciclo completo y actualización de la trazabilidad en Notion y Obsidian.

## Instrucción operativa para Claude Code Opus 4.8

> Implementa exclusivamente la siguiente feature del Plan maestro de MiDespensa. Sigue `AGENTS.md`, `docs/00-Project/ACTIVE-CONTEXT.md` y `docs/00-Project/WORKFLOW.md`. Usa Notion → Obsidian → Figma → repositorio. Crea una rama `feature/<nombre>`, actualiza la documentación canónica y Notion, y crea un commit local. No ejecutes tests, lint, typecheck, build ni E2E: la validación será la Fase 9. No avances a la siguiente feature sin documentar y cerrar la actual.
