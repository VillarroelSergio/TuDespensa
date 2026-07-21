---
title: Especificación de pantallas — Compra
aliases:
  - Shopping Screen Spec
tags:
  - midespensa
  - ux
  - compra
status: proposed
revision: 2
updated: 2026-07-19
notion_task: "https://app.notion.com/p/3a1ad407cbfd81a7a919c872fc2a4738"
figma: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-3290"
related:
  - "[[CORE-MVP-FLOWS-SPEC]]"
  - "[[PANTRY-SCREEN-SPEC]]"
---

# Especificación de pantallas — Compra

## Propósito

Convertir el plan y las necesidades manuales en una lista única, compartida y verificable antes de incorporarla a Despensa.

## C1 — Lista activa

- H1: **Compra** y progreso discreto: `{comprados} de {total}`.
- Campo siempre visible: `Añade un producto`.
- Una única lista de productos consolidados; cada fila se marca con una pulsación.
- Las cantidades y el origen del producto solo aparecen al abrir la fila.
- CTA **Finalizar compra** solo aparece cuando hay al menos un producto marcado.
- Supermercados, historial y edición avanzada se sitúan en menú contextual.

## C2 — Compra terminada

- Activar **Finalizar compra** abre una revisión, no actualiza la despensa todavía.
- H1: **Revisa tu compra**.
- Se muestran los productos marcados como comprados y los cambios previstos: añadir, actualizar presencia o dejar sin cambios.
- CTA: **Confirmar en despensa**.
- Volver conserva las marcas de la lista.

## C3 — Estados

| Estado | Mensaje | Acción |
| --- | --- | --- |
| Lista vacía | `Añade productos o planifica una comida.` | Añadir producto |
| Sin compras marcadas | `Marca lo que ya has comprado para terminar.` | Continuar comprando |
| Error al confirmar | `Tus productos siguen revisados.` | Reintentar |
| Cambio remoto | Aviso discreto, sin ocultar marcas locales | Revisar lista |

## C4 — Registrar una compra desde un ticket

**Registrar ticket** vive en el menú contextual de Compra: no compite con marcar productos o finalizar una lista. Sirve para una compra realizada con o sin lista previa.

### Flujo

1. El usuario fotografía o selecciona el ticket y puede recortarlo o girarlo.
2. La aplicación muestra `Leyendo ticket…`; el ticket se procesa fuera de la pantalla de lista y se puede cancelar.
3. En **Revisar ticket**, cada línea detectada se presenta como producto editable con inclusión activada o desactivada, cantidad si se reconoce y una marca si la lectura es dudosa.
4. La tienda, fecha y total son metadatos opcionales y editables; nunca bloquean la confirmación.
5. **Confirmar productos en despensa** abre el mismo resumen de cambios de C2 y aplica únicamente las líneas incluidas.

### Reglas

- El OCR y el parseo proponen productos, pero no marcan ni incorporan nada a Despensa sin confirmación explícita.
- Si una línea coincide con un producto de la lista activa, se indica la coincidencia para evitar duplicados; el usuario decide si la vincula.
- Si no se puede leer el ticket, se mantiene la foto como referencia temporal y se ofrece añadir productos manualmente.
- La confirmación es idempotente: reintentarla no duplica entradas de Despensa.
- Los datos de importe no forman parte de la interfaz principal del MVP; quedan preparados para una futura función de gasto.

### Estados

| Estado | Mensaje | Acción |
| --- | --- | --- |
| Procesando | `Leyendo los productos del ticket…` | Cancelar |
| Lectura completa | `Revisa los productos antes de añadirlos.` | Revisar ticket |
| Lectura parcial | `Hemos marcado las líneas que necesitan revisión.` | Revisar ticket |
| Sin texto útil | `No hemos podido leer este ticket.` | Añadir productos manualmente |

## Adaptación responsive

- Móvil: una lista continua, campo fijo arriba y CTA al final.
- Tablet: mismo orden; puede mostrar el progreso junto a la cabecera.
- Escritorio: lista centrada con ancho limitado; la revisión puede abrirse en un panel lateral, sin duplicar la lista.

## Criterios de aceptación

### UX-SHOP-001 — Consolidación visible

Los productos del menú y los añadidos manuales aparecen en una lista única y editable. Verificación: revisión manual con ambos orígenes.

### UX-SHOP-002 — Entrada confirmada

Ningún producto marcado actualiza Despensa hasta activar **Confirmar en despensa**. Verificación: prueba C1 → C2.

### UX-SHOP-003 — Compra compartida simple

Marcar un producto requiere una pulsación y el progreso se actualiza sin cambiar el orden mental de la lista. Verificación: prueba a 390 px.

### UX-SHOP-004 — Ticket revisable

Un ticket solo genera propuestas editables; las líneas incluidas llegan a Despensa tras la misma confirmación explícita de C2. Verificación: pruebas con lectura completa, parcial, sin texto y reintento de confirmación.
