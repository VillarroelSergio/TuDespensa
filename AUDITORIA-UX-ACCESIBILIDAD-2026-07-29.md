# Auditoría de UX, UI y accesibilidad — MiDespensa

**Fecha:** 29 de julio de 2026
**Alcance:** las 13 pantallas de la aplicación (acceso, onboarding, unirse, despensa, compra, revisar compra, importar ticket, plan, elegir receta, cocinar, recetas, detalle de receta, editor de receta, hogar) más la hoja de estilos completa (`src/app/styles.css`, ~3.000 líneas).
**Referencia:** WCAG 2.2 nivel AA.
**Diferencia con la auditoría anterior:** la de seguridad y calidad (`AUDITORIA-COMPLETA-2026-07-29.md`) mira el código por dentro. Esta mira la experiencia: qué se ve, qué se puede tocar, qué se oye con un lector de pantalla y si los patrones de diseño son coherentes entre pantallas.

---

## 1. Resumen en lenguaje llano

La aplicación tiene una base sólida: casi todos los campos llevan su etiqueta, los botones de icono llevan nombre, hay avisos que se anuncian solos y ya se pensó en el tamaño mínimo de 44 píxeles para el dedo. Eso no es lo habitual y conviene decirlo.

Dicho eso, había **seis problemas que un usuario real nota de inmediato**:

1. **Textos que no se leen bien.** Varios grises y colores de estado (el ámbar de «queda poco», el verde de «hay», las etiquetas de estado de la despensa) tenían tan poco contraste con el fondo que a plena luz o con vista cansada resultan borrosos. El peor caso estaba en 2,0:1 cuando el mínimo exigible es 4,5:1.
2. **El recuadro que marca dónde estás al usar el teclado casi no se veía** (era un verde translúcido sobre crema, 2,2:1 frente al 3:1 mínimo). Quien no usa ratón se perdía.
3. **Para llegar al contenido había que pasar por los cinco enlaces del menú en cada pantalla.** Faltaba el clásico «Saltar al contenido».
4. **La pantalla «Importar de un ticket» no tenía estilos.** Todas sus clases CSS (`.ticket-row`, `.ticket-name`, …) estaban escritas en el componente pero no existían en la hoja de estilos: los campos salían apilados a todo lo ancho.
5. **El detalle y el editor de receta se quedaban sin navegación.** No usaban el armazón de la app, así que en móvil desaparecía la barra inferior y la única salida era un «← Volver».
6. **El menú «Opciones» del plan era una trampa en móvil.** Se abre como hoja inferior que tapa el propio botón que la abrió, y un `<details>` del navegador no se cierra con Escape ni al tocar fuera. No había salida evidente.

Además aparecieron tres defectos que no son de accesibilidad sino errores lisos y llanos: un texto con los acentos corrompidos («IntÃ©ntalo»), un contador que decía siempre «8/8 seleccionados» aunque desmarcaras ingredientes, y un fondo blanco escrito a mano en las filas de la despensa que anulaba el resaltado al pasar el ratón y el de la fila seleccionada (esos dos estilos existían y nunca se veían).

**Todo lo anterior está corregido en esta rama.** Lo que queda pendiente y por qué está en la sección 5.

---

## 2. Hallazgos de accesibilidad y su corrección

### 2.1 Contraste de color (WCAG 1.4.3 y 1.4.11) — BLOQUEANTE

Ratios medidos sobre los colores que estaban realmente activos (el segundo bloque `:root` de la hoja de estilos sobrescribe al primero):

