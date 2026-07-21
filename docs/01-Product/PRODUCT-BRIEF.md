---
title: MiDespensa — Product Brief
aliases:
  - Product Brief
tags:
  - midespensa
  - producto
status: active
version: "0.8"
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[MVP-FUNCTIONAL-BRIEF]]"
  - "[[INFORMATION-ARCHITECTURE]]"
  - "[[COMPETITIVE-BENCHMARK]]"
---

# MiDespensa — Product Brief v0.8

Estado: problema, usuario inicial, visión y límites del MVP validados de forma preliminar con el hogar fundador. Preparado para definir capacidades, flujos y requisitos verificables.

## 1. Visión

MiDespensa ayuda a una persona u hogar a decidir qué cocinar, aprovechar lo que ya tiene y comprar únicamente lo necesario, sin convertir la organización doméstica en otra tarea pesada.

## 2. Problema

La información necesaria para cocinar está fragmentada entre la memoria, recetas guardadas en distintos lugares, la nevera, notas de compra y decisiones improvisadas.

Esto provoca:

- tiempo perdido pensando qué cocinar;
- compras duplicadas u olvidadas;
- ingredientes que caducan sin utilizarse;
- menús poco variados o poco realistas;
- abandono de las herramientas cuando exigen registrar demasiados datos.

La dificultad principal no es almacenar información. Es mantenerla actualizada con menos esfuerzo que el método actual: recordar, mirar la nevera y escribir una nota.

## 3. Hipótesis de producto

Si el usuario puede planificar comidas y obtener una lista de compra fiable con muy pocos pasos, percibirá valor inmediato. Si, además, la despensa se actualiza durante acciones que ya realiza —comprar, planificar y cocinar—, podrá reducir desperdicio sin llevar un inventario manual exhaustivo.

## 4. Usuario inicial

Un hogar de dos personas que comparte la organización de las comidas y la compra. Ambos deben poder consultar y modificar la misma información sin coordinarse fuera de la aplicación.

El menú se decide casi a diario. Las recetas están dispersas entre un cuaderno, notas del móvil, familiares, libros, páginas web y vídeos. Se compra en varios supermercados y no existe un inventario; las existencias se comprueban mirando físicamente la cocina, con frecuentes dudas sobre lo que hay o falta.

Se realizan una o dos compras por semana. La elección de supermercado es flexible y circunstancial porque existen varias opciones cercanas; no hay un reparto estable de productos por tienda.

Los alimentos desperdiciados con más frecuencia son fruta, verdura y lácteos. La planificación se centrará en comidas y cenas. No existen alergias ni restricciones declaradas, pero se busca una alimentación mediterránea equilibrada y adecuada para personas que practican deporte semanalmente.

## 5. Prioridad de problemas validada

1. Desperdiciar comida.
2. Olvidar productos al comprar.
3. Decidir qué cocinar.
4. Comer con poca variedad.
5. Gastar demasiado.

Esta prioridad implica que el MVP debe demostrar primero que ayuda a aprovechar productos y evita olvidos. El presupuesto y la nutrición pueden esperar.

## 6. Trabajo principal del usuario

“Ayúdame a resolver la comida de los próximos días aprovechando lo que tengo, y dime qué necesito comprar, sin obligarme a mantener un sistema complicado.”

## 7. Bucle central

1. Elegir o descubrir recetas adecuadas.
2. Asignarlas al menú semanal.
3. Comparar ingredientes necesarios con existencias conocidas.
4. Generar y completar la lista de compra.
5. Marcar una receta como cocinada.
6. Actualizar existencias de forma asistida.
7. Recomendar próximos usos para productos marcados como prioritarios o que llevan tiempo sin utilizarse.

Cada paso debe alimentar al siguiente. Las secciones aisladas reducen el valor del producto.

## 8. Promesa del MVP

“En pocos minutos puedes organizar varias comidas y salir con una lista de compra útil que tiene en cuenta, al menos de forma sencilla, lo que ya tienes.”

La aplicación aconsejará platos y mostrará por qué encajan, pero el hogar conservará siempre la decisión final. No generará ni impondrá automáticamente un menú completo en el MVP.

## 9. MVP funcional propuesto

### Imprescindible

