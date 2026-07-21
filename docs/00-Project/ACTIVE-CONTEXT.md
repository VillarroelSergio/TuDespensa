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
- **Fase 5A (plan semanal base) implementada** en `feature/weekly-plan-core` (migración `20260720130000_weekly_plan_core.sql`): `meal_plans` (una semana por hogar, identificada por su lunes ISO, creada de forma perezosa) y `planned_meals` con **unicidad por hogar, fecha y servicio** (`lunch`/`dinner`), RLS de solo lectura para miembros activos y Realtime. RPCs idempotentes `plan_set_meal` (valida servicio y raciones, exige que la receta sea del hogar, y reasignar un hueco sustituye la receta sin duplicarla) y `plan_clear_meal` (vaciar un hueco ya vacío devuelve `removed = 0` sin error, para que el «Deshacer» de 5B se pueda reintentar). Vista P1 (`WeekView`, componente de servidor): cabecera con rango de semana y navegación anterior/siguiente por enlace `?semana=YYYY-MM-DD` (sin estado de cliente), resumen `{n} de 14 comidas planificadas`, siete días en orden temporal con huecos Comida/Cena siempre presentes, texto guía una sola vez con el plan vacío y «Volver a esta semana» al navegar. Responsive: lista vertical a 390 px, dos columnas en tablet y siete columnas más barra lateral en escritorio. Test SQL 5A (idempotencia, lunes ISO, sustitución de hueco, comida/cena independientes, servicio/raciones inválidos, limpieza idempotente, aislamiento entre hogares) y test unitario del cálculo de semana (`weekStart`, cruce de mes/año, rangos y conteo). **Deltas conscientes:** el hueco vacío muestra su única acción **Añadir** deshabilitada porque el selector P2 es Fase 5B; el menú contextual (cambiar receta, ajustar raciones, mover, eliminar con Deshacer) también es 5B; las fechas se calculan en UTC a partir de `YYYY-MM-DD` para que el día no se desplace por zona horaria.
- **Fase 5B (selección y edición del plan) implementada** en `feature/weekly-plan-selection` (sin migración: consume las RPC `plan_set_meal` y `plan_clear_meal` de 5A). Vista P2 independiente en `/plan/elegir?fecha=&servicio=` (`ChooseRecipeView`): cabecera de retorno `Añadir a · martes, comida`, H1 «¿Qué quieres comer?», biblioteca guardada con búsqueda por título y estados «sin recetas guardadas» (enlace a Recetas) y «sin resultados» (ver todas). Elegir una receta confirma el hueco directamente y vuelve a la semana; abandonar P2 no modifica nada porque no hay borrador. En P1, el hueco vacío enlaza a P2 y el hueco ocupado abre un menú contextual (`<details>`, sin JavaScript de cliente) con **Cambiar receta**, **Ajustar raciones**, **Mover** (`<input type="date">` + servicio; escribe el destino antes de vaciar el origen) y **Eliminar**, que pide confirmación en un segundo `details` y deja un banner **Deshacer**. Server actions `assignMealAction` / `moveMealAction` / `removeMealAction` validan hueco, receta y raciones antes de llamar a la RPC. Tests unitarios de `slotLabel` y `parseUndo`. **Deltas conscientes:** las tres sugerencias explicables con motivo y disponibilidad son Fase 5C (aquí se lista la biblioteca con búsqueda); la consolidación de faltantes en Compra y su confirmación `Hemos añadido {n} productos` son Fase 6; el estado para deshacer viaja en la URL (`?deshacer=fecha:servicio:receta:raciones`) en vez de en un registro de deshacer; mover no es atómico entre las dos RPC, por lo que un fallo tras escribir el destino duplica la comida en vez de perderla.
- **Fase 5C (sugerencias explicables) implementada** en `feature/meal-suggestions` (sin migración: solo lectura de recetas, preferencias, categorías, despensa y plan). Módulo puro `src/modules/plan/suggestions.ts` con **pesos versionados** (`SUGGESTION_WEIGHTS_VERSION = 1`): disponibilidad proporcional a los ingredientes que ya están en la despensa (40), producto prioritario —bajo, marcado por el hogar o a consumir pronto— (25), favorito (12), puntuación por encima de 3 (3 por punto), variedad de tipo de plato frente a la semana mostrada (10), tiempo ≤ 30 min (8), orientación mediterránea (6) y repetición en la misma semana (−60, hunde sin prohibir). `rankSuggestions` devuelve **como máximo tres** y es determinista: a igual puntuación ordena por título y, si empata, por id. Cada sugerencia expone un motivo único por orden de peso (`Aprovecha {producto}` → `Lista en {n} min` → `Para variar esta semana`) y la línea de disponibilidad (`Puedes prepararla con lo que tienes` / `Necesitas comprar: {producto}, {producto}`). `getSuggestions` reúne los datos y delega la puntuación; las sugerencias se muestran en P2 (`/plan/elegir`) por encima del buscador y se ocultan al buscar, porque entonces la intención ya es explícita. El sistema **nunca crea recetas ni rellena huecos**: elegir sigue siendo una acción de la persona sobre el mismo `assignMealAction`. Tests unitarios del ranking (límite de tres, determinismo, faltantes con tildes, prioridad del motivo, penalización por repetición, factores visibles). **Deltas conscientes:** el emparejamiento ingrediente↔alimento es por inclusión de subcadena normalizada, no por catálogo canónico con alias; una receta sin ingredientes registrados puntúa 0 en disponibilidad en vez de 100 %, para no premiar fichas incompletas; solo se consideran recetas `ready` (una captura `pending` aún no se puede cocinar); los factores se calculan pero en P2 solo es visible el motivo principal.
- **Fase 6 (consolidación del plan en Compra) implementada** en `feature/shopping-plan-consolidation` (migración `20260720140000_shopping_plan_consolidation.sql`): `shopping_items` amplía `source` a `('manual','pantry','plan')` y añade `quantity numeric (>0)` y `unit_code` (enum `unit/g/kg/ml/l`). Nueva RPC idempotente `shopping_add_plan_items(items jsonb, idempotency_key)` que, sobre la lista activa del hogar, inserta como `source='plan'` los faltantes nuevos y, si el producto ya está, **no lo duplica, no lo desmarca y conserva el origen** (un manual sigue siendo manual); solo acumula la cantidad cuando las unidades son de la misma dimensión (helpers `private.unit_dimension/unit_to_base/unit_from_base`, base g/ml), y ante unidades incompatibles deja el producto sin cantidad antes que inventar una suma. Devuelve `{ added }`. Al **elegir una receta desde P2** (único punto que consolida; ajustar raciones o deshacer no tocan Compra, marcado con el hidden `consolidar=1`), `assignMealAction` calcula los faltantes reutilizando `missingIngredients` de `suggestions.ts` contra la despensa y llama a `addPlanItems`; el plan nunca falla porque Compra falle (se captura y se informa con `?compra=-1`). El aviso discreto vuelve a P1 vía `?compra={n}` → `shoppingNotice` → `Hemos añadido {n} producto(s) a Compra · Ver Compra`. En `/compra`, sección **Para el plan** separada de **Tu lista**, con etiqueta de cantidad (`500 g`, `2 uds.`). Test SQL 6 (added=2, origen manual preservado, idempotencia sin duplicar, suma de unidades compatibles, no-suma de incompatibles, aislamiento entre hogares) y tests unitarios de `missingIngredients` y `shoppingNotice`. **Deltas conscientes:** el emparejamiento ingrediente↔alimento sigue siendo por subcadena normalizada (sin catálogo canónico); la consolidación es síncrona dentro de `assignMealAction`, no un recálculo en segundo plano; solo se consolida al elegir receta, no al mover ni al deshacer; las cantidades de receta viajan tal cual sin escalar por raciones (el escalado por raciones es mejora futura).
- **Fase 7 (cierre de compra) implementada** en `feature/shopping-checkout` (migración `20260721100000_shopping_checkout.sql`): RPC de lectura `shopping_checkout_preview` que, por cada producto **comprado** de la lista activa, calcula la acción sobre la despensa (alta o actualización) buscando el alimento en cualquier zona y proyectando la cantidad resultante solo cuando las unidades miden lo mismo (reutiliza los helpers `private.unit_dimension/unit_to_base/unit_from_base` de Fase 6); y RPC idempotente `shopping_confirm_purchase(item_versions, idempotency_key)` que, por cada comprado, crea la entrada en la zona `pantry` (con cantidad si la compra la trae, si no presencia aproximada `some`) o actualiza el ítem existente (suma la cantidad si ambas miden lo mismo, si no solo refresca la presencia), registra un movimiento `entry` trazable (`item_snapshot.source = 'shopping_checkout'`) y saca el producto de la lista. Verifica la `version` de cada ítem revisado: si otro integrante lo cambió o desmarcó, aborta entero (`serialization_failure`→CONFLICT) para recargar sin aplicar a medias; el patrón `pantry_claim`/`pantry_store_result` garantiza idempotencia (un replay no duplica movimientos ni suma dos veces). UI: en C1 (`ShoppingList`) el placeholder pasa a CTA real **Confirmar compra · {n}** (deshabilitado sin comprados) → `/compra/revisar`; nueva vista C2 (`CheckoutReview`, `/compra/revisar`) con panel «Revisa tu compra», una línea por producto con su acción (`Añadir a despensa` / `Actualizar: 0.5 l → 1.5 l` / `Actualizar en despensa`), CTA **Confirmar en despensa** y **← Volver a la lista** (conserva las marcas); el refresco Realtime de `shopping_items` mantiene viva la revisión y el aviso `?confirmado={n}` → `confirmNotice` → «Hemos actualizado tu despensa con {n} producto(s)». Módulo puro `src/modules/shopping/presentation.ts` (`formatQuantity`, `checkoutActionLabel`, `confirmNotice`) reutilizado por C1 y C2. Test SQL 7 (preview alta+suma, confirmación crea/actualiza despensa con movimiento trazable, comprados salen de la lista, idempotencia sin doble aplicación, conflicto por versión, aislamiento entre hogares) y tests unitarios de `presentation`. **Deltas conscientes:** las altas nuevas van siempre a la zona `pantry` (armario) porque C2 no ofrece selector de zona; las cantidades no se escalan por raciones; un ítem de despensa `approximate` no se convierte a `measure` aunque la compra traiga cantidad (solo se marca presente); C4 (captura de ticket) sigue fuera de esta fase.
- Flujo de trabajo: Fable 5 planifica/revisa/acepta; Codex Terra 5.6 (esfuerzo medio) implementa; correcciones de revisión documentadas en los mensajes de commit.

