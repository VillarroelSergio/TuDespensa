---
title: MiDespensa — Benchmark competitivo
aliases:
  - Competitive Benchmark
tags:
  - midespensa
  - investigacion
  - competencia
status: active
updated: 2026-07-18
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[PRODUCT-BRIEF]]"
  - "[[MVP-FUNCTIONAL-BRIEF]]"
---

# Benchmark competitivo

## Objetivo

Identificar soluciones comparables y extraer patrones útiles antes de diseñar el onboarding, el inventario inicial y el flujo principal de MiDespensa.

La comparación se centra en el problema del hogar fundador: reunir recetas dispersas, decidir comidas y cenas, conocer de forma aproximada qué hay en casa y generar una compra fiable sin mantener un inventario pesado.

## Alcance y método

- Revisión realizada el 18 de julio de 2026.
- Fuentes prioritarias: páginas oficiales, guías de producto y fichas oficiales de las aplicaciones.
- Criterios: recetas, planificación, compra, despensa, colaboración doméstica, captura automática, disponibilidad web y carga de mantenimiento.
- Las funciones anunciadas por cada proveedor no equivalen a una validación independiente de su calidad.

## Panorama

El mercado se divide en cuatro enfoques:

1. **Recetario primero:** Paprika y Samsung Food.
2. **Planificación primero:** Mealime y MealBoard.
3. **Compra compartida primero:** AnyList y Bring!.
4. **Despensa automatizada primero:** KitchenPal, Cooklist y nuevas soluciones basadas en tickets como Pantru o Expireless.

No existe un vacío funcional evidente. La oportunidad está en conectar estas áreas con menos mantenimiento y una experiencia más clara que las soluciones completas actuales.

## Competidores principales

