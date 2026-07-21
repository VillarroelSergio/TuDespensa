---
title: Wireflow de onboarding e inventario inicial
aliases:
  - Onboarding Wireflow
tags:
  - midespensa
  - ux
  - onboarding
  - inventario
status: approved
revision: 2
updated: 2026-07-19
notion_task: "https://app.notion.com/p/3a1ad407cbfd815d825cf4e1ceb998a9"
figma: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih"
related:
  - "[[INFORMATION-ARCHITECTURE]]"
  - "[[MVP-FUNCTIONAL-BRIEF]]"
  - "[[COMPETITIVE-BENCHMARK]]"
---

# Wireflow de onboarding e inventario inicial

**Estado:** flujo UX/UI aprobado; detalle de pantallas en [[ONBOARDING-SCREEN-SPEC]]  
**Revisión:** 2 — auditoría multidisciplinar

## Objetivo

Conseguir que una persona configure su hogar y declare una despensa inicial útil con el menor esfuerzo posible. El recorrido debe permitir interrupciones, no exigir cantidades y demostrar que los datos se han guardado antes de conducir al siguiente paso.

## Decisión principal

El flujo se reduce de nueve a seis pantallas:

`Configurar hogar → Frigorífico → Congelador → Despensa → Revisar → Despensa lista`

- Se fusionan bienvenida, nombre del hogar e integrantes.
- Se elimina la introducción independiente al inventario; la explicación aparece al comenzar el frigorífico.
- Se conservan las tres zonas separadas porque corresponden al modelo mental doméstico.
- La pantalla final no promete platos posibles si todavía no existen recetas utilizables.

## Principios

- Web móvil primero, adaptable sin cambiar el modelo mental.
- Una acción principal por pantalla y una secundaria como máximo.
- La presencia del alimento es suficiente; cantidad y caducidad quedan fuera del recorrido.
- Añadir varios alimentos no abre formularios ni pierde el foco de búsqueda.
- Una zona queda revisada al añadir al menos un alimento o declararla vacía.
- Cada cambio se conserva localmente y se sincroniza cuando sea posible.
- El usuario puede salir y continuar desde la última zona incompleta.
- No se afirmará que el proceso dura cinco minutos hasta medirlo.

## Pantallas definitivas

| ID | Pantalla | Contenido esencial | Acción principal |
| --- | --- | --- | --- |
| O1 | Configurar hogar | Promesa breve, `Mi hogar` precompletado, usuario actual e integrantes por nombre | Preparar mi despensa |
| O2 | Frigorífico | Explicación contextual, búsqueda, 6–8 sugerencias y lista de añadidos | Seguir con el congelador |
| O3 | Congelador | Mismo patrón de captura, progreso `Inventario: 2 de 3` | Seguir con la despensa |
| O4 | Despensa | Mismo patrón; aclara que incluye armarios de comida | Revisar lo que tengo |
| O5 | Revisión | Resumen y estado de las tres zonas, con edición contextual | Confirmar despensa |
| O6 | Despensa lista | Total guardado y explicación honesta de su utilidad | Añadir mi primera receta |

## Especificación por pantalla

### O1 — Configurar hogar

- Título: **Organiza la comida de casa**.
- Texto: `Ten a mano lo que tienes, tus recetas y el plan de la semana.`
- Campo `Nombre del hogar`, precompletado con `Mi hogar`.
- Fila `Tú` creada automáticamente.
- Acción secundaria `Añadir otra persona`, solicitando solo nombre o apodo.
- No pedir número de comensales, correo, permisos ni invitaciones.
- Acción principal: `Preparar mi despensa`.

El número habitual de personas se deriva inicialmente de los integrantes y podrá corregirse después.

### O2–O4 — Registrar una zona

- Progreso textual: `Inventario: n de 3`.
- Título de la zona.
- En O2: `Indica qué tienes. No necesitas añadir cantidades ni caducidades.`
- Campo con etiqueta visible `Añade un alimento` y ejemplo contextual.
- Entre 6 y 8 sugerencias frecuentes, en cuadrícula flexible y sin carrusel.
- Lista compacta `Añadidos (n)`.
- Si no hay coincidencia: `Añadir «texto»`.
- Si está duplicado: mantener el foco en el buscador, anunciar `Ya estaba añadido` y resaltar el existente.
- Tras añadir: limpiar el campo, conservar el foco y anunciar la selección.
- Mostrar `Mi [zona] está vacío/a` solo cuando no haya alimentos.
- Habilitar la acción principal cuando exista al menos un alimento o la zona esté declarada vacía.

Etiquetas principales:

- O2: `Seguir con el congelador`.
- O3: `Seguir con la despensa`.
- O4: `Revisar lo que tengo`.

### O5 — Revisión

- Título: **Revisa tu despensa**.
- Texto: `Puedes corregir cualquier zona antes de terminar.`
- Una fila por zona con recuento, dos ejemplos y estado `Vacía` cuando corresponda.
- Enlace accesible `Editar frigorífico`, `Editar congelador` o `Editar despensa`.
- Al terminar una edición, volver a esta pantalla.
- Acción principal: `Confirmar despensa`.
- No usar un modal de confirmación adicional.

### O6 — Despensa lista

- Título: **Tu despensa está lista**.
- Texto: `Hemos guardado 12 alimentos. Los usaremos para ayudarte a planificar y preparar la compra.`
- Acción principal inicial: `Añadir mi primera receta`.
- Acción secundaria: `Ir al plan`.

Solo cuando exista una fuente real de recetas compatibles podrá mostrarse la variante `Ideas que aprovechan lo que tienes`, explicando qué alimentos utiliza y qué podría faltar.

## Estados del sistema

### Guardado

