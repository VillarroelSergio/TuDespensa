---
title: Sistema de identidad visual — MiDespensa
aliases:
  - Brand Identity
tags:
  - midespensa
  - ux
  - identidad
  - naming
status: proposal
updated: 2026-07-22
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[PRODUCT-BRIEF]]"
  - "[[COMPETITIVE-BENCHMARK]]"
  - "[[VISUAL-CONTEXT]]"
---

# Sistema de identidad visual — MiDespensa

## Decisión de diseño

Se ha creado un sistema de marca compuesto por un **símbolo independiente** y un logotipo tipográfico intercambiable. El símbolo es una ventana de despensa frontal y ordenada: expresa visibilidad de lo que hay en casa sin convertir el producto en una app de recetas o supermercado.

El símbolo es el activo visual estable. El texto **MiDespensa** continúa siendo una etiqueta de trabajo hasta superar la validación de nombre; sustituirlo no exige cambiar el icono, la paleta, las proporciones ni la interfaz.

## Activos entregados

| Activo | Uso | Ruta |
| --- | --- | --- |
| Símbolo SVG | navegación, favicon/PWA y espacios compactos | `public/brand/midespensa-mark.svg` |
| Componente de marca | cabeceras y barras laterales | `src/components/ui/BrandLockup.tsx` |
| Iconos PWA | instalación móvil | `public/icons/icon-192.svg`, `public/icons/icon-512.svg` |

## Sistema visual

- **Verde despensa** `#49654E`: confianza doméstica y base de superficies de marca.
- **Marfil** `#FFFDF8`: interior, claridad y contraste cálido.
- **Terracota** `#D77950`: puerta abierta; se usa de forma puntual para señalar acción y cercanía.
- **Tinta** `#1F1D1B`: legibilidad del contenido.

El símbolo mantiene una caja cuadrada con esquinas suaves; no debe comprimirse ni recrearse con emojis, imágenes rasterizadas ni sombras. En la interfaz, el wordmark usa Inter con peso 700 y espaciado ligeramente cerrado para respetar la tipografía disponible y evitar cargar otra fuente solo para una fase de nombre todavía no validada.

## Naming: condición de salida

No se declara el nombre final ni se registra dominio, perfil social, marca o publicación con **MiDespensa**. El benchmark ya documenta una aplicación activa con ese nombre y una oferta cercana. Antes de cambiar esta nota de `proposal` a `active`, debe completarse una investigación de disponibilidad en dominios, tiendas y marcas, y una revisión jurídica/registral adecuada al mercado de lanzamiento.

Hasta entonces, el copy, `manifest`, metadatos y componente conservan MiDespensa para evitar una migración prematura. Cuando haya nombre aprobado, el cambio queda acotado a esos puntos y a la documentación de producto; el símbolo seguirá vigente.

## Criterios de aceptación

- El símbolo es reconocible y conserva contraste a 16, 32, 192 y 512 px.
- La navegación usa el mismo lockup en Despensa, Compra, Recetas y Plan.
- El nombre puede sustituirse en un solo componente sin redibujar el símbolo.
- La identidad no se presenta como registro de marca ni como disponibilidad jurídica comprobada.
