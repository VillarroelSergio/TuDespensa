---
title: Contrato funcional del MVP — MiDespensa
aliases:
  - MVP Functional Brief
tags:
  - midespensa
  - requisitos
  - mvp
status: draft
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[PRODUCT-BRIEF]]"
  - "[[INFORMATION-ARCHITECTURE]]"
---

# Contrato funcional del MVP — MiDespensa

**Estado:** Borrador para validación
**Revisión:** 3
**Fecha:** 19 de julio de 2026
**Documento de referencia:** `docs/PRODUCT-BRIEF.md`

## 1. Objetivo

Permitir que los miembros de un hogar establezcan primero una línea base manual de sus alimentos disponibles y, a partir de ella, reúnan recetas, planifiquen comidas y cenas, obtengan una lista de compra compartida y mantengan una estimación útil de la despensa.

## 2. Actores

### Visitante

Persona no autenticada. Solo puede iniciar el acceso de una de las dos cuentas autorizadas; no existe registro público.

### Propietario del hogar

Primera cuenta autorizada del hogar. Puede utilizar todas las funciones alimentarias y administrar el único hogar.

### Miembro del hogar

Segunda cuenta autorizada. Puede consultar y modificar recetas, menú, compra y despensa. No puede eliminar el hogar ni sustituir a la cuenta propietaria.

### Sistema

Procesa consolidaciones, actualiza existencias mediante confirmación, calcula la confianza de los datos y genera sugerencias explicables.

## 3. Alcance

### Incluido

- Registro e inicio de sesión.
- Inicialización de un único hogar con un máximo de dos cuentas autorizadas.
- Informe inicial manual y guiado de los alimentos disponibles antes de entrar en el uso habitual.
- Rechazo estricto de cualquier identidad que no pertenezca al hogar autorizado.
- Recetario estructurado y compartido dentro del hogar.
- Dataset inicial de recetas preferidas y mediterráneas con procedencia registrada.
- Categorías, favoritos y puntuación individual de recetas.
- Captura rápida de enlaces de recetas.
- Planificador semanal de comidas y cenas con navegación por fechas.
- Sugerencias de platos controladas por el usuario.
- Lista de compra consolidada y compartida.
- Organización opcional por supermercado.
- Despensa por presencia aproximada, unidades exactas o peso/volumen opcional según el producto.
- Priorización de perecederos por antigüedad estimada.
- Actualización asistida al comprar, cocinar o registrar consumo manual.
- Avisos contextuales cuando información relevante de menú, compra o despensa necesite revisión.

### Excluido

- Modelos de IA locales o modelos generativos externos conectados mediante API.
- Generación automática de un menú completo.
- Cálculo exhaustivo de calorías o macronutrientes.
- Recomendaciones clínicas o deportivas personalizadas.
- Comparación de precios entre supermercados.
- Control manual obligatorio de caducidades.
- Compra integrada con supermercados.
- Recetas públicas, comunidad, comentarios o valoraciones.
- Funcionamiento completo sin conexión.
- Registro público, hogares adicionales y más de dos cuentas.
- Funciones de crecimiento, administración multiinquilino o cambio entre hogares.

## 4. Restricciones confirmadas y supuestos revisables

### Restricciones confirmadas

- La aplicación sirve a un único hogar.
- Existen como máximo dos cuentas autenticadas.
- No se diseñará para crecimiento de usuarios, hogares adicionales ni registro público.

### Supuestos revisables

- El método de registro e inicio de sesión está pendiente de decidir. No se presupone correo, contraseña, Google, Apple ni otro proveedor.
- Las recetas serán privadas para los miembros del hogar.
- Todos los miembros podrán modificar los datos alimentarios del hogar.
- El propietario tendrá las únicas acciones administrativas destructivas.
- Una semana gestionada tendrá inicialmente al menos 10 de sus 14 comidas y cenas planificadas.
- La aplicación requerirá conexión para sincronizar datos; podrá conservar visualmente la información ya cargada, pero no se garantiza edición sin conexión.

## 5. Recorridos esenciales

### Recorrido A — Primer valor