- La interfaz se actualiza de inmediato.
- Los cambios se conservan localmente antes de sincronizarse.
- No mostrar indicador durante guardados breves.
- Si tarda: `Guardando…`; al terminar: `Guardado` de forma discreta.
- Si falla: `Pendiente de sincronizar · Reintentar`; no borrar datos. O2–O4 pueden avanzar con copia local, pero O5 espera la sincronización antes de confirmar.
- No afirmar que algo está guardado en el servidor cuando solo existe localmente.

### Zona vacía y eliminación

- Declarar una zona vacía avanza directamente y ofrece `Deshacer`, sin modal.
- La acción no se muestra cuando ya existen alimentos.
- Eliminar un alimento es inmediato y ofrece `Deshacer`.
- Vaciar una zona con contenido se reserva para una acción secundaria posterior y exige confirmación.

### Reanudación

- Abrir la última zona incompleta con todos los datos restaurados.
- Mostrar `Seguimos donde lo dejaste` sin bloquear.
- Situar el foco al comienzo de la pantalla actual.
- No repetir la configuración del hogar ni las instrucciones ya completadas.

## Patrón de componentes

1. `OnboardingShell`: contenido y pie persistente respetando teclado y área segura.
2. `StepHeader`: volver, progreso textual y título; volver nunca pierde datos.
3. `PrimaryButton`: único CTA dominante, etiqueta contextual y estado deshabilitado explicable.
4. `TextAction`: única acción secundaria visible.
5. `SearchAddCombobox`: etiqueta, resultados, alta personalizada y navegación por teclado.
6. `SuggestionChipGrid`: selección con texto o marca, nunca solo color.
7. `InventorySelectionList`: alimento, estado `Hay`, cantidad diferida y eliminación accesible.
8. `SaveStatus`: estado discreto mediante región accesible no intrusiva.
9. `ZoneSummaryRow`: zona, recuento, ejemplos, estado vacío y edición.
10. `UndoToast` y `SyncBanner`: recuperación reversible y fallo persistente.

## Responsive

- **Móvil:** una columna, margen de 16–24 px, controles de al menos 44 × 44 px y pie que no tape contenido ni foco.
- **Tablet:** contenedor centrado de aproximadamente 560–640 px, sin añadir funciones.
- **Escritorio:** contenedor máximo de aproximadamente 960 px; O2–O4 pueden mostrar búsqueda y selección en dos paneles, manteniendo el orden del documento.
- Ninguna acción dependerá de hover, arrastre, swipe o color.

## Accesibilidad verificable

- Un único H1 descriptivo por pantalla y orden de lectura igual al visual.
- Texto principal de al menos 16 px; funcionamiento a 200 % de zoom y 320 px de ancho sin desplazamiento horizontal.
- Contraste WCAG AA y foco visible de al menos 2 px.
- Recorrido completo con teclado, Enter y Espacio; Escape cierra las sugerencias.
- Combobox con nombre accesible, estado expandido y resultados asociados.
- Adiciones, duplicados y guardado anunciados sin mover el foco; fallos persistentes anunciados como alerta.
- Color nunca será la única señal de selección, progreso o error.
- Toda acción gestual tendrá una alternativa visible.

## Movimiento funcional

- Presión de botones: 100–160 ms y escala sutil.
- Añadir o eliminar fila: opacidad y desplazamiento máximo de 4 px durante 160–200 ms.
- Cambio de paso instantáneo o fundido de hasta 150 ms.
- Sin animaciones escalonadas en la captura repetitiva.
- Con movimiento reducido: conservar únicamente fundidos breves.

## Pruebas del prototipo

1. Añadir diez alimentos seguidos sin perder el foco.
2. Declarar una zona vacía y deshacer.
3. Salir durante el congelador y reanudar allí.
4. Añadir un alimento no encontrado y detectar un duplicado.
5. Perder conexión durante el guardado sin perder información.
6. Editar una zona desde la revisión y regresar al resumen.
7. Completar el flujo solo con teclado y lector de pantalla.
8. Probar la pantalla final con y sin recetas compatibles reales.

## Hipótesis y métricas

- Tiempo total y tiempo por zona.
- Abandono por pantalla.
- Número de alimentos añadidos y uso de búsqueda.
- Zonas declaradas vacías.
- Interrupciones y reanudaciones.
- Comprensión del valor final sin explicación verbal.

La hipótesis de cinco minutos solo se aceptará si la mayoría completa el recorrido sin ayuda y entiende para qué servirán los datos.

## Metodología aplicada

- Auditoría de producto con ECC `product-lens`.
- Revisión independiente mediante agentes de producto, interacción móvil y accesibilidad/UX writing.
- Principios de diseño engineering de Emil Kowalski para feedback, valores por defecto y movimiento funcional.
- Ponytail está descargado como marketplace, pero no está activado en esta sesión y su propia guía excluye tareas de diseño sin código. Se reserva para la implementación.

## Estado de diseño

- Archivo maestro creado dentro del [proyecto Figma 627466188](https://www.figma.com/files/project/627466188): [MiDespensa — Wireframes y UI](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih).
- La definición funcional y de composición está desarrollada en [[ONBOARDING-SCREEN-SPEC]].
- Wireframes completos creados en el archivo maestro: O1–O6 en móvil (390 × 844 px) y escritorio (1280 × 900 px), organizados por paso de usuario. También existe un marco de anotaciones sobre adaptación responsive y CTAs.
- Pendiente: revisar los wireframes existentes contra esta especificación antes de considerarlos validados; no volver a generar el onboarding desde cero.
- Restricción operativa: para MiDespensa solo se utilizará el proyecto [627466188](https://www.figma.com/files/project/627466188) y su archivo maestro enlazado arriba.
