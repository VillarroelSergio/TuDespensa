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
updated: 2026-07-22
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

- Ranking determinista de exactamente tres recetas elegibles.
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

**Ramas:** `feature/fase9-verification-gate` y `feature/e2e-quality-gate`

### Alcance

- Revisión manual integral a 390, 768 y 1440 px.
- Ejecución solicitada de tests unitarios, lint, typecheck y build.
- E2E de dos sesiones: aislamiento RLS, Realtime, reintentos idempotentes y ciclo planificar → comprar → cocinar.
- Cierre de las tareas de Notion y actualización final de documentación y evidencias.

### Estado al 2026-07-22

- Puerta estática en verde: lint, tipos, 82 pruebas unitarias, build y comprobación de espacios.
- E2E de onboarding de dos sesiones en verde con Auth, callback PKCE, RLS y Realtime reales.
- Fase aceptada por la persona responsable. El E2E del recorrido `planificar → comprar → cocinar` y la revisión manual a 390/768/1440 px se conservan como deuda conocida no bloqueante.
- Evidencia canónica: [[FASE9-VERIFICATION-EVIDENCE]].

## Fase 10 — Captura asistida de ticket de compra

**Estado:** planificada; no iniciar hasta cerrar Fase 9.
**Figma:** `COMPRA`, nodos `29:3999` y `29:4136`.

### Objetivo

Reducir la carga de registrar una compra a partir de un ticket, manteniendo siempre una revisión humana antes de modificar la Despensa.

### Preparación requerida

- Decidir el tratamiento de privacidad, retención y borrado de las imágenes del ticket antes de integrar OCR o un proveedor externo.
- Diseñar una entrega incremental: captura/importación no destructiva → revisión humana → confirmación mediante el cierre de compra existente.
- Añadir pruebas de aislamiento, reintento idempotente y errores de lectura.

### Fuera de alcance inicial

- Automatizar la confirmación en Despensa sin revisión humana.
- Inferir precios, presupuestos o analítica de gasto.

## Orden funcional

```text
Recetas → Plan semanal → faltantes en Compra → confirmar compra → cocinar/consumir → QA final
```

## Instrucción operativa para Claude Code Opus 4.8

> Implementa exclusivamente la siguiente feature del Plan maestro de MiDespensa. Sigue `AGENTS.md`, `docs/00-Project/ACTIVE-CONTEXT.md` y `docs/00-Project/WORKFLOW.md`. Usa Notion → Obsidian → Figma → repositorio. Crea una rama `feature/<nombre>`, actualiza la documentación canónica y Notion, y crea un commit local. No ejecutes tests, lint, typecheck, build ni E2E: la validación será la Fase 9. No avances a la siguiente feature sin documentar y cerrar la actual.
