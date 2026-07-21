Plan maestro de implementación
La base se construye por vertical slices: cada fase entrega una parte usable, protegida y probada. Fable 5 dirige y revisa; Codex Terra 5.6, con esfuerzo medio, implementa en tareas pequeñas y verificables.
Nota operativa: aunque el archivo tiene las cinco páginas que creaste, la integración de Figma solo ha expuesto ONBOARDING en la última lectura. Antes de cada fase visual, Fable debe confirmar que puede acceder a la página correspondiente y a sus nodos; no se implementará una pantalla por intuición.
Fase	Módulos	Resultado
0	Base técnica	Proyecto estable para desarrollar
1	Identidad y hogar	Acceso privado y aislamiento real
2	Onboarding	Línea base inicial de despensa
3	Despensa y catálogo	Inventario cotidiano compartido
4	Recetas	Recetario, dataset y preferencias
5	Plan semanal	Menú editable de la semana
6	Recomendaciones	Tres sugerencias explicables
7	Compra	Lista consolidada y cierre de compra
8	Operación	Calidad, PWA, backups y despliegue

Fase 0 — Base técnica
Objetivo: terminar la inicialización actual y no comenzar funcionalidad hasta tener una base fiable.
Incluye:
Next.js, TypeScript estricto, App Router y estructura modular.
Cliente Supabase para navegador y servidor.
Variables documentadas en .env.example, sin secretos.
ESLint, formatter, tests unitarios, Playwright y GitHub Actions.
Layout, sistema de componentes, tokens, navegación responsive y PWA básica.
README de desarrollo local.
Convenciones para Server Actions, errores, validación, idempotencia y Realtime.
Criterio de salida: proyecto arranca localmente, lint, tipos y pruebas pasan, y no hay secretos versionados.
Fase 1 — Identidad, sesión y hogar cerrado
Módulos: identity y household.
Objetivo: que las dos personas autorizadas puedan iniciar sesión y acceder únicamente a su hogar.
Incluye:
Inicio de sesión privado con magic link u OTP.
Sin alta pública.
Rutas protegidas y cierre de sesión.
profiles, households, household_members e incorporación controlada del segundo miembro.
Límite de dos miembros en base de datos, no solo en interfaz.
RLS, funciones transaccionales y pruebas negativas de acceso ajeno.
Pantalla mínima de acceso, adaptada a Figma cuando exista.
Criterio de salida: dos sesiones válidas comparten hogar; una tercera identidad no puede leer ni escribir; no se expone service_role.
Fase 2 — Onboarding y línea base inicial
Página Figma: ONBOARDING.
Módulos: onboarding, pantry, catalog, household.
Objetivo: completar el primer valor del producto.
Flujo:
Crear hogar
  → Frigorífico
  → Congelador
  → Despensa/armario
  → Revisión
  → Confirmación
  → Despensa lista