- Recetas estructuradas: nombre, ingredientes, cantidades, unidades, raciones, tiempos, etiquetas y pasos.
- Biblioteca compartida de recetas para el hogar.
- Catálogo inicial estructurado con recetas que gustan al hogar y una selección mediterránea suficientemente variada para poder planificar desde el primer uso.
- Categorías controladas, favoritos y puntuación individual de cada una de las dos personas.
- Captura rápida de una receta mediante enlace y estructuración guiada antes de utilizarla en el menú. La aplicación puede extraer datos estructurados cuando existan, siempre con revisión del hogar.
- Ajuste de raciones con recálculo de cantidades.
- Planificador semanal sencillo para comidas y cenas.
- Planificación semanal con navegación por fechas y duplicación de semanas como acción secundaria.
- Sincronización del menú, despensa y lista entre las dos personas del hogar.
- Informe inicial manual de alimentos al crear el hogar, después de definir sus integrantes y antes de entrar en el uso habitual.
- Lista de compra consolidada desde el menú.
- Adición manual de productos a la lista para compras no derivadas de recetas.
- Agrupación de ingredientes equivalentes, edición manual y posibilidad de asignar productos a distintos supermercados.
- Despensa básica con tres tipos de seguimiento: unidades exactas para productos contables, peso o volumen opcional para alimentos medibles y presencia aproximada cuando la precisión no aporta valor.
- Acción rápida para marcar un producto como “hay que gastarlo”.
- Registro automático de la fecha de entrada de un producto para estimar su antigüedad sin solicitar una caducidad.
- Avisos orientativos de “consumir pronto” para categorías perecederas, siempre corregibles por el usuario.
- Descuento de existencias conocidas al generar la compra.
- Búsqueda y filtros por ingrediente, tipo de plato y tiempo.
- Etiquetas culinarias sencillas para ayudar a mantener variedad y equilibrio mediterráneo, sin realizar recomendaciones médicas.
- Sugerencias de platos para completar huecos del menú, priorizadas por existencias, productos que conviene consumir, preferencias de las dos personas, variedad reciente y orientación mediterránea.
- Para cada hueco, mostrar exactamente tres recetas y señalar si se pueden preparar con la despensa o qué productos faltan; al elegir una receta, sus faltantes se consolidan en la lista de Compra.
- Explicación breve de cada sugerencia, por ejemplo: “aprovecha los calabacines”, “esta semana aún no hay legumbres” o “lista en 25 minutos”.
- Flujo de “receta cocinada” con confirmación sencilla de consumo.
- Acciones rápidas para indicar “queda poco” o “se terminó” cuando el consumo no procede de una receta, y ajuste por unidades para productos contables.
- Al completar una compra generada desde la aplicación, incorporación asistida de los productos comprados a la despensa.

### Simplificaciones deliberadas

- La despensa puede funcionar inicialmente con estados aproximados (“hay”, “queda poco”, “no hay”) cuando una cantidad exacta resulte incómoda.
- No se registrarán fechas de caducidad en el MVP.
- Las estimaciones de “consumir pronto” no pretenderán determinar la seguridad alimentaria ni sustituir la inspección del producto.
- Las recetas familiares, de libros o de vídeos se podrán introducir mediante un formulario guiado. La lectura automática de recetas se incorporará como flujo separado, siempre revisable antes de usar sus datos.
- El catálogo inicial se cargará una sola vez y quedará editable dentro del hogar; su importación será repetible sin crear duplicados.
- Las recetas del dataset serán originales, aportadas por el hogar o reutilizadas bajo condiciones compatibles y con procedencia registrada. No se copiarán colecciones, fotografías ni textos expresivos de terceros sin autorización.
- El planificador no optimizará automáticamente el menú en la primera versión.

## 10. Capacidades excluidas del MVP

- Modelos de IA locales o conectados mediante API para generar, leer o estructurar contenido.
- Control sistemático de fechas de caducidad.
- Información nutricional clínica o planes médicos.
- Cálculo exhaustivo de calorías y macronutrientes.
- Optimización avanzada de presupuesto.
- Comparación de precios entre supermercados.
- Compra o entrega integrada con comercios.
- Red social, comentarios o marketplace de recetas.
- Inventario exacto y obligatorio de cada producto.
- Generación autónoma completa de menús sin decisión del hogar.

## 11. Principios de experiencia

1. Registrar menos: pedir datos solo cuando cambien una decisión útil.
2. Capturar durante la acción: actualizar la despensa al comprar o cocinar, no en una sesión administrativa separada.
3. Permitir incertidumbre: aceptar cantidades aproximadas y datos incompletos.
4. Mostrar valor antes de exigir configuración extensa.
5. Sugerir y confirmar: el sistema propone cambios; el usuario corrige excepciones.
6. Recuperarse del desfase: debe ser fácil corregir la despensa cuando deje de reflejar la realidad.
7. Compartir sin coordinar: cualquier cambio relevante debe quedar disponible para las dos personas del hogar.
8. Aconsejar sin imponer: las recomendaciones deben ser comprensibles, editables y descartables.
9. Comunicar confianza: distinguir datos confirmados, estimaciones y sugerencias para evitar una falsa sensación de precisión.

