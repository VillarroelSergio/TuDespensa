---
title: MiDespensa — Contexto activo
aliases:
  - Active Context
tags:
  - midespensa
  - proyecto
  - contexto-activo
status: active
updated: 2026-07-19
notion_task: "https://app.notion.com/p/3a1ad407cbfd815d825cf4e1ceb998a9"
notion_architecture_task: "https://app.notion.com/p/3a1ad407cbfd81029a1be5ed18e31e6e"
figma_project: "https://www.figma.com/files/project/627466188"
figma: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih"
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[WORKFLOW]]"
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

[Diseñar wireframes del onboarding e inventario inicial](https://app.notion.com/p/3a1ad407cbfd815d825cf4e1ceb998a9)

- **Estado:** En curso
- **Fase:** UX/UI
- **Prioridad:** Alta
- **Entregable:** wireframes finalizados y organizados por módulo en el archivo maestro de Figma.

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

## Estado de implementación (2026-07-19)

- **Fases 0–2 completadas y verificadas** en `feature/mvp-init` (fusionada en `develop`, commit `2b89e6f`): scaffold Next.js + Supabase, migración con RLS/RPCs idempotentes, auth privada OTP/magic link con callback PKCE, middleware por estado de onboarding, pantallas O1–O6 según Figma + spec, rehidratación desde servidor y Realtime notificar→reconsultar con resincronización al (re)suscribirse.
- **Evidencia ejecutada:** lint, tsc, tests unitarios, build, test SQL de integración (patrón ROLLBACK) y **E2E real de dos sesiones** (`e2e/onboarding-two-sessions.spec.ts`, magic link vía Mailpit, convergencia Realtime en ambos sentidos) — criterio de salida de Fase 2 cumplido.
- **Fase 3, bloque 1 (capa de datos) completado** en `feature/pantry-catalog` (commit `8d3a668`): catálogo canónico + alias, modos `approximate|units|measure` con integridad en BD, movimientos inmutables, vista «consumir pronto», RPCs idempotentes con versión optimista, test SQL en verde.
- Flujo de trabajo: Fable 5 planifica/revisa/acepta; Codex Terra 5.6 (esfuerzo medio) implementa; correcciones de revisión documentadas en los mensajes de commit.

## Siguientes acciones

- **UX/UI:** conservar los wireframes finales como fuente de verdad y resolver en Figma únicamente las correcciones detectadas durante la revisión de implementación.
- **Arquitectura:** Fase 3 bloque 2 — UI de `DESPENSA` sobre la capa de datos ya aprobada, en cuanto Figma exponga la página; después Recetas (Fase 4) según el plan maestro.

## Bloqueos

- **Figma:** la integración solo expone la página `ONBOARDING` del archivo maestro; `DESPENSA`, `COMPRA`, `RECETAS` y `PLAN SEMANAL` no son accesibles todavía, y sin ellas no se implementa UI (regla del plan maestro).
- **Notion:** conexión verificada el 2026-07-19; la evidencia de Fase 2 y el estado de Fase 3 se han sincronizado con la tarea de Arquitectura.
