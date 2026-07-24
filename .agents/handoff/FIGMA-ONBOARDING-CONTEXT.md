# Handoff Figma → implementación · Página ONBOARDING

Fuente: https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih · Página `ONBOARDING` (0:1).
Contexto extraído con `get_design_context` por Fable 5 el 2026-07-19. Los wireframes son de baja fidelidad: definen composición, jerarquía y microcopy; el comportamiento lo define `docs/03-UX/ONBOARDING-SCREEN-SPEC.md` (contrato vinculante).

## Nodos

| Pantalla | Desktop | Móvil (390px) |
| --- | --- | --- |
| O1 Configurar hogar | 7:1268 | 7:1294 |
| O2 Frigorífico | 7:1323 | 7:1368 |
| O3 Congelador | 7:1416 | 7:1464 |
| O4 Despensa | 7:1515 | 7:1580 |
| O5 Revisar | 7:1648 | 7:1681 |
| O6 Despensa lista | 7:1717 | 7:1737 |

O3 y O4 son la misma configuración que O2 con los textos/sugerencias de `ONBOARDING-SCREEN-SPEC.md` §9–10.

## Tokens observados (wireframe, trasladar a design tokens propios)

- Texto principal `#111827`, secundario `#4b5563`, terciario/placeholder `#9ca3af`.
- Bordes `#e5e7eb` (suave) y `#d1d5db` (inputs/chips).
- Fondo página desktop `#f3f4f6`; tarjetas y móvil `#ffffff`.
- CTA primaria: fondo `#1f2937`, texto blanco, radius 6px, padding 14px, ancho completo en móvil / 320px centrada en desktop.
- CTA secundaria (O6): fondo blanco, borde `#d1d5db`.
- Radius: inputs/botones 6px, resúmenes 8px, tarjeta desktop 12px, chips 16px (pill).
- Tipografía wireframe Inter; H1 22px móvil / 24px desktop bold; ayuda 13–14px; etiquetas 12px semibold (algunas uppercase); cuerpo 14px. La spec §14 permite subir H1 a 28/32 — mantener consistencia con la spec, no con el wireframe, cuando difieran (spec manda; ningún input <16px).

## Composición por pantalla (móvil)

Estructura común: `Header Bar` 56px (logo cuadrado 24px + "MiDespensa") → cuerpo con padding horizontal 24px → `Mobile Sticky Bottom` (pie persistente, padding 24px, borde superior, CTA a ancho completo).

### O1 (7:1294)
1. H1 "Organiza la comida de casa" + ayuda "Ten a mano lo que tienes, tus recetas y el plan de la semana."
2. Campo etiquetado "Nombre del hogar" (valor inicial "Mi hogar").
3. Sección "Personas del hogar": fila "Tú" (borde `#e5e7eb`, radius 6) + botón discontinuo "+ Añadir otra persona".
4. Pie: CTA "Preparar mi despensa".
Desktop (7:1268): dos columnas — promesa a la izquierda (~440px), formulario a la derecha (proporción 40/60 según spec §7).

### O2 (7:1368) — patrón compartido con O3/O4
1. Progreso: "INVENTARIO: 1 DE 3" (12px semibold uppercase) + barra 120×6px (track `#e5e7eb`, fill `#111827` a 1/3).
2. H1 "Frigorífico" + ayuda.
3. Campo etiquetado "Buscar alimento", placeholder "Añade un alimento · Ej.: leche".
4. Chips de sugerencias con prefijo "+": Leche, Yogur, Huevos, Tomate, Queso, Jamón, Mantequilla, Zumo (flex-wrap, gap 8px).
5. "Añadidos (n)": lista en caja (radius 6) con filas [bullet 6px + nombre | enlace "Quitar" subrayado gris].
6. Pie: CTA "Seguir con el congelador".
Desktop (7:1323): tarjeta blanca centrada 480px, padding 40px, radius 12, sobre fondo `#f3f4f6`; CTA 320px centrada. (La spec §14 permite hasta 960px con dos paneles; el wireframe final usa tarjeta única centrada — seguir el wireframe.)

### O5 (7:1681)
1. Sobretexto "REVISIÓN" + H1 "Revisa tu despensa" + ayuda.
2. Tres resúmenes apilados (radius 8, padding 12): "{Zona} · {n} alim." + hasta 2–3 ejemplos con ellipsis + enlace "Editar" subrayado (desktop: "Editar frigorífico" etc.).
3. Nota centrada gris "Podrás cambiar estos alimentos después."
4. Pie: CTA "Confirmar despensa".
Desktop (7:1648): tarjeta única centrada 480px con las tres filas apiladas (no cuadrícula) y CTA 320px.

### O6 (7:1737)
1. Anillo con check ✓ (56px, decorativo — recrear con CSS/SVG propio, no descargar el asset del wireframe).
2. H1 centrado "Tu despensa está lista" + "Hemos guardado {n} alimentos." + ayuda gris.
3. Pie: CTA "Añadir mi primera receta" + secundaria "Ir al plan".

## Reglas de adaptación

- No copiar el código Tailwind generado por Figma tal cual: adaptar a los componentes y tokens del proyecto (spec §15: OnboardingShell, StepHeader, PrimaryButton, SearchAddCombobox, SuggestionChip, InventorySelectionRow, ZoneSummaryRow, SaveStatus, SyncBanner, UndoToast, ActionFooter, MemberRow, LabeledTextField, TextAction).
- Estados, foco, ARIA, offline, deshacer, reanudación y mensajes: `ONBOARDING-SCREEN-SPEC.md` §4–§13 y §17.
- Breakpoints y contenedores: spec §14.
- Objetivos táctiles ≥44px aunque el wireframe dibuje filas menores.
