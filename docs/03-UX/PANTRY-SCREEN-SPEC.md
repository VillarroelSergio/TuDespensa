---
title: Especificación de pantallas — Despensa
aliases:
  - Pantry Screen Spec
tags:
  - midespensa
  - ux
  - despensa
status: active
revision: 3
updated: 2026-07-21
notion_task: "https://app.notion.com/p/3a1ad407cbfd81a7a919c872fc2a4738"
related:
  - "[[CORE-MVP-FLOWS-SPEC]]"
  - "[[SHOPPING-SCREEN-SPEC]]"
---

# Especificación de pantallas — Despensa

## Propósito

Mantener una imagen compartida de lo que hay en casa mediante correcciones ligeras. La precisión se adapta al tipo de alimento: unidades para productos contables, cantidad para peso o volumen y estados aproximados cuando medir no aporta valor.

## D1 — Lista priorizada

- H1: **Despensa**, búsqueda y CTA **Añadir producto**.
- Una lista continua; primero productos que requieren atención, después el resto.
- Cada fila muestra nombre, señal de estado y el tipo de seguimiento elegido.
- Los productos por unidades muestran el contador actual, por ejemplo `3 uds.`, y la acción rápida **Ajustar**; los de peso o volumen muestran su cantidad solo si se conoce; los aproximados muestran solo su estado.
- **Queda poco** y **Se terminó** permanecen como acciones rápidas. Para productos por unidades, **Ajustar** abre el mismo control compacto con `−1`, número actual y `+1`.
- No se pide cantidad ni caducidad en la lista para productos aproximados.
- Abrir una fila lleva al detalle; no hay múltiples botones secundarios.

## D2 — Detalle de producto

- Nombre y estado de presencia.
- Tipo de seguimiento: **Unidades exactas**, **Peso o volumen** o **Presencia aproximada**.
- Cantidad y unidad opcionales según el tipo: unidades enteras para el primero; gramos, kilos, mililitros o litros para el segundo; sin cantidad para el tercero.
- Al añadir un producto, una unidad como `ud.`, lata, botella, yogur o huevo propone **Unidades exactas**; `g`, `kg`, `ml` o `l` propone **Peso o volumen**. El usuario puede cambiarlo.
- Fecha de entrada, movimientos, recetas relacionadas y corrección avanzada se muestran solo aquí.
- CTA **Guardar cambios**. Eliminar o marcar como terminado solicita confirmación y ofrece Deshacer.

### Estado de implementación

- La UI actual permite abrir el panel de detalle o el formulario de alta desde **Añadir producto**. El alta usa `pantry_record_entry` con zona `pantry`, y admite unidades exactas, peso/volumen o presencia aproximada.
- El patrón visual implementado reutiliza el panel D2 del nodo Figma `31:212`: panel lateral en escritorio y tablet, y vista consecutiva en móvil.
- La confirmación completa de compra ya está disponible mediante C2 de Compra: los productos marcados se revisan antes de entrar en Despensa y la confirmación es idempotente. Las altas nuevas se incorporan a la zona `pantry`.

### Implementación D3 — fase `feature/pantry-d3`

- Los productos por unidades incorporan `−1 / cantidad / +1`; los de peso o volumen usan incrementos de `250 g`, `0,25 kg`, `250 ml` o `0,5 l`; los aproximados muestran `Hay`, `Queda poco` y `Se terminó`.
- `Queda poco` conserva la cantidad o presencia original mediante `attention_state`, en lugar de convertir un artículo medido a seguimiento aproximado.
- Al llegar a cero o marcar un producto como terminado se ofrece **Deshacer** con control optimista de versión. **Añadir a compra** incorpora el producto a la lista activa persistente sin modificar todavía Despensa.

## D3 — Correcciones rápidas y cantidades

- **Queda poco** actualiza el estado y lo prioriza para la próxima compra; no modifica una cantidad conocida ni lo añade automáticamente.
- **Se terminó** pone el contador de unidades en `0`, o elimina la presencia de los otros tipos, y muestra: `¿Añadir a Compra?` con acción **Añadir a compra**.
- En **Unidades exactas**, **Ajustar** permite sumar o restar una unidad. Al llegar a `0`, el estado pasa a `Se terminó`; no se permiten valores negativos.
- En **Peso o volumen**, **Ajustar** abre el valor actual y accesos a incrementos configurados por unidad, por ejemplo `± 250 g` o `± 0,5 l`. No se convierten unidades ni se deduce consumo automáticamente.
- En **Presencia aproximada**, el control muestra solo **Hay**, **Queda poco** y **Se terminó**.
- La confirmación de cocina y la compra terminada usan el mismo patrón de revisión antes de modificar presencia.

## Estados

| Estado | Mensaje | Acción |
| --- | --- | --- |
| Vacío | `Añade lo que tienes o termina una compra.` | Añadir producto |
| Sin resultados | `No encontramos «{término}».` | Añadir «{término}» |
| Pendiente de sincronizar | `Guardado en este dispositivo.` | Reintentar cuando haya conexión |
| Error | Conserva los datos visibles | Reintentar |

## Adaptación responsive

- Móvil: lista y detalle en vistas consecutivas.
- Tablet: detalle en panel cuando evita volver a la lista.
- Escritorio: lista priorizada a la izquierda y detalle a la derecha; las acciones rápidas siguen en cada fila y no dependen de hover.

## Criterios de aceptación

### UX-PAN-001 — Atención antes que precisión

La lista puede usarse sin cantidades ni caducidades y sitúa primero los productos que necesitan atención. Verificación: revisión manual.

### UX-PAN-002 — Corrección en un paso

Desde una fila, **Queda poco** o **Se terminó** se activa sin abrir el detalle. Un producto por unidades puede sumar o restar una unidad desde **Ajustar**, sin abrir un formulario completo. Verificación: prueba a 390 y 1440 px.

### UX-PAN-003 — Compra opcional y reversible

Tras **Se terminó**, añadir a Compra es opcional y ofrece Deshacer. Verificación: prueba manual de D3.

### UX-PAN-004 — Precisión adecuada al producto

Una Coca-Cola configurada como unidades exactas puede pasar de `3` a `2`; unos macarrones configurados por peso conservan su valor en gramos o kilos; un producto aproximado no exige cantidad. Verificación: prueba de los tres tipos y de cambio de tipo sin pérdida silenciosa.