| Elemento | Antes | Mínimo | Ahora |
|---|---|---|---|
| Texto gris secundario (`--muted-2`) sobre crema | 3,42:1 | 4,5:1 | 4,95:1 |
| Texto gris secundario sobre paneles (`--surface-2`) | 3,25:1 | 4,5:1 | 4,58:1 |
| Texto gris principal (`--muted`) sobre paneles | 4,26:1 | 4,5:1 | 4,78:1 |
| Estado «hay» (`#33b266`) sobre blanco | 2,73:1 | 4,5:1 | 5,87:1 |
| Estado «queda poco» (`#f2991a`) sobre blanco | 2,25:1 | 4,5:1 | 5,75:1 |
| Estado «se terminó» (`#e54033`) sobre blanco | 4,11:1 | 4,5:1 | 6,54:1 |
| Etiqueta de estado del detalle (verde sobre verde claro) | 2,30:1 | 4,5:1 | 5,48:1 |
| Etiqueta de estado del detalle (ámbar sobre ámbar claro) | 2,00:1 | 4,5:1 | 5,57:1 |
| Etiqueta «Por revisar» y aviso de receta pendiente | 3,66:1 | 4,5:1 | 5,57:1 |
| Estrella de puntuación activa (gráfico informativo) | 2,25:1 | 3:1 | 5,75:1 |
| Color de marca como texto (18 sitios: enlaces «volver», «Opciones», «Mostrar más»…) | 3,90-4,52:1 | 4,5:1 | 6,54:1 |
| Indicador de foco del teclado | 2,16:1 | 3:1 | 6,54:1 |
| Indicador de foco en la barra inferior móvil | ~1,6:1 | 3:1 | 6,54:1 |

**Cómo se ha resuelto sin romper la identidad visual:** los colores de marca y de estado siguen valiendo para rellenos, bordes y puntos, donde el mínimo es 3:1 y sí lo cumplían. Lo que se ha añadido son tres tokens nuevos —`--success-strong`, `--warning-strong`, `--danger`— que son *los mismos colores* llevados al contraste que exige el texto. La regla de diseño queda escrita en un comentario del CSS: **si el color es el del texto, se usa la variante `strong`**. Además se han corregido los dos grises (`--muted`, `--muted-2`) para que pasen sobre los tres fondos de la app, no solo sobre el más claro.

De paso, esto ha eliminado 24 colores escritos a mano en la hoja de estilos: ya no hay dos verdes de «éxito» ni tres rojos de «error» distintos.

### 2.2 Navegación y estructura — BLOQUEANTE

- **Falta de «Saltar al contenido» (2.4.1).** Añadido en el armazón: es el primer elemento que recibe el foco, está oculto hasta entonces y lleva al contenido de la pantalla.
- **Todo estaba dentro de un único `<main>`**, incluidos el menú lateral y la barra inferior. Para un lector de pantalla eso significa que no existe la frontera «navegación / contenido». Ahora el contenido es el `<main>` y la navegación queda fuera de él.
- **Detalle y editor de receta sin armazón.** Envueltos en `AppShell`, conservando su medida de lectura (46 rem) para no quedar a 78 rem de ancho.
- **La pantalla «Cocinar» sin comida válida no tenía título.** Se le ha puesto un `<h1>`: aterrizar en una pantalla sin encabezado desorienta a quien usa lector de pantalla.
- **Siete bloques de la pantalla Hogar eran `<p class="label">`**, o sea, títulos de mentira: se veían como títulos pero no existían como encabezados, así que no se podía navegar por ellos. Ahora son `<h2>` dentro de `<section>`, con el mismo aspecto discreto.
- **La navegación entre semanas** era un par de enlaces sueltos; ahora es un `<nav>` con nombre.

### 2.3 Interacción y teclado — IMPORTANTE