Incluye:
Progreso y reanudación del onboarding.
Alta rápida de alimentos, sugerencias y alta personalizada.
Zona declarada vacía.
Sin cantidades ni caducidades obligatorias.
Guardado automático, feedback de guardado, errores y reintentos.
Revisión editable antes de confirmar.
Confirmación atómica de la línea base.
Toast de deshacer cuando esté definido.
Sincronización entre dos sesiones del mismo hogar.
Criterio de salida: se cumplen AC-019 y AC-020 en móvil, tablet y escritorio; existe prueba E2E real de Auth + RLS + Realtime entre dos navegadores.
Fase 3 — Despensa cotidiana y catálogo
Página Figma: DESPENSA.
Módulos: pantry, catalog.
Objetivo: mantener el inventario tras el onboarding sin que resulte pesado.
Incluye:
Catálogo canónico, alias y nombres personalizados por hogar.
Ubicaciones: frigorífico, congelador y despensa.
Estado aproximado, unidades exactas o peso/volumen.
Movimientos inmutables: entrada, corrección, consumo y ajuste.
Acciones rápidas: “queda poco” y “se terminó”.
Señal de “consumir pronto” basada en categoría y antigüedad, nunca en caducidad inventada.
Conflictos de edición y recarga del estado reciente.
Realtime y reintentos idempotentes.
Criterio de salida: se cumplen AC-013, AC-014, AC-016, AC-017 y AC-018 con pruebas de concurrencia y cantidades no negativas.
Fase 4 — Recetas, dataset y preferencias
Página Figma: RECETAS.
Módulos: recipes, catalog, recommendations.
Objetivo: disponer de un recetario útil desde el primer uso.
Incluye:
Recetas estructuradas y recetas pendientes.
Ingredientes, pasos, raciones, tiempos, categorías y procedencia.
Dataset mediterráneo/preferido versionado mediante manifiesto.
Importación idempotente: no duplica ni sobrescribe recetas editadas por el hogar.
Favoritos y puntuaciones individuales de 1 a 5.
Vistas de receta, categorías, búsqueda y edición.
Validación de procedencia y licencias del dataset.
Criterio de salida: se cumplen AC-021 y AC-022; repetir la importación produce el mismo conjunto y las preferencias de una persona no alteran las de la otra.
Fase 5 — Plan semanal
Página Figma: PLAN SEMANAL.
Módulos: planning, recipes.
Objetivo: planificar comidas y cenas sin complejidad innecesaria.
Incluye:
Una semana por hogar y zona horaria.
Huecos para comida y cena.
Asignación, edición, eliminación y duplicación de semanas.
Selección manual de recetas antes de automatizar recomendaciones.
Raciones por comida.
Navegación entre semanas y estados vacíos honestos.
Sincronización de cambios entre ambos miembros.
Criterio de salida: se cumplen los criterios de planificar, editar y duplicar semana; una edición simultánea no se pierde silenciosamente.
Fase 6 — Recomendaciones explicables
Página Figma: PLAN SEMANAL y RECETAS.
Módulo: recommendations.
Objetivo: sugerir exactamente tres recetas útiles y comprensibles.
El algoritmo, determinista y sin IA generativa, evaluará:
Ingredientes disponibles.
Productos que conviene consumir.
Favoritos y puntuaciones de ambas personas, con peso limitado.
Variedad de categorías.
Tiempo de preparación.
Repetición reciente.
Productos que faltan.
Incluye:
Pesos configurables y versionados.
Hasta tres motivos legibles por receta.
Pruebas sintéticas con preferencias coincidentes y opuestas.
Lenguaje orientativo, nunca médico o nutricionalmente concluyente.
Criterio de salida: se cumplen AC-009 y AC-023; siempre devuelve tres opciones elegibles, ordenadas de forma reproducible y con explicación.
Fase 7 — Compra y cierre hacia despensa
Página Figma: COMPRA.
Módulos: shopping, planning, pantry.
Objetivo: transformar el menú y necesidades manuales en una lista compartida y cerrar la compra sin duplicar existencias.
Incluye:
Lista activa compartida.
Productos manuales y productos derivados del plan.
Consolidación solo de unidades compatibles.
Tienda opcional, marcado de comprado y colaboración en tiempo real.
Revisión previa a finalizar compra.
Confirmación idempotente que crea entradas en despensa una única vez.
Avisos de duplicado como información, nunca como bloqueo.
Ticket:
Primera entrega: captura o alta manual y revisión editable.
OCR real: fase posterior y opcional; sus resultados siempre serán candidatos que requieren confirmación explícita.
Criterio de salida: se cumplen AC-010, AC-011 y AC-012; dos sesiones pueden comprar a la vez sin duplicados ni pérdidas.
Fase 8 — Cocinar, operación y entrega
Módulos: integración transversal.
Objetivo: cerrar el ciclo doméstico completo y preparar el uso real.
Incluye:
Marcar receta como cocinada.
Propuesta editable de consumos antes de afectar la despensa.
Historial mínimo de movimientos.
Pruebas E2E del ciclo planificar → comprar → cocinar con dos sesiones.
Revisión de accesibilidad y rendimiento móvil.
PWA instalable y estrategia de errores de red.
Exportación cifrada, procedimiento de restauración y revisión de backup.
Preview en Vercel y despliegue solo con autorización expresa.
Aprovisionamiento manual de las dos cuentas reales tras validar desarrollo.
Criterio de salida: se cumplen AC-015 y todos los criterios obligatorios; el hogar puede usar el ciclo completo durante varias semanas sin incoherencias.
Orden de trabajo de Fable y Codex
Para cada fase:
Fable revisa el estado real del repositorio y confirma que la fase anterior está aceptada.
Fable crea una única tarea activa en Notion para el carril de Arquitectura.
Fable delega en Codex Terra 5.6 con esfuerzo medio, indicando archivos y responsabilidad concreta.
Codex aplica TDD, implementa, prueba y documenta.
Fable revisa código, seguridad, pruebas, Figma y requisitos.
Si hay defectos, Fable pide ajustes; no cierra la tarea hasta aprobar.
Se actualizan Obsidian, Notion y ACTIVE-CONTEXT.md.
Reglas permanentes
Una fase no se abre si la anterior no tiene evidencia de verificación.
Figma define cada pantalla; no se inventan interfaces.
PostgreSQL y RLS son la defensa final de datos, no la UI.
Realtime notifica cambios; la base de datos sigue siendo la fuente de verdad.
Toda operación reintentable debe ser idempotente.
No se añaden microservicios, colas ni infraestructura de escalado.
No se sube a GitHub, no se despliega ni se crean usuarios reales sin tu autorización.