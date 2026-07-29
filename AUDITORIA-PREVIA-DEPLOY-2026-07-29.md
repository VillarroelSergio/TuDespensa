# Auditoría de la versión previa de MiDespensa

**URL auditada:** https://tu-despensa-9ask02hla-lupercal.vercel.app/plan  
**Deployment:** `dpl_BCMDU8ygBqxCC89FBRC1X6B5pa2p`  
**Fecha:** 2026-07-29  
**Alcance:** navegación autenticada, rendimiento observado, consola, logs de Vercel, responsive y revisión estática del código.

## Resultado

La versión previa es funcional y no presenta bloqueos en el deployment actual. El veredicto es **APTA CON CORRECCIONES**: estable, pero con varios cuellos de botella y dos defectos móviles claros.

## Mediciones autenticadas

| Ruta | Carga observada |
|---|---:|
| Plan, 1440 px | 439 ms |
| Plan, 768 px | 475 ms |
| Plan, 390 px | 852 ms |
| Compra | 481 ms |
| Hogar | 589 ms |
| Despensa poblada | 745 ms |
| Recetas, 164 disponibles | 751 ms |
| Selector `/plan/elegir` | **1.295–1.487 ms** en tres intentos |

Son tiempos de navegación completa observados en el navegador, no Core Web Vitals reales. El deployment no incluye Speed Insights, por lo que no sería riguroso inventar LCP, INP o CLS.

Aspectos positivos:

- Sin errores ni avisos de consola.
- Sin overflow horizontal en 390, 768 o 1440 px.
- Búsquedas fluidas: Despensa ~24 ms de trabajo efectivo; selector ~43 ms, descontando la espera de observación.
- Navegación, selector, menú de opciones, recetas, compra y hogar cargaron correctamente.
- No se ejecutaron acciones que modificasen datos.

## Hallazgos prioritarios

### 1. Selector de recetas demasiado caro — Alta

`/plan/elegir` es consistentemente la ruta más lenta.

- `getRecipes()` realiza aproximadamente cuatro consultas.
- `getSuggestions()` realiza aproximadamente once consultas.
- Ambos vuelven a autenticar y consultan recetas, preferencias y categorías parcialmente duplicadas.
- Las 164 recetas completas se serializan hacia el componente cliente aunque inicialmente solo se muestran 13 recomendaciones.

La duplicación comienza en [`src/app/(protected)/plan/elegir/page.tsx`](<D:/MiDespensa/src/app/(protected)/plan/elegir/page.tsx:28>) y se materializa en [`src/modules/plan/actions.ts`](D:/MiDespensa/src/modules/plan/actions.ts:253). Además, [`ChooseRecipeView.tsx`](D:/MiDespensa/src/modules/plan/ChooseRecipeView.tsx:83) recibe toda la biblioteca.

Recomendaciones:

- Crear una única consulta/RPC para obtener sugerencias, recomendadas y metadatos de búsqueda.
- Compartir cliente y autenticación.
- Evitar enviar 164 recetas al navegador inicialmente; cargar resultados al buscar o enviar un índice mínimo.
- Precalcular categorías y normalizaciones del catálogo.

Objetivo: **<700 ms en caliente y <1 s en frío**.

### 2. Despensa renderiza demasiado — Alta

Con los datos actuales se generan:

- **1.504 nodos DOM**.
- **638 controles**, 632 visibles.
- Todos los productos y sus botones de edición, cantidad, terminado y eliminación se montan simultáneamente.

El origen está en el mapeo completo de [`PantryList.tsx`](D:/MiDespensa/src/modules/pantry/PantryList.tsx:204).

Recomendaciones:

- Mostrar inicialmente un número limitado por zona con “Mostrar más”, o virtualizar.
- Convertir cada fila en un único control principal y trasladar ajustes secundarios al detalle.
- Mantener el buscador actual: el filtrado funciona bien y reduce el DOM a 125 nodos.

Objetivo: **menos de 500 nodos iniciales y menos de 150 controles montados**.

### 3. Objetivos táctiles insuficientes en Plan — Alta

En móvil se midió:

- “Opciones”: **15 px de alto**.
- Enlaces de título de receta: **17 px de alto**.