- **Menú «Opciones» del plan (2.1.2, usabilidad).** Extraído a su propio componente de cliente (`src/modules/plan/SlotMenu.tsx`) que añade: cierre con Escape, cierre al pulsar fuera, devolución del foco al botón que lo abrió y un botón «Cerrar» visible solo en móvil, donde la hoja tapa el disparador.
- **Grupos de opciones sin estado anunciado (4.1.2).** Los chips de zona (dar de alta un producto, revisar la compra) y la lista de nombres del hogar eran botones cuyo estado «elegido» solo se transmitía por el color de fondo. Ahora son `role="group"` de verdad —el `aria-label` de un `<div>` sin rol se ignora— con `aria-pressed` en cada botón.
- **Filtros de receta marcados como `aria-current="true"`**, que significa «la página en la que estás». Cambiados a `aria-pressed`, que es lo que corresponde a un filtro que se activa y desactiva.
- **Etiqueta visible distinta del nombre accesible (2.5.3)** en el buscador de alimentos del onboarding: se veía «Añade un alimento» y el nombre real era «Añadir alimento al frigorífico», así que el control por voz no respondía al texto visible. Unificados.
- **Identificadores repetidos.** `PrimaryButton` usaba un `id` fijo para el texto que explica por qué está bloqueado, y el buscador de alimentos otro: con dos en pantalla se duplicaba el `id` y las descripciones se cruzaban. Ambos usan ya `useId`.
- **Nombres accesibles idénticos** en el editor de receta: había N botones llamados exactamente «Quitar ingrediente». Ahora dicen qué quitan («Quitar tomate», o «Quitar ingrediente 3» si aún no tiene nombre). Igual en pasos y categorías.
- **Casillas de 18 píxeles (2.5.8)**, por debajo del mínimo de 24. Subidas a 24 en la lista de compra y en la revisión de cocina.
- **Estrellas y símbolos leídos en voz alta.** «★ Favoritas» se anunciaba como «estrella negra Favoritas»; los símbolos decorativos (★, ☆, ←, →, ✓) están marcados como decorativos, y donde el símbolo *sí* informaba se ha añadido texto real («Favorita: »).
- **Ocho regiones «en vivo» simultáneas** en la revisión de cocina: cada fila anunciaba «Quedará: …» y teclear una cantidad disparaba un anuncio por pulsación. Ahora el dato se lee al enfocar el campo (`aria-describedby`), sin interrupciones.
- **Enlaces que abren pestaña nueva** (el origen de una receta) ya lo avisan.
- **Foco al cambiar de paso en el onboarding.** El código movía el foco al título, pero solo al cargar la página, no al pasar de paso: quien usa teclado se quedaba en el botón anterior. Corregido.

### 2.4 Patrones de diseño y coherencia — IMPORTANTE

- **18 navegaciones internas eran `<a href>` en vez de `<Link>`.** En Next.js eso significa recargar la página entera: pantalla en blanco, pérdida de la posición de scroll y del estado. Afectaba a cambiar de semana, abrir una receta, confirmar la compra y todos los «volver». Migradas todas. Es probablemente el cambio que más se nota al usar la app.
- **Cinco variantes del mismo enlace «volver»** (`.shopping-back`, `.recipe-back`, `.choose-back`, `.cook-back`, `.pantry-detail__back`), cada una con su tamaño y su color. Unificadas en un solo patrón de 44 px de alto.
- **Botones apagados sin explicar por qué.** «Confirmar compra», «Confirmar en despensa», «Detectar productos», «Guardar receta» y «Añadir a despensa» se veían grises y no decían qué faltaba. Ahora cada uno lleva su motivo, asociado al botón para que el lector de pantalla lo anuncie. Es el patrón que el proyecto ya tenía en `PrimaryButton`; simplemente no se aplicaba en el resto.
- **Un botón vestido de enlace.** «+ Añadir un producto» del ticket usaba la clase del enlace «volver»: mismo peso visual que una navegación siendo una acción. Cambiado al estilo de «añadir fila» que ya existía.
- **CSS que no existía.** Estaban escritas en los componentes pero sin ninguna regla: `.ticket-row`, `.ticket-name`, `.ticket-qty`, `.ticket-unit`, `.ticket-remove`, `.ticket-textarea`, `.auth-links`, `.brand-lockup__mark`, `.brand--welcome`, `.combobox-wrap`, `.pantry-list__finished`, `.household-page`, `.cook-empty-state`, `.pantry-zone-icon`. Consecuencias reales: la pantalla de ticket sin maquetar y el símbolo de la marca invisible en acceso y onboarding. Se ha escrito el CSS de todas menos `.pantry-zone-icon`: eran `<span>` vacíos para iconos de zona que nunca se dibujaron, así que se han retirado del marcado (dejaban un hueco fantasma junto al título).
- **Código muerto retirado:** el componente `PageShell` no lo usaba nadie, y con él se van la regla genérica `main {}` y `.page-card`.