## 12. Configuración inicial y primer valor

La primera sesión seguirá este orden obligatorio:

1. crear el hogar;
2. definir o invitar a sus integrantes;
3. realizar un informe manual inicial de los alimentos disponibles;
4. revisar y confirmar la despensa inicial;
5. continuar con recetas propias, ticket de compra cuando esa capacidad esté disponible o planificación semanal.

El informe inicial debe ser ligero: registrar presencia será suficiente, la cantidad será opcional y no se solicitarán caducidades. El progreso se guardará para poder continuar si la sesión se interrumpe.

La revisión inicial se organizará por tres ubicaciones reconocibles: frigorífico, congelador y despensa o armario.

El primer valor será disponer de una línea base compartida de la despensa y utilizarla después para planificar o preparar la compra.

## 13. Métrica principal provisional

Semanas gestionadas: número de semanas en las que el hogar mantiene una visión suficientemente completa y útil de recetas, menú, compra y despensa.

Una semana se considerará gestionada de forma provisional cuando:

- el hogar haya planificado una parte significativa de sus comidas y cenas;
- haya utilizado o actualizado al menos una lista de compra;
- las compras completadas se hayan reflejado en la despensa;
- las recetas cocinadas o los consumos relevantes se hayan confirmado;
- el sistema pueda mostrar qué información está actualizada y cuál necesita revisión.

La cobertura se medirá por componentes —menú, compra y despensa— para evaluar el producto. En la interfaz solo se señalará dentro de cada área qué información necesita atención, sin crear un dashboard ni un porcentaje global.

Indicadores complementarios:

- porcentaje de nuevos usuarios que genera su primera lista de compra;
- tiempo hasta la primera lista útil;
- usuarios que vuelven a planificar en la semana siguiente;
- recetas planificadas que se marcan como cocinadas;
- productos marcados como “hay que gastarlo” que terminan asociados a una receta cocinada;
- productos señalados como “consumir pronto” que se utilizan o se eliminan de la despensa;
- productos de la lista marcados como comprados;
- correcciones necesarias en la lista y la despensa.
- valoración del hogar sobre la confianza en el estado mostrado, de 1 a 5;
- número de olvidos de compra y productos desperdiciados comunicados por el hogar.

Los objetivos numéricos se fijarán después de concretar el segmento y probar un prototipo.

## 14. Riesgos principales

### Riesgo 1: coste de mantenimiento

El usuario abandona porque registrar compras y consumos exige demasiado trabajo.

Respuesta inicial: datos opcionales, estados aproximados, actualizaciones sugeridas y acciones por lotes.

### Riesgo 2: lista de compra poco fiable

Unidades incompatibles, nombres duplicados o una despensa desactualizada producen resultados incorrectos.

Respuesta inicial: catálogo normalizado de ingredientes, conversiones limitadas y transparentes, y edición manual siempre disponible.

### Riesgo 3: arranque vacío

Sin recetas ni despensa, el usuario no obtiene valor.

Respuesta inicial: catálogo de inicio, duplicación y edición rápida, y posibilidad de planificar sin completar la despensa.

### Riesgo 4: captura de recetas demasiado costosa

La variedad de fuentes —web, vídeo, libros, notas y recetas familiares— puede obligar a transcribir demasiado contenido antes de obtener valor.

Respuesta inicial: guardar enlaces en segundos, importar datos estructurados cuando existan y pedir la estructuración completa solo al incorporar una receta al menú.

### Riesgo 5: falsa precisión de la lectura automática

Un ticket o una receta puede leerse de forma incompleta, confundir nombres comerciales o no identificar una unidad real.

Respuesta inicial: usar OCR, parseo determinista y datos estructurados cuando estén disponibles; mostrar siempre una revisión rápida antes de confirmar la incorporación a Despensa o Recetas.

### Riesgo 6: alcance excesivo

Recetas, planificación, inventario y compra pueden convertirse en cuatro productos complejos.

Respuesta inicial: diseñar y medir un solo flujo de extremo a extremo; limitar la profundidad de cada módulo.

### Riesgo 7: recomendación nutricional engañosa

El sistema solo observa comidas y cenas y no conoce toda la ingesta, el estado de salud ni las necesidades individuales del usuario.