No cumplen el objetivo táctil de 44 px establecido en la especificación. La causa es visible en [`styles.css`](D:/MiDespensa/src/app/styles.css:1687).

Aplicar `min-height: 44px`, alineación vertical y un área clicable sobre toda la fila, no solo sobre el texto.

### 4. Solapamiento en Hogar móvil — Media

A 390 px, el título “Hogar: Mi hogar” queda debajo del botón fijo “Cerrar sesión”. La posición fija se define en [`styles.css`](D:/MiDespensa/src/app/styles.css:2734), mientras el contenido no reserva espacio.

Solución: cabecera móvil en `flex`, o `padding-right` suficiente para el botón. Es preferible que cerrar sesión forme parte de la cabecera en vez de flotar sobre ella.

### 5. El login pierde el destino original — Media

Al solicitar `/plan` sin sesión, después de autenticarse se abre `/despensa`. El destino está codificado directamente en [`login/page.tsx`](<D:/MiDespensa/src/app/(auth)/login/page.tsx:88>).

Conviene conservar un parámetro `returnTo` validado para volver a `/plan`, evitando fricción y una navegación adicional.

### 6. Middleware y prefetch amplifican consultas — Media

Cada navegación protegida pasa por autenticación, membresía y hogar en [`middleware.ts`](D:/MiDespensa/src/middleware.ts:11). El Plan también precarga rutas de navegación y detalles de recetas; se observaron 11 chunks JS, dos CSS y múltiples solicitudes RSC.

Recomendaciones:

- Reducir consultas repetidas del middleware.
- Revisar qué enlaces necesitan `prefetch`.
- Evitar precargar detalles de todas las recetas visibles cuando probablemente no se abrirán.
- Migrar `middleware.ts` a `proxy.ts`, ya marcado como deprecado por Next 16.

### 7. Observabilidad insuficiente — Media

En el deployment actual, durante las últimas 24 horas:

- 277 respuestas 200.
- 38 respuestas 304.
- 36 respuestas 204.
- 2 redirecciones 307.
- **0 errores, warnings, 4xx o 5xx**.

Sin embargo, los logs solo muestran solicitudes; no existen tiempos internos de consultas, ranking o acciones.

Recomendaciones:

- Añadir Speed Insights para LCP, INP, CLS, FCP y TTFB reales.
- Añadir logs estructurados con ruta, fase, duración y request ID, sin PII.
- Instrumentar especialmente `getSuggestions`, Despensa y acciones de Compra.
- Crear alertas para `upstream request timeout`.

En los últimos siete días hubo errores en deployments anteriores —18 refresh tokens inválidos, 11 llamadas a una RPC ausente y 9 timeouts—, pero **no deben atribuirse al deployment probado**, donde ya no aparecen.

## Higiene técnica

El build actual terminó correctamente en 24 segundos, pero muestra:

- `engines.node: ">=24"` puede saltar automáticamente a futuras versiones mayores; conviene fijar `24.x`.
- `middleware` está deprecado.
- Advertencia al recuperar submódulos Git, aunque el árbol local no contiene `.gitmodules`.
- La fuente Inter se carga mediante `@import` de Google en [`styles.css`](D:/MiDespensa/src/app/styles.css:1). Usaría `next/font` para servirla localmente y eliminar la dependencia externa bloqueante.
- El preview incluye el script de feedback de Vercel; producción debería ser ligeramente más rápida.

## Limitaciones

No se verificaron cámara/OCR, recorridos que modifican datos ni comparación visual contra baseline. La auditoría automática de teclado quedó inconclusa por una limitación del controlador de foco, por lo que no se afirma que la aplicación sea completamente accesible.

## Orden recomendado

1. Optimizar el selector del Plan.
2. Reducir el DOM inicial de Despensa.
3. Corregir objetivos táctiles y solapamiento de Hogar.
4. Preservar el destino original tras el login.
5. Reducir trabajo del middleware y revisar prefetch.
6. Añadir observabilidad real y corregir avisos del build.

## Veredicto

**APTA CON CORRECCIONES.** No hay un bloqueo operativo en el deployment actual, pero el selector de recetas, la Despensa poblada y los controles táctiles deben priorizarse antes de considerar el MVP listo para un uso privado estable.