### 2.5 Defectos funcionales encontrados de paso

| Defecto | Dónde | Efecto |
|---|---|---|
| `'No hemos podido crear la copia. IntÃ©ntalo de nuevo.'` | Hogar, copia de seguridad | Acentos corrompidos visibles al usuario |
| Contador fijo `n/n seleccionados` | Revisión de cocina | Decía «todos seleccionados» aunque desmarcaras ingredientes |
| `style={{ backgroundColor: '#fff' }}` en cada fila de despensa | Despensa | Anulaba el resaltado al pasar el ratón y el de fila seleccionada: dos estilos que existían y nunca se veían |
| Fallo silencioso al guardar favorito o puntuación | Detalle de receta | La estrella volvía a su sitio sin decir que había fallado |
| `aria-live` en un bloque estático | Plan | Anunciaba el resumen de la semana al cargar, duplicando el título |

---

## 3. Lo que ya estaba bien (verificado, no supuesto)

- Prácticamente todos los campos tienen `<label>` asociado; los que no lo llevan visible usan `sr-only` en lugar de fiarse del `placeholder`.
- Los botones de icono («×», «+1», «−1») llevan nombre accesible con el producto incluido: «Eliminar Tomates», no «Eliminar».
- Los mensajes de guardado y de error se anuncian solos (`aria-live`), y los estados de la despensa nunca se transmiten *solo* por color: siempre hay texto («Se terminó», «Queda poco») junto al punto de color.
- `PrimaryButton` usa el patrón correcto `aria-disabled` + descripción, en vez de deshabilitar a secas, que saca el botón del recorrido de teclado.
- `prefers-reduced-motion` está respetado en toda la app.
- El idioma está declarado (`lang="es"`), el zoom en móvil no está bloqueado y los campos suben a 16 px en pantallas pequeñas para que iOS no haga zoom al enfocar.
- Los objetivos táctiles de 44 px son la norma explícita del proyecto, no una casualidad.
- `autocomplete` correcto en correo y contraseña, con `new-password` al registrarse.

---

## 4. Ficheros modificados

23 ficheros: `src/app/styles.css` (el grueso), `AppShell`, `PrimaryButton`, `SearchAddCombobox`, `BrandLockup`, los módulos de despensa (2), compra (3), plan (4 más el nuevo `SlotMenu.tsx`), recetas (4), hogar, onboarding, acceso y la pantalla de cocinar. Y uno borrado: `PageShell.tsx`.

---

## 5. Pendiente, y por qué no se ha hecho

1. **Modo oscuro.** `color-scheme` está fijado a claro y quedan más de 60 blancos literales (`#fff`) en la hoja de estilos. Hacerlo bien exige convertir esos blancos en tokens de superficie primero; sin eso el modo oscuro sale a medias. Ahora que existen los tokens `strong` es más barato que antes.
2. **Devolver el foco al cerrar el panel de detalle de la despensa.** Al cerrar con «← Volver» el foco se pierde. Se arregla guardando la fila que lo abrió; no se ha tocado para no mezclarlo con el resto.
3. **`key={index}` en las filas editables** de ingredientes, pasos y ticket. No corrompe datos, pero al borrar una fila intermedia el foco salta. Ya estaba documentado como hallazgo B8 en la auditoría anterior.
4. **Una comprobación automática de accesibilidad en la integración continua.** Lo natural es `@axe-core/playwright` sobre los E2E que ya existen: detecta las regresiones de contraste y de ARIA sin revisión manual. Implica una dependencia de desarrollo nueva, así que se deja propuesto, no aplicado.
5. **Revisión con lector de pantalla real** (NVDA o VoiceOver). Esta auditoría es de código y de cálculo de contraste; los nombres accesibles conviene oírlos.

---

*Auditoría de código y cálculo de contrastes. Los ratios están calculados sobre los valores hexadecimales activos con la fórmula de luminancia relativa de WCAG.*