Respuesta inicial: evaluar variedad y alineación general con un patrón mediterráneo, explicar los criterios utilizados y evitar diagnósticos, prescripciones o afirmaciones sobre la dieta completa.

### Riesgo 8: colisión de nombre y posicionamiento

Existe una aplicación activa denominada MiDespensa con una propuesta cercana: recetas, planificación, inventario, tickets, nutrición y gasto.

Respuesta inicial: considerar MiDespensa un nombre de trabajo y validar marcas, dominios y tiendas antes de invertir en identidad pública. Véase [[COMPETITIVE-BENCHMARK#Riesgo de identidad]].

## 15. Web o aplicación

Recomendación provisional: aplicación web adaptable y fácilmente instalable en el móvil (PWA) para validar el producto con una sola base de desarrollo. El uso será predominantemente móvil —cocina y supermercado—, pero la introducción y planificación de recetas puede ser más cómoda en pantalla grande.

La decisión final dependerá de necesidades como notificaciones fiables, trabajo sin conexión y publicación en tiendas. Ninguna de ellas es imprescindible para demostrar la tesis inicial.

## 16. Automatización sin modelos de IA

MiDespensa sí automatizará sugerencias, lectura de tickets y estructuración de recetas, pero no incorporará un modelo de IA local ni conectará modelos generativos externos mediante API. Las sugerencias del Plan se calcularán mediante reglas explicables sobre recetas guardadas, despensa, favoritos y puntuaciones de las dos personas, variedad, tiempo y criterio mediterráneo. La lectura y estructuración automática combinarán OCR, parseo determinista y datos estructurados disponibles; cada resultado deberá poder revisarse y corregirse antes de modificar los datos del hogar.

## 17. Roadmap propuesto

### Fase 1 — MVP: validar el ciclo doméstico

- Creación del hogar, integrantes e informe inicial manual de alimentos.
- Recetario compartido y captura básica desde enlaces.
- Catálogo inicial de recetas preferidas y mediterráneas con procedencia verificada.
- Categorías, favoritos y puntuaciones individuales para ordenar sugerencias.
- Planificador semanal de comidas y cenas con navegación por fechas.
- Lista consolidada, editable y compartida.
- Despensa por presencia y cantidades opcionales.
- Entrada de productos desde la lista completada y también de forma manual.
- Priorización de perecederos mediante antigüedad y “hay que gastarlo”.
- Sugerencias explicables de platos, sin generación automática de un menú completo.
- Registro de receta cocinada y ajustes rápidos de “queda poco” o “se terminó”.

### Fase 2 — reducir trabajo manual

- Prueba controlada de OCR con tickets reales de los supermercados utilizados.
- Revisión de productos detectados antes de incorporarlos a la despensa.
- Registro de tienda, fecha, importe y precios por línea.
- Estructuración de recetas desde datos web compatibles y parseo determinista de texto.

### Fase 3 — asistencia basada en reglas

- Propuestas de menú mediterráneo equilibrado calculadas con reglas transparentes.
- Recomendaciones basadas en despensa, perecederos y variedad reciente.
- Estimaciones nutricionales y adaptación a objetivos deportivos generales, si se dispone de datos estructurados suficientes.
- Presupuesto e historial de gasto.

## 18. Modelo de uso cerrado

MiDespensa se desarrollará para un único hogar formado por dos personas. No se ofrecerá registro público ni se preparará el producto para incorporar más hogares o usuarios.

Principios estructurales desde el inicio:

- existirán como máximo dos cuentas autenticadas independientes;
- ambas cuentas compartirán un único hogar;
- recetas, menú, despensa y compras pertenecerán a ese hogar;
- una identidad no autorizada no podrá consultar ni modificar información;
- no se implementarán creación de hogares adicionales, cambio entre hogares, invitaciones abiertas ni administración multiinquilino.

Esta restricción es permanente para el alcance conocido. Si el objetivo cambiara en el futuro, la ampliación a más usuarios se trataría como una nueva decisión de producto y arquitectura, no como una capacidad implícita del MVP.

## 19. Criterios mediterráneos para las sugerencias

El planificador utilizará criterios generales derivados de recomendaciones oficiales para la población española:

- predominio y variedad de alimentos de origen vegetal;
- presencia frecuente de verduras y hortalizas;
- rotación de legumbres, pescado, huevos y carnes, favoreciendo fuentes vegetales y moderando carnes rojas y procesadas;
- preferencia por cereales integrales y aceite de oliva;
- variedad de recetas y métodos de preparación;
- moderación de productos muy procesados, azúcares libres, sal y grasas menos saludables.

Estos criterios servirán para ordenar y explicar sugerencias, no para certificar que la dieta completa es saludable. La adaptación a objetivos deportivos, energía o macronutrientes se realizará únicamente en una fase posterior y requerirá información adicional del usuario.

Fuentes de referencia:

- Agencia Española de Seguridad Alimentaria y Nutrición (AESAN), “Recomendaciones dietéticas y de actividad física”: https://www.aesan.gob.es/AECOSAN/web/nutricion/subseccion/recomendaciones_dieteticas.htm
- Organización Mundial de la Salud (OMS), “Healthy diet”: https://www.who.int/en/news-room/fact-sheets/detail/healthy-diet

## 20. Decisiones tomadas

1. El primer caso de uso será un hogar de dos personas.
2. La información será compartida y sincronizada desde el MVP.
3. La prioridad es reducir desperdicio y evitar olvidos, por encima de nutrición y presupuesto.
4. La despensa admitirá presencia y cantidades opcionales, sin exigir precisión constante.
5. Las fechas de caducidad no formarán parte del MVP.
6. Las recetas procederán de fuentes heterogéneas; reducir el esfuerzo de captura es un requisito de producto.
7. La compra en varios supermercados se contemplará en el MVP sin desarrollar todavía comparadores de precios.
8. El planificador se centrará en comidas y cenas, usando la semana como única vista operativa del MVP.
9. El equilibrio alimentario se abordará inicialmente mediante variedad y categorías de platos, no como asesoramiento nutricional clínico.
10. No se incorporarán modelos de IA locales ni modelos generativos externos por API; OCR y automatismos deterministas se evaluarán como capacidades independientes y revisables.
11. El planificador sugerirá platos y explicará sus criterios; el usuario tomará la decisión final.
12. Marcar una receta como cocinada y registrar “queda poco” o “se terminó” son interacciones aceptables para mantener la despensa.
13. La aplicación será de uso cerrado para un único hogar y un máximo de dos cuentas; no se preparará para múltiples hogares ni crecimiento de usuarios.
14. El éxito se entiende como disponer de una visión completa y fiable de la gestión alimentaria del hogar, no solo como utilizar una función aislada.
15. El informe manual inicial de alimentos será un paso obligatorio al crear el hogar y precederá a recetas, tickets y planificación.
16. El informe inicial se organizará por frigorífico, congelador y despensa o armario.
17. MiDespensa se considera un nombre de trabajo hasta completar una validación específica de identidad.
18. El hogar partirá de un dataset inicial de recetas preferidas y mediterráneas, estructuradas y editables.
19. Cada persona podrá marcar favoritos y puntuar recetas de 1 a 5; estas preferencias influirán en las sugerencias sin sustituir los criterios de despensa, variedad y consumo prioritario.
20. Toda receta del dataset conservará procedencia y condiciones de reutilización; no se incorporarán colecciones ni textos expresivos de terceros sin autorización compatible.

## 21. Experiencia objetivo a largo plazo

La versión ideal permitirá que las dos personas del hogar:

1. reúnan recetas procedentes de cualquier fuente;
2. reciban ayuda para construir un plan mensual flexible de comidas y cenas;
3. sepan qué productos hay en casa y cuáles conviene consumir;
4. capturen un ticket para proponer actualizaciones de despensa y gasto, revisándolas antes de confirmar;
5. consulten la evolución del gasto y, cuando los datos lo permitan, comparen precios entre supermercados.

## 22. Preguntas abiertas prioritarias

1. ¿Qué porcentaje de comidas y cenas debería estar planificado para considerar que una semana está bien gestionada?
2. ¿Qué nivel mínimo de confianza en la despensa sería aceptable después de cuatro semanas?
3. ¿Qué modalidades de acceso necesitará el producto: correo y contraseña, acceso con Google/Apple u otras?
4. ¿Cuántas recetas y qué reparto por categorías debe contener la primera versión del dataset?
5. ¿Qué peso relativo deben tener favoritos y puntuaciones frente a despensa, variedad y repetición reciente?
6. ¿Qué datos del perfil deportivo se estaría dispuesto a facilitar en una fase futura?
7. ¿Qué nombre definitivo estará disponible y diferenciará el producto de alternativas activas?

## 23. Recomendación provisional

Continuar, condicionado a validar tres hipótesis antes de diseñar el sistema completo:

1. que menú más lista consolidada evite olvidos y ayude a aprovechar productos en este hogar;
2. que la despensa compartida pueda mantenerse suficientemente útil mediante interacciones ligeras e integradas en el flujo;
3. que capturar recetas de fuentes heterogéneas no bloquee el uso habitual.
