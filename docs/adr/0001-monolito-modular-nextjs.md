# ADR-0001: Monolito modular con Next.js

**Date**: 2026-07-19  
**Status**: accepted  
**Deciders**: Sergio Villa

## Context

MiDespensa será una PWA para un único hogar de dos personas, con poco tráfico y un solo repositorio. Recetas, planificación, compra y despensa comparten transacciones y reglas de negocio.

## Decision

Usamos Next.js con App Router, React y TypeScript como un monolito modular. La interfaz, los Route Handlers y las Server Actions viven en el mismo despliegue; los módulos se comunican mediante servicios de aplicación y PostgreSQL.

## Alternatives Considered

### Microservicios

- **Pros**: independencia de despliegue y escalado por componente.
- **Cons**: más secretos, observabilidad, red y mantenimiento.
- **Why not**: no existe una carga ni una organización que justifique esa complejidad.

### Frontend y backend separados

- **Pros**: límite HTTP explícito y tecnologías independientes.
- **Cons**: duplica despliegue, autenticación y contratos.
- **Why not**: Next.js cubre los límites HTTP necesarios sin un segundo servicio.

## Consequences

### Positive

- Una base de código y despliegue más sencillos.
- Transacciones y autorización coherentes con el dominio compartido.

### Negative

- Los módulos deben conservar límites internos claros para evitar acoplamiento.

### Risks

- Un crecimiento no previsto podría requerir separar componentes; se revisará solo ante una necesidad funcional o de fiabilidad demostrada.
