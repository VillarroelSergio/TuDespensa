# MiDespensa — inicialización del MVP desde Figma

## Dirección de trabajo

Fable 5 es el jefe de planificación, arquitectura, revisión y aceptación.

La implementación se delega en Codex Terra 5.6 con esfuerzo medio. Usa el sistema de agentes disponible para dividir trabajo de forma segura y Fable 5 debe revisar los resultados, pedir ajustes cuando sean necesarios y aprobar explícitamente la entrega final.

Descubre y usa los plugins, skills y agentes ya instalados para UX/UI, frontend, backend, Supabase, testing, seguridad y verificación. No inventes herramientas ni nombres de plugins. Respeta siempre las instrucciones de `AGENTS.md`.

No borres, reviertas ni sobrescribas cambios existentes que no pertenezcan a esta tarea.

## Objetivo

Inicializar MiDespensa en el repositorio actual como una aplicación web modular con:

- Next.js, App Router, React y TypeScript.
- Supabase para Auth, PostgreSQL, RLS, Realtime y Storage.
- Arquitectura modular preparada para el MVP.
- UI responsive implementada desde los wireframes finales de Figma.
- Primer vertical slice funcional: autenticación, onboarding e inventario inicial compartido.
- Pruebas y automatización de calidad básicas.

No implementar todavía OCR real de tickets, IA generativa ni el algoritmo completo de recomendaciones. Deben quedar preparados como módulos futuros, sin aparentar que ya funcionan.

## Flujo obligatorio

Sigue este orden:

1. Lee `AGENTS.md`.
2. Lee `docs/00-Project/ACTIVE-CONTEXT.md` y `docs/00-Project/WORKFLOW.md`.
3. Confirma en Notion la tarea activa de Arquitectura.
4. Lee únicamente la documentación enlazada desde esa tarea, especialmente:
   - `docs/01-Product/PRODUCT-BRIEF.md`
   - `docs/02-Requirements/MVP-FUNCTIONAL-BRIEF.md`
   - `docs/05-Architecture/DOMAIN-DATA-MODEL.md`
   - `docs/05-Architecture/TECHNICAL-ARCHITECTURE.md`
   - `docs/05-Architecture/POC-TDD-EVIDENCE.md`
   - `docs/adr/`
5. Consulta Figma antes de escribir cualquier UI.
6. Implementa, verifica, actualiza la documentación canónica y después actualiza Notion.

## Figma: fuente de verdad visual

Archivo maestro:

`https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih`

El archivo está organizado en estas cinco páginas. Antes de implementar una pantalla, localiza la página indicada, identifica el nodo concreto y usa `get_design_context` sobre ese nodo. No implementes basándote solo en capturas, nombres de capas o suposiciones.

| Página Figma | Módulos de código | Alcance |
| --- | --- | --- |
| `ONBOARDING` | `onboarding`, `household`, `pantry` | Alta del hogar, línea base e inventario inicial |
| `DESPENSA` | `pantry`, `catalog` | Inventario habitual |
| `COMPRA` | `shopping` | Lista de compra, revisión y estados de ticket |
| `RECETAS` | `recipes`, `recommendations` | Recetario, preferencias y sugerencias |
| `PLAN SEMANAL` | `planning`, `recommendations` | Menú semanal y propuestas |

Reglas Figma:

- Usa `get_metadata` solo para orientarte dentro de una página.
- Antes de escribir código de una pantalla, llama a `get_design_context` para su nodo.
- Adapta el contexto de Figma al proyecto; no pegues el código generado literalmente.
- Reutiliza tokens y componentes ya existentes antes de crear otros.
- Usa activos exportados de Figma cuando existan. No redibujes iconos o SVG manualmente.
- Figma define la interfaz; Obsidian y la arquitectura definen comportamiento, seguridad y límites funcionales.

## Restricciones de producto

- Aplicación privada para un único hogar y máximo dos cuentas.
- Sin registro público ni crecimiento multiusuario.
- Móvil primero; tablet y escritorio adaptados.
- Una acción principal visible por pantalla.
- Presencia obligatoria; cantidades opcionales; sin caducidades durante onboarding.
- Guardado automático y reanudación.
- Datos sincronizados entre dos miembros.
- Nunca incluir secretos, tokens, claves de servicio ni correos reales en el repositorio.

