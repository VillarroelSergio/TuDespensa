---
title: MiDespensa — Contexto visual para modelos
aliases:
  - Visual Context
tags:
  - midespensa
  - proyecto
  - ui
  - agentes
status: active
related:
  - "[[00-MiDespensa-Hub]]"
  - "[[ACTIVE-CONTEXT]]"
  - "[[WORKFLOW]]"
---

# MiDespensa — Contexto visual para modelos

## Propósito

Las imágenes y los archivos `.snapshot.txt` de `visual-context/` muestran el estado actual de la interfaz ejecutada localmente. Sirven para que una persona o un modelo comprenda qué se ve realmente antes de cambiar una pantalla.

- La imagen `.png` muestra el aspecto visual.
- El archivo `.snapshot.txt` enumera los elementos que un agente puede usar: títulos, botones, campos y enlaces.
- Las imágenes anotadas numeran los controles; el mismo número aparece como referencia en el archivo de texto correspondiente.

## Actualizar las capturas

Desde la carpeta principal del proyecto, ejecutar:

```powershell
npm run snapshot:ui
```

El comando usa el mismo navegador fiable de las pruebas automáticas, abre la aplicación local si hace falta y actualiza todas estas vistas en **móvil (390 px), tablet (768 px) y escritorio (1440 px)**, sin usar datos personales:

- Acceso de desarrollo y onboarding.
- Despensa: lista y formulario «Añadir producto».
- Compra: lista y revisión antes de confirmar la compra.
- Recetas: biblioteca y formulario «Añadir receta».
- Plan semanal y selector de receta para un hueco.

Antes de una revisión visual o de pedir cambios de interfaz, ejecutar el comando para que los modelos trabajen con imágenes actuales. Los datos mostrados en desarrollo son los estados vacíos locales; los recorridos con una cuenta real se mantienen cubiertos por las pruebas E2E.

## Archivos generados

Esto genera 54 pantallas visuales y 54 mapas de controles. Mantiene las capturas vacías y añade el escenario sintético `everyday` para Despensa, Compra, revisión de compra, Recetas, Plan, selector de receta y Cocina, en móvil, tablet y escritorio.

El escenario `everyday` se activa exclusivamente con `?fixture=everyday` en desarrollo. Contiene datos fijos sin PII —productos, recetas, plan, compra y revisión de Cocina— y nunca consulta ni escribe datos reales de Supabase. El script usa por defecto el puerto `3011` para no compartir servidor con otros worktrees; puede cambiarse con `VISUAL_CONTEXT_PORT`.

Los archivos se guardan en `docs/00-Project/visual-context/`. Se actualizan a propósito: forman parte de la evidencia visual del proyecto y no contienen credenciales ni datos privados.