| Producto | Fortalezas relevantes | Fricción o límite observado | Inspiración para MiDespensa |
| --- | --- | --- | --- |
| [MiDespensa existente](https://midespensa.app/landing-en) | PWA, recetas, despensa, planificación mensual, tickets, nutrición y gasto | Propuesta muy amplia; centrada en recibos y comercios de EE. UU.; usa el mismo nombre y una promesa muy próxima | Revisar identidad y diferenciación antes de publicar; evitar competir solo por acumulación de funciones |
| [KitchenPal](https://kitchenpalapp.com/) | Despensa por zonas, cantidades, entrada por texto, voz o código de barras, recetas según existencias, planificación y compra que descuenta lo disponible | Gran densidad funcional y fuerte dependencia de mantener cantidades y caducidades | Conectar despensa → sugerencias → compra, pero con estados aproximados y menos campos |
| [Cooklist](https://cooklist.com/cooklist-app) | Inventario, historial de compra, recetas, nutrición y colaboración de todo el hogar; entrada por código de barras o tarjeta de fidelización | Producto muy dependiente de integraciones comerciales y datos detallados | Un único hogar compartido y una vista común de despensa, compra y recetas disponibles |
| [MealBoard](https://mealboard.com/features.html) | Importación web y OCR de recetas, planificación, lista consolidada por tienda, precios y despensa | Muchas opciones y configuración; la experiencia completa está más orientada a aplicaciones instaladas | Importación rápida, mover compra a despensa y contemplar varios supermercados sin comparar precios todavía |
| [Paprika](https://www.paprikaapp.com/) | Importación web madura, ajuste de raciones, planificación semanal/mensual y consolidación de ingredientes por pasillo | La despensa es una sección administrativa y cada plataforma se vende por separado | Recetas estructuradas, escalado de cantidades y consolidación transparente de la compra |
| [Samsung Food](https://samsungfood.com/) | Web y móvil, captura de recetas desde sitios web, planificación semanal visual, lista en un paso, descubrimiento y nutrición | La despensa doméstica no es el centro y la abundancia de contenido puede distraer de la tarea diaria | Captura desde enlace y planificación visual sencilla; no convertir el inicio en un feed de recetas |
| [AnyList](https://anylist.net/meal-planning) | Listas, recetas y calendario compartidos en tiempo real; genera ingredientes desde un intervalo del plan | Menor profundidad de inventario y aprovechamiento de existencias | Colaboración doméstica invisible: ambos miembros trabajan sobre la misma información |
| [Mealime](https://www.mealime.com/) | Propuesta extremadamente clara: planificar, comprar y cocinar; personalización y lista automática | Se apoya principalmente en su catálogo y no resuelve una despensa doméstica completa | Mantener un bucle principal comprensible en tres acciones y reducir el tiempo hasta la primera utilidad |

## Referencias especializadas

### Tickets e inventario

- [Pantru](https://www.pantru.com/) plantea un flujo acertado: capturar ticket → revisar solo elementos dudosos → recibir sugerencias. Sus indicadores de confianza son una referencia útil para que el OCR futuro no aparente una precisión absoluta.
- [Expireless](https://expireless.app/) combina fotografía del ticket, clasificación automática entre frigorífico, congelador y despensa, revisión previa y entrada manual o por voz.
- [Cooklist](https://cooklist.com/cooklist-app) evita el ticket en algunos mercados mediante tarjetas de fidelización. Es potente, pero difícil de generalizar entre supermercados españoles.

### Decidir qué cocinar

- [SuperCook](https://www.supercook.com/recipes/en) demuestra el valor inmediato de empezar por los ingredientes disponibles y mostrar recetas compatibles.
- [Mealime](https://www.mealime.com/) demuestra que la simplicidad del recorrido puede ser más valiosa que una gran profundidad de inventario.

### Compra compartida

- [AnyList](https://anylist.net/) y [Bring!](https://getbring.com/en/home) son referencias para listas sincronizadas con muy poca fricción. La compra debe funcionar bien incluso antes de que el resto del sistema sea perfecto.

## Patrones que conviene adoptar

1. **Un bucle visible:** decidir → planificar → comprar → actualizar.
2. **Captura progresiva:** permitir guardar una receta por enlace antes de exigir toda su estructuración.
3. **Compra consolidada y explicable:** combinar equivalencias, conservar cantidades originales y permitir correcciones.
4. **Colaboración por defecto:** una sola realidad compartida para el hogar, sin acciones especiales de sincronización.
5. **Revisión por excepción:** cuando exista OCR, destacar únicamente líneas dudosas y confirmar el resto en bloque.
6. **Sugerencias con motivo:** explicar si un plato aprovecha existencias, aporta variedad o requiere poco tiempo.
7. **Entrada multimodal gradual:** texto y selección rápida en el MVP; ticket, voz, código de barras o fotografía cuando reduzcan trabajo de forma demostrable.

## Patrones que conviene evitar

1. Pedir cantidades exactas, fechas y ubicaciones para cada producto durante el alta.
2. Presentar recetas, despensa, planificación, nutrición y presupuesto como módulos independientes con el mismo peso.
3. Llenar el inicio con contenido editorial o un catálogo que oculte la decisión diaria.
4. Actualizar existencias automáticamente sin mostrar qué cambió ni permitir corregirlo.
5. Intentar una planificación mensual automática antes de demostrar que la semana y la decisión diaria son fiables.
6. Depender de integraciones con supermercados para que el ciclo básico funcione.

## Implicaciones para el onboarding

El informe inicial obligatorio sigue siendo coherente con la visión del producto, pero constituye la mayor fricción frente a competidores que permiten empezar por recetas o por la planificación. Por tanto:

- debe crear una **línea base útil**, no un inventario exhaustivo;
- debe completarse por frigorífico, congelador y despensa mediante selección rápida;
- presencia será suficiente y cantidad seguirá siendo opcional;
- las zonas vacías se resolverán con una sola acción;
- se guardará el progreso y podrá reanudarse;
- al finalizar debe mostrarse valor inmediato: platos posibles, productos que conviene aprovechar o una primera acción de planificación.

Hipótesis a validar: el alta completa debería poder resolverse en aproximadamente cinco minutos para una cocina habitual. Este objetivo no se convierte todavía en requisito hasta medirlo con un prototipo.

## Diferenciación recomendada

> [!important] Tesis
> MiDespensa no debe diferenciarse por reunir más funciones, sino por mantener una imagen suficientemente fiable del hogar con menos esfuerzo que recordarlo mentalmente.

La propuesta distintiva debería combinar:

- despensa aproximada que admite incertidumbre;
- decisión diaria asistida, no planificación rígida;
- recetas propias procedentes de cualquier fuente;
- lista que descuenta lo que probablemente ya existe;
- actualizaciones integradas al comprar y cocinar;
- indicación visible de qué datos están confirmados, estimados o necesitan revisión.

## Riesgo de identidad

Existe una aplicación activa bajo el nombre [MiDespensa](https://midespensa.app/landing-en) con PWA, despensa, recetas, planificación mensual, OCR de recibos, nutrición y seguimiento de gasto. La coincidencia es tanto nominal como funcional.

Antes de publicar, registrar un dominio o invertir en identidad visual será necesario realizar una investigación específica de nombre, disponibilidad de dominio, tiendas de aplicaciones y marcas. Este benchmark no constituye una búsqueda jurídica ni registral.

## Decisiones derivadas

1. Mantener el MVP centrado en semana, comidas y cenas; el mes seguirá siendo evolución.
2. Mantener cantidades opcionales y excluir caducidades obligatorias.
3. Diseñar el inventario inicial como captura rápida por zonas y no como formulario repetitivo.
4. Priorizar captura de recetas por enlace, colaboración doméstica y lista consolidada.
5. Preparar el modelo para OCR y revisión por confianza, sin incluir el OCR en el primer MVP.
6. Abrir una tarea de validación de nombre antes de trabajar la identidad pública.

## Próximo paso

Aplicar estos hallazgos a los wireframes del onboarding e inventario inicial. El prototipo debe validar especialmente el tiempo de alta, la claridad de las zonas y el valor mostrado inmediatamente después de confirmar la línea base.

