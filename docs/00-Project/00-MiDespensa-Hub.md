---
title: MiDespensa — Centro del proyecto
aliases:
  - MiDespensa Hub
tags:
  - midespensa
  - proyecto
  - indice
status: active
notion: "https://app.notion.com/p/3a1ad407cbfd81979530f32cc6669b0a"
notion_tasks: "https://app.notion.com/p/0136d6873c8e48d39e7af7a5d4a66c64"
figma_project: "https://www.figma.com/files/project/627466188"
figma_file: "https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih"
figma_scope: "627466188"
---

# MiDespensa — Centro del proyecto

> [!abstract] Propósito
> Punto de entrada para la documentación de MiDespensa y contexto principal para las personas y asistentes que trabajen en el proyecto.

## Enlaces externos

- [Proyecto y tareas en Notion](https://app.notion.com/p/3a1ad407cbfd81979530f32cc6669b0a)
- [Tablero de tareas — MiDespensa](https://app.notion.com/p/0136d6873c8e48d39e7af7a5d4a66c64)
- [Archivo maestro de wireframes y UI](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih)
- [Carpeta del proyecto en Figma](https://www.figma.com/files/project/627466188)

### Organización del archivo de Figma

El archivo maestro está organizado en cinco páginas. Antes de implementar una pantalla, se debe abrir la página del módulo correspondiente y obtener el contexto del nodo concreto; los nombres de página no sustituyen ese contexto.

| Página de Figma | Nodo de Figma | Módulo de código | Alcance visual |
| --- | --- | --- | --- |
| `ONBOARDING` | [7:1261](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=7-1261) | `onboarding`, `household`, `pantry` | Alta del hogar, línea base e inventario inicial |
| `DESPENSA` | [47:2](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=47-2) | `pantry`, `catalog` | Inventario habitual y sus estados |
| `COMPRA` | [29:3290](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-3290) | `shopping` | Lista de compra, revisión y estados de ticket |
| `RECETAS` | [29:1906](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-1906) | `recipes`, `recommendations` | Recetario, preferencias y sugerencias |
| `PLAN SEMANAL` | [29:5](https://www.figma.com/design/mq6mzlMD6bsiKy9HKnrkih/MiDespensa-%E2%80%94-Wireframes-y-UI?node-id=29-5) | `planning`, `recommendations` | Menú semanal y propuestas |

## Documentación principal

- [[WORKFLOW|Flujo de trabajo obligatorio]]
- [[ACTIVE-CONTEXT|Contexto y tarea activa]]
- [[PRODUCT-BRIEF|Visión y definición de producto]]
- [[MVP-FUNCTIONAL-BRIEF|Contrato funcional del MVP]]
- [[INFORMATION-ARCHITECTURE|Arquitectura de información minimalista]]
- [[ONBOARDING-WIREFLOW|Wireflow de onboarding e inventario inicial]]
- [[ONBOARDING-SCREEN-SPEC|Especificación detallada de pantallas del onboarding]]
- [[CORE-MVP-FLOWS-SPEC|Flujos principales del MVP]]
- [[PLAN-SCREEN-SPEC|Especificación de pantallas del plan semanal]]
- [[RECIPES-SCREEN-SPEC|Especificación de pantallas de recetas]]
- [[SHOPPING-SCREEN-SPEC|Especificación de pantallas de compra]]
- [[PANTRY-SCREEN-SPEC|Especificación de pantallas de despensa]]
- [[COMPETITIVE-BENCHMARK|Benchmark competitivo]]
- [[DOMAIN-DATA-MODEL|Modelo de dominio y datos]]
- [[TECHNICAL-ARCHITECTURE|Arquitectura técnica del MVP web]]
- [[adr/README|Registro de decisiones arquitectónicas]]

## Estructura del vault

| Carpeta | Propósito |
| --- | --- |
| `00-Project` | Hub, reglas de trabajo y contexto activo |
| `01-Product` | Visión, alcance, métricas y roadmap de producto |
| `02-Requirements` | Requisitos y criterios de aceptación |
| `03-UX` | Flujos, arquitectura de información y decisiones UX |
| `04-Research` | Investigación de mercado, competencia y evidencias externas |
| `05-Architecture` | Arquitectura técnica, dominio, datos y decisiones de infraestructura |

Se crearán nuevas carpetas únicamente cuando exista contenido canónico que lo justifique.

## Fuentes de verdad

| Información | Fuente principal | Contenido |
| --- | --- | --- |
| Trabajo | Notion | Tareas, estado, prioridad, responsable y dependencias |
| Diseño | Figma | Wireframes, flujos visuales, prototipos y componentes |
| Conocimiento | Obsidian | Producto, requisitos, arquitectura, decisiones e investigación |
| Implementación | Repositorio | Código, pruebas, configuración y entregables ejecutables |

## Regla de enlace

Cada tarea de implementación en Notion debería enlazar:

1. la especificación o decisión correspondiente en Obsidian;
2. el archivo o nodo de Figma cuando tenga impacto visual;
3. el entregable del repositorio cuando se implemente.

Una decisión importante tomada durante el diseño o desarrollo debe documentarse en Obsidian antes de considerar terminada la tarea de Notion.

## Flujo de trabajo

```mermaid
flowchart LR
    N["Notion: tarea"] --> O["Obsidian: requisitos y decisiones"]
    O --> F["Figma: wireframe o diseño"]
    F --> C["Repositorio: implementación"]
    C --> V["Verificación"]
    V --> N
```

## Estado actual

- [x] Definición inicial del producto.
- [x] Contrato funcional preliminar.
- [x] Arquitectura de información minimalista.
- [x] Onboarding con inventario manual inicial confirmado.
- [x] Benchmark inicial de productos comparables.
- [x] Configurar gestión de tareas en Notion.
- [x] Crear archivo de wireframes en el proyecto de Figma.
- [x] Abrir esta carpeta como vault de Obsidian.
- [x] Definir el modelo de dominio y datos.
- [x] Aprobar la arquitectura técnica del MVP web.
- [x] Finalizar y organizar los wireframes por módulo en el archivo maestro de Figma.

## Convenciones documentales

- Una nota por decisión o tema estable.
- Wikilinks para relaciones internas.
- Enlaces web para Notion, Figma y fuentes externas.
- Las hipótesis deben identificarse como pendientes de validar.
- Las decisiones confirmadas deben indicar su origen y fecha.
- No almacenar secretos, credenciales ni datos personales en las notas.
