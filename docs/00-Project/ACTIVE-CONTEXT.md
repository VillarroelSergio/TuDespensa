---
title: MiDespensa — Contexto activo
aliases:
  - Active Context
tags:
  - midespensa
  - proyecto
  - contexto-activo
status: active
updated: 2026-07-21
notion_task: "https://app.notion.com/p/3a2ad407cbfd816daf15ea1798996c96"
notion_architecture_task: "https://app.notion.com/p/3a1ad407cbfd81029a1be5ed18e31e6e"
figma_project: "https://www.figma.com/files/project/627466188"
figma: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih"
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[WORKFLOW]]"
  - "[[MASTER-IMPLEMENTATION-PLAN]]"
  - "[[CORE-MVP-FLOWS-SPEC]]"
  - "[[PANTRY-SCREEN-SPEC]]"
  - "[[SHOPPING-SCREEN-SPEC]]"
  - "[[RECIPES-SCREEN-SPEC]]"
  - "[[PLAN-SCREEN-SPEC]]"
  - "[[DOMAIN-DATA-MODEL]]"
  - "[[TECHNICAL-ARCHITECTURE]]"
---

# MiDespensa — Contexto activo

## Tareas activas por carril

### UX/UI

[Fase 3 — UI de Despensa](https://app.notion.com/p/3a2ad407cbfd816daf15ea1798996c96)

- **Estado en Notion:** En curso.
- **Entregable:** UI de `DESPENSA` sobre la capa de datos de Fase 3, conforme al nodo Figma `47:2`.
- **Situación:** la implementación de D1–D3 existe, pero los criterios de aceptación de la tarea siguen sin cerrar. No debe marcarse como hecha sin la validación solicitada.

### Arquitectura

[Preparar la arquitectura técnica del MVP web](https://app.notion.com/p/3a1ad407cbfd81029a1be5ed18e31e6e)

- **Estado en Notion:** Hecha.
- **Entregable:** arquitectura aceptada y prueba E2E real de Auth, RLS y Realtime con dos sesiones.

### Desarrollo

- **Estado en Notion:** no hay una tarea que trace las fases 4–8 ni la Fase 9.
- **Regla:** antes de iniciar una nueva fase, crear o reconciliar la tarea de Desarrollo correspondiente. La existencia de código no sustituye el cierre documental ni la aceptación.

## Estado de implementación

| Ámbito | Estado | Referencia |
| --- | --- | --- |
| Fases 0–2 | Implementadas y verificadas | `2b89e6f` en `develop` |
| Fase 3 · datos | Implementada | `8d3a668` |
| Fase 3 · UI DESPENSA | En curso en Notion | `feature/pantry-d3` |
| Recetas · Fases 4A–4C | Implementadas | `d84a573`, `42949c8`, `a618613` |
| Plan · Fases 5A–5C | Implementadas | `ebb7715`, `dccf025`, `b7b5af4` |
| Compra · Fases 6–7 | Implementadas | `87d9dda`, `81e74a8` |
| Cocina · Fase 8 | Implementada | `45a0034` |
| Ticket · C4 | Pendiente | [[SHOPPING-SCREEN-SPEC#C4 — Registrar una compra desde un ticket]] |
| Calidad · Fase 9 | Pendiente | [[MASTER-IMPLEMENTATION-PLAN#Fase 9 — Cierre de calidad y aceptación]] |

Las especificaciones de [[PANTRY-SCREEN-SPEC]], [[SHOPPING-SCREEN-SPEC]], [[RECIPES-SCREEN-SPEC]], [[PLAN-SCREEN-SPEC]] y [[CORE-MVP-FLOWS-SPEC]] describen el comportamiento vigente. [[MASTER-IMPLEMENTATION-PLAN]] concentra la trazabilidad de fases y evidencia.

## Restricciones activas

- Web móvil primero, adaptable a tablet y escritorio.
- Interfaz minimalista y una acción principal visible por pantalla.
- Presencia obligatoria; cantidad opcional; sin caducidades.
- Guardado automático y reanudación.
- Un único hogar y un máximo de dos cuentas; no se prevé crecimiento.
- Figma es la fuente de verdad visual: `ONBOARDING`, `DESPENSA`, `COMPRA`, `RECETAS` y `PLAN SEMANAL` son los módulos canónicos.
- No declarar un flujo aceptado sin la evidencia de la Fase 9 o una verificación solicitada explícitamente.

## Próximas acciones

1. Reconciliar Notion: registrar las fases 4–8 como entregas implementadas, sin marcarlas como aceptadas, y mantener una sola tarea activa por carril.
2. Resolver o validar los criterios pendientes de la tarea UX/UI de Fase 3.
3. Decidir en Notion si C4 precede a Fase 9; no iniciar C4 sin una tarea con alcance, dependencia y nodo Figma enlazados.
4. Ejecutar la Fase 9 únicamente bajo demanda: validación responsive, verificaciones solicitadas y E2E del ciclo completo.

## Riesgos y bloqueos documentales

- Notion estaba desactualizado respecto al repositorio: solo trazaba Fase 3 y no las fases 4–8.
- C4 es un objetivo de producto documentado, no una capacidad implementada.
- La validación integral no se ha ejecutado como fase de aceptación; los estados “implementada” no deben elevarse a “hecha” sin evidencia.
