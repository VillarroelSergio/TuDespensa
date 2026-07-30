# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Este proyecto sigue [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-07-30

Primera versión estable del MVP: ciclo completo de recetas → plan → compra → despensa, listo para el piloto privado del hogar fundador.

### Añadido

- Recetario compartido con captura por enlace, editor estructurado (ingredientes, pasos, raciones), categorías, favoritos y puntuación por persona.
- Planificador semanal de comidas y cenas con sugerencias explicables basadas en despensa, prioridad de consumo, favoritos y variedad reciente.
- Lista de la compra consolidada desde el plan, con alta manual, agrupación de unidades compatibles y cierre de compra hacia la despensa.
- Despensa con seguimiento por unidades exactas, peso/volumen o presencia aproximada, zona de limpieza y avisos de "consumir pronto".
- Flujo de cocinar y consumir que descuenta de la despensa el estado confirmado por la persona.
- Captura de ticket de compra (texto, foto o PDF) procesada en el navegador, sin OCR en servidor y sin persistir la imagen.
- Copia de seguridad del hogar: instantánea JSON descargable y restauración conservadora.
- Onboarding con informe manual inicial de alimentos por frigorífico, congelador y despensa.
- Autenticación cerrada por enlace mágico/OTP, invitación de la segunda cuenta y Row Level Security en toda tabla privada.
- Auditoría de accesibilidad y contraste (WCAG), navegación y patrones de foco en toda la interfaz.
- Suite de verificación en CI: lint, tipos, build y pruebas unitarias en cada cambio; pruebas E2E reales de Auth, RLS y Realtime con dos sesiones.

### Cambiado

- Sistema visual rediseñado con una paleta cálida de cocina (terracota/crema) y tokens de marca intercambiables.

[1.0.0]: https://github.com/VillarroelSergio/TuDespensa/releases/tag/v1.0.0