1. El usuario crea una cuenta y un hogar.
2. Define o invita a los integrantes.
3. Recorre las zonas propuestas y añade manualmente los alimentos disponibles.
4. Revisa y confirma la despensa inicial.
5. Elige como siguiente acción añadir recetas, planificar o, cuando esté disponible, cargar un ticket.

### Recorrido B — Planificación aconsejada

1. El usuario abre una semana parcialmente vacía.
2. Solicita sugerencias para un hueco.
3. El sistema ordena recetas según despensa, productos prioritarios, favoritos y puntuaciones de ambas personas, variedad, repetición reciente, tiempo y orientación mediterránea.
4. El sistema explica los principales motivos de cada sugerencia.
5. El usuario elige, descarta o busca otra receta.

### Recorrido C — Compra

1. El usuario genera la lista desde el menú.
2. El sistema consolida ingredientes y considera la despensa.
3. Cualquier miembro añade productos manuales o asigna supermercados.
4. Durante la compra, se marcan productos como comprados.
5. Al finalizar, el usuario revisa qué productos se incorporarán a la despensa.

### Recorrido D — Cocina

1. El usuario abre una receta planificada.
2. Ajusta raciones si es necesario.
3. Marca la receta como cocinada.
4. El sistema propone descontar los ingredientes conocidos.
5. El usuario confirma o corrige los cambios.

### Recorrido E — Consumo no planificado

1. El usuario abre un producto de la despensa.
2. Indica “queda poco” o “se terminó”.
3. El sistema actualiza su estado y la confianza asociada.
4. Si se terminó, el usuario puede añadirlo a la compra con una acción.

## 6. Criterios de aceptación

### AC-001 — Acceder al único hogar autorizado

- **Escenario:** una de las dos identidades autorizadas todavía no ha iniciado sesión.
- **Acción:** completa el mecanismo de acceso que se defina.
- **Resultado esperado:** obtiene acceso al único hogar compartido y puede continuar el recorrido correspondiente.
- **No debe:** crear otro hogar ni permitir acceso a una tercera identidad.
- **Verificación:** prueba de integración con las dos identidades autorizadas y prueba negativa con una identidad ajena.
- **Prioridad:** requerida.

### AC-002 — Invitar y sincronizar miembros

- **Escenario:** existe la cuenta propietaria y una segunda identidad autorizada pendiente de acceso.
- **Acción:** la segunda persona completa el mecanismo de incorporación definido.
- **Resultado esperado:** ambos ven el mismo menú, recetario, compra y despensa; los cambios confirmados por uno aparecen para el otro sin recargar manualmente la aplicación.
- **No debe:** autorizar una tercera cuenta ni reutilizar una incorporación revocada.
- **Verificación:** prueba de integración con dos sesiones y revisión de sincronización concurrente.
- **Prioridad:** requerida.

### AC-003 — Proteger las acciones administrativas

- **Escenario:** un miembro que no es propietario accede a la configuración del hogar.
- **Acción:** intenta eliminar el hogar o expulsar al propietario.
- **Resultado esperado:** la operación se rechaza y los datos permanecen sin cambios.
- **No debe:** confiar únicamente en ocultar el botón en la interfaz.
- **Verificación:** pruebas de autorización en servidor y revisión manual de la interfaz.
- **Prioridad:** requerida.

### AC-004 — Crear una receta estructurada

- **Escenario:** un miembro está dentro de su hogar.
- **Acción:** registra nombre, raciones, ingredientes con cantidad y unidad, tiempos, etiquetas y pasos.
- **Resultado esperado:** la receta queda disponible para los miembros y puede utilizarse en el planificador y la compra.
- **No debe:** publicar la receta fuera del hogar.
- **Verificación:** prueba funcional de creación, lectura y edición.
- **Prioridad:** requerida.

### AC-005 — Guardar una receta incompleta sin bloquear al usuario

- **Escenario:** un miembro encuentra una receta en internet pero no quiere estructurarla todavía.
- **Acción:** guarda su enlace y un nombre.
- **Resultado esperado:** la receta queda en estado “pendiente de completar” y puede recuperarse después.
- **No debe:** utilizar ingredientes inexistentes de esa receta para generar una compra.
- **Verificación:** prueba funcional y revisión manual del estado pendiente.
- **Prioridad:** importante.