## Arquitectura y estructura esperada

Inicializa Next.js con TypeScript estricto, linting, formato, pruebas, `.env.example`, PWA básica y GitHub Actions para lint, tipos y pruebas.

Usa una estructura modular equivalente a:

```text
src/
  app/
    (auth)/
    (protected)/
    onboarding/
    despensa/
    plan/
    recetas/
    compra/
  modules/
    identity/
    household/
    onboarding/
    pantry/
    catalog/
    recipes/
    planning/
    shopping/
    recommendations/
  components/
    ui/
    layout/
  lib/
    supabase/
    validation/
    errors/
    idempotency/
  styles/
  types/
supabase/
  migrations/
  tests/
docs/

Reglas:
Casos de uso y contratos explícitos por módulo.
No llamadas HTTP entre módulos del monolito.
Componentes de UI sin reglas de negocio.
Server Actions y Route Handlers validan entrada, sesión, pertenencia y errores.
Sin ORM pesado inicialmente.
Conserva el POC existente de Supabase y sus migraciones.
Seguridad e integración Supabase
Implementa la separación correcta entre cliente de navegador y servidor:
Auth por magic link u OTP, sin alta pública.
Rutas protegidas y redirección según estado de onboarding.
Máximo dos miembros por hogar.
RLS en toda tabla privada.
service_role nunca expuesta ni usada en el navegador.
Realtime como aviso: invalida y vuelve a consultar; no lo uses como fuente de verdad.
Idempotencia para operaciones reintentables.
Control optimista mediante version en entidades colaborativas.
No aprovisiones cuentas reales sin autorización explícita. Usa datos sintéticos o de desarrollo en las pruebas.
Alcance funcional de esta entrega
Implementar ahora
En la página ONBOARDING de Figma, implementa:
Configuración de hogar.
Frigorífico.
Congelador.
Despensa/armario.
Revisión.
Confirmación de la línea base.
Debe incluir:
Diseño móvil de 390 px y adaptaciones tablet/escritorio del Figma.
CTA inferior fijo cuando esté diseñado.
Inputs, chips, búsqueda, alta y retirada de productos.
Guardado automático y reanudación.
Estados de carga, vacío, error y reintento.
Toast con “Deshacer” cuando aplique.
Accesibilidad: foco visible, teclado, etiquetas, contraste y objetivos táctiles mínimos de 44 px.
Persistencia de productos y confirmación de línea base.
Sincronización de inventario en un segundo navegador autenticado del mismo hogar.
Preparar sin simular
Crea rutas, navegación y estados honestos para:
DESPENSA
COMPRA
RECETAS
PLAN SEMANAL
No muestres funciones no implementadas como reales. Si un flujo requiere backend todavía inexistente, muestra un estado de disponibilidad limitada coherente con Figma.
Calidad y verificación
Aplica TDD cuando sea práctico:
Prueba que falla.
Implementación mínima.
Refactorización.
Incluye:
Pruebas unitarias de validación y casos de uso.
Pruebas de integración para RLS, límite de dos miembros, conflictos e idempotencia.
Prueba E2E reproducible con dos sesiones: Auth, modificación de inventario y Realtime.
Comprobación de accesibilidad en móvil, tablet y escritorio.
lint, tipos, pruebas y auditoría de dependencias.
No declares éxito sin evidencia ejecutada. Si falta una configuración manual o dos cuentas de prueba, documenta el procedimiento exacto y el bloqueo.
Entregables
Código funcional y modular.
Migraciones y pruebas de Supabase.
.env.example sin valores secretos.
GitHub Actions mínima.
README con arranque local y comandos de verificación.
Documentación canónica actualizada.
ACTIVE-CONTEXT.md actualizado.
Evidencia añadida a la tarea activa de Notion.
Resumen final de archivos, decisiones, pruebas, resultados, limitaciones y siguientes pasos.
Git
Crea una rama feature/....
Haz commits pequeños y verificables.
Revisa git diff antes de cada commit.
No hagas push, no abras pull request y no modifiques recursos remotos sin autorización explícita.