## Siguientes acciones

- **UX/UI:** conservar los wireframes finales como fuente de verdad y resolver en Figma únicamente las correcciones detectadas durante la revisión de implementación.
- **Arquitectura:** Fases 4A–4C, 5A, 5B, 5C, 6 y 7 cerradas. Sigue C4 (captura de ticket de compra: OCR/importación de líneas detectadas, nodos Figma `COMPRA` 29:3999/29:4136) y la Fase 9 (verificaciones bajo demanda + cobertura E2E automatizada antes de declarar completos los flujos). La consolidación Plan→Compra (Fase 6) y el cierre de Compra→Despensa (Fase 7) cierran el recorrido principal de la lista.
- **Desarrollo:** no ejecutar verificaciones automáticamente; la persona responsable las realizará bajo demanda. Planificar una cobertura E2E automatizada antes de declarar los flujos completos.
- **Desarrollo local:** `next dev` permite acceder a la interfaz sin autenticación ni redirecciones de onboarding; el bypass está limitado a `NODE_ENV=development` y no habilita datos privados sin sesión de Supabase.

## Bloqueos

- **Figma:** los cinco nodos canónicos están accesibles y devuelven contexto de implementación: `ONBOARDING` ([7:1261](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=7-1261)), `DESPENSA` ([47:2](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=47-2)), `COMPRA` ([29:3290](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-3290)), `RECETAS` ([29:1906](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-1906)) y `PLAN SEMANAL` ([29:5](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-5)).
- **Notion:** conexión verificada el 2026-07-19; la evidencia de Fase 2 y el estado de Fase 3 se han sincronizado con la tarea de Arquitectura.