### AC-006 — Ajustar raciones

- **Escenario:** una receta tiene ingredientes cuantificados y unas raciones base.
- **Acción:** el usuario cambia las raciones al planificar o cocinar.
- **Resultado esperado:** las cantidades escalables cambian proporcionalmente y las notas no cuantificables permanecen identificadas como tales.
- **No debe:** inventar conversiones entre unidades incompatibles.
- **Verificación:** pruebas unitarias de escalado, redondeo y unidades no convertibles.
- **Prioridad:** requerida.

### AC-007 — Planificar comidas y cenas

- **Escenario:** un miembro consulta cualquier semana.
- **Acción:** asigna una receta y sus raciones a una comida o cena.
- **Resultado esperado:** el evento aparece en la semana, alimenta la lista de compra y es visible para el hogar.
- **No debe:** modificar otros días o comidas sin una acción explícita.
- **Verificación:** prueba funcional del planificador y revisión manual móvil/escritorio.
- **Prioridad:** requerida.

### AC-008 — Duplicar una semana

- **Escenario:** existe una semana con varias comidas planificadas.
- **Acción:** el usuario la copia a otra semana.
- **Resultado esperado:** se crea una copia editable que conserva recetas y raciones sin vincular futuras ediciones entre ambas semanas.
- **No debe:** duplicar automáticamente listas de compra completadas ni consumos históricos.
- **Verificación:** prueba de integración del calendario.
- **Prioridad:** importante.

### AC-009 — Sugerir platos con explicación

- **Escenario:** existe un hueco del menú y hay recetas utilizables.
- **Acción:** el usuario solicita sugerencias.
- **Resultado esperado:** recibe exactamente tres opciones ordenadas, con hasta tres motivos comprensibles relacionados con existencias, prioridad de consumo, variedad, tiempo u orientación mediterránea, y una indicación de los productos faltantes cuando corresponda.
- **No debe:** afirmar que el menú o la dieta completa son clínicamente adecuados.
- **Verificación:** conjunto de escenarios de evaluación con datos sintéticos y revisión humana de explicaciones.
- **Prioridad:** requerida.

### AC-010 — Consolidar la lista de compra

- **Escenario:** la semana contiene recetas estructuradas con raciones definidas.
- **Acción:** el usuario genera o actualiza la lista.
- **Resultado esperado:** los ingredientes equivalentes con unidades compatibles se suman, las existencias cuantificadas se descuentan y los productos manuales se conservan.
- **No debe:** fusionar ingredientes ambiguos ni convertir unidades incompatibles de forma silenciosa.
- **Verificación:** pruebas unitarias del motor de consolidación y casos funcionales de lista.
- **Prioridad:** requerida.

### AC-011 — Colaborar en la compra

- **Escenario:** dos miembros tienen abierta la misma lista.
- **Acción:** uno añade, edita, asigna tienda o marca un producto.
- **Resultado esperado:** el otro recibe el cambio y el estado final no contiene duplicados causados por reintentos.
- **No debe:** perder silenciosamente una modificación simultánea.
- **Verificación:** prueba de concurrencia con dos sesiones y prueba de idempotencia.
- **Prioridad:** requerida.

### AC-012 — Incorporar una compra a la despensa

- **Escenario:** existen productos marcados como comprados.
- **Acción:** el usuario finaliza y confirma la compra.
- **Resultado esperado:** se presenta un resumen editable y los productos confirmados se añaden o incrementan una sola vez, registrando su fecha de entrada.
- **No debe:** volver a incrementar existencias si la confirmación se reintenta.
- **Verificación:** prueba de integración e idempotencia del cierre de compra.
- **Prioridad:** requerida.

### AC-013 — Mantener una despensa aproximada

- **Escenario:** un miembro consulta o edita un producto.
- **Acción:** selecciona presencia aproximada, unidades exactas o peso/volumen y ajusta el valor cuando corresponda.
- **Resultado esperado:** el estado queda disponible para el hogar y se registra cuándo fue confirmado; las unidades exactas se pueden incrementar o reducir sin valores negativos.
- **No debe:** exigir una cantidad o caducidad para guardar un producto aproximado, ni convertir unidades incompatibles.
- **Verificación:** prueba funcional de los tres tipos de seguimiento, estados y cantidades opcionales.
- **Prioridad:** requerida.

### AC-014 — Priorizar perecederos sin fingir una caducidad

- **Escenario:** existen frutas, verduras o lácteos con distintas fechas de entrada.
- **Acción:** el usuario consulta la despensa o pide sugerencias.
- **Resultado esperado:** el sistema puede señalar productos como “consumir pronto”, indicando que es una estimación por categoría y antigüedad.
- **No debe:** mostrar una fecha de caducidad inventada ni asegurar que un alimento es seguro o inseguro.
- **Verificación:** pruebas de reglas y revisión manual del lenguaje utilizado.
- **Prioridad:** requerida.

### AC-015 — Descontar una receta cocinada

- **Escenario:** una receta planificada contiene ingredientes presentes en la despensa.
- **Acción:** el usuario la marca como cocinada.
- **Resultado esperado:** ve una propuesta de consumos, puede corregirla y solo después de confirmar se modifican las existencias.
- **No debe:** producir cantidades negativas ni descontar ingredientes no confirmados.
- **Verificación:** pruebas de integración con cantidades suficientes, insuficientes y desconocidas.
- **Prioridad:** requerida.

### AC-016 — Registrar consumo rápido

- **Escenario:** un producto se consume fuera de una receta.
- **Acción:** un miembro marca “queda poco” o “se terminó”.
- **Resultado esperado:** la despensa se actualiza y, cuando se termina, ofrece añadir el producto a la compra sin hacerlo automáticamente.
- **No debe:** generar una compra sin confirmación.
- **Verificación:** prueba funcional del flujo rápido.
- **Prioridad:** requerida.

### AC-017 — Señalar información que necesita revisión

- **Escenario:** un área contiene información antigua, incompleta o estimada.
- **Acción:** un miembro consulta esa área o el elemento afectado.
- **Resultado esperado:** ve una indicación discreta que explica qué necesita revisión y puede corregirlo desde el mismo contexto.
- **No debe:** crear un dashboard adicional, mostrar una puntuación global ni presentar datos estimados como hechos.
- **Verificación:** escenarios con datos completos, parciales y antiguos, más revisión de comprensión con usuarios.
- **Prioridad:** importante.

### AC-018 — Recuperarse de errores de red

- **Escenario:** una operación de compra, cocina o despensa se interrumpe o se reintenta.
- **Acción:** el cliente vuelve a enviar la misma operación.
- **Resultado esperado:** el usuario recibe un resultado claro y el estado final contiene como máximo una mutación efectiva.
- **No debe:** duplicar cantidades, compras o consumos.
- **Verificación:** pruebas de integración con fallos y reintentos simulados.
- **Prioridad:** requerida.

### AC-019 — Completar el informe inicial manual

- **Escenario:** el usuario ha creado un hogar y definido sus integrantes, pero todavía no existe una despensa inicial confirmada.
- **Acción:** revisa frigorífico, congelador y despensa o armario, y añade alimentos mediante búsqueda o selección rápida.
- **Resultado esperado:** cada producto queda asociado al hogar con estado “hay”, cantidad opcional, zona y fecha de confirmación; el progreso se guarda después de cada cambio.
- **No debe:** exigir cantidades exactas, caducidades ni completar de nuevo una zona ya guardada tras una interrupción.
- **Verificación:** prueba funcional en móvil, tablet y escritorio; prueba de persistencia al salir y reanudar.
- **Prioridad:** requerida.

### AC-020 — Confirmar la línea base antes del uso habitual

- **Escenario:** el hogar tiene un informe inicial en curso.
- **Acción:** el usuario revisa el resumen y confirma que ha terminado.
- **Resultado esperado:** la despensa queda marcada como línea base inicial y se presentan como siguientes acciones añadir recetas, planificar y cargar un ticket cuando esa capacidad esté habilitada.
- **No debe:** entrar silenciosamente en la aplicación principal sin confirmar el resumen ni presentar una función todavía no disponible.
- **Verificación:** prueba de integración del estado de onboarding y revisión manual del flujo completo.
- **Prioridad:** requerida.

### AC-021 — Cargar el dataset inicial sin duplicados

- **Escenario:** el único hogar todavía no ha recibido el catálogo inicial o una instalación repite la carga.
- **Acción:** se ejecuta la importación versionada de recetas preferidas y mediterráneas.
- **Resultado esperado:** cada receta válida queda estructurada con raciones, ingredientes, pasos, categorías y procedencia; repetir la misma versión produce el mismo conjunto sin duplicados.
- **No debe:** incorporar recetas sin procedencia identificable ni sobrescribir cambios realizados por el hogar.
- **Verificación:** validación automática del manifiesto, prueba de importación repetida y revisión humana de una muestra de recetas.
- **Prioridad:** requerida.

### AC-022 — Registrar categorías y preferencias individuales

- **Escenario:** cualquiera de las dos personas consulta una receta.
- **Acción:** marca o desmarca favorita y, opcionalmente, asigna una puntuación entera de 1 a 5.
- **Resultado esperado:** la preferencia queda asociada a esa persona y receta, puede modificarse y está disponible para calcular sugerencias del hogar.
- **No debe:** crear más de una preferencia activa por persona y receta ni alterar la puntuación de la otra persona.
- **Verificación:** pruebas funcionales con dos sesiones y restricciones de unicidad y rango.
- **Prioridad:** requerida.

### AC-023 — Incorporar preferencias a sugerencias explicables

- **Escenario:** existe un hueco del menú y varias recetas elegibles con distintas preferencias.
- **Acción:** el hogar solicita sugerencias.
- **Resultado esperado:** recibe exactamente tres opciones; favoritos y puntuaciones pueden mejorar su orden y la explicación indica cuando una preferencia ha influido.
- **No debe:** garantizar siempre una receta favorita, ignorar productos que conviene consumir, repetir platos en exceso ni permitir que la preferencia de una sola persona anule silenciosamente la de la otra.
- **Verificación:** escenarios sintéticos con preferencias coincidentes y opuestas, prueba determinista del ranking y revisión humana de explicaciones.
- **Prioridad:** requerida.

## 7. Riesgos que debe cubrir la implementación

| Área | Riesgo | Tratamiento requerido |
| --- | --- | --- |
| Privacidad | Acceso entre hogares | Autorización en servidor para cada recurso y prueba negativa entre hogares |
| Datos persistentes | Inventario incoherente | Confirmación previa, historial mínimo de movimientos e idempotencia |
| Concurrencia | Dos miembros editan a la vez | Sincronización, detección de conflicto y ausencia de pérdida silenciosa |
| Nutrición | Recomendaciones interpretadas como médicas | Lenguaje orientativo, motivos visibles y límites explícitos |
| Usabilidad | Exceso de mantenimiento | Cantidades opcionales, acciones rápidas y corrección simple |

## 8. Decisiones pendientes no bloqueantes

1. Confirmar si 10 de 14 comidas y cenas es el umbral adecuado para una semana gestionada.
2. Definir el mecanismo de registro e inicio de sesión según privacidad, comodidad, coste y plataformas objetivo.
3. Decidir cuándo y cómo podrán compartirse recetas fuera del hogar.
4. Definir cuánto historial de movimientos de despensa verá el usuario.
5. Definir el tamaño y reparto por categorías del dataset inicial.
6. Ajustar con uso real los pesos de favoritos, puntuaciones, despensa, variedad y repetición reciente.

## 9. Verificación del MVP

El MVP se considerará funcionalmente aceptable cuando:

- todos los criterios requeridos tengan evidencia automatizada o manual;
- se complete el ciclo planificar → comprar → cocinar con dos sesiones del mismo hogar;
- ninguna prueba de aislamiento permita acceder a datos de otro hogar;
- los reintentos no dupliquen entradas ni consumos;
- el hogar piloto complete al menos tres semanas gestionadas de cuatro y valore con 4/5 o más la confianza en el estado mostrado.
