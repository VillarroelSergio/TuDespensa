# ADR-0004: Acceso cerrado para dos cuentas con RLS

**Date**: 2026-07-19  
**Status**: accepted  
**Deciders**: Sergio Villa

## Context

La aplicación es para un único hogar de dos personas. Recetas, menú, compra y despensa son privados y deben permanecer inaccesibles a cualquier otra identidad.

## Decision

Provisionamos solo dos cuentas autorizadas, sin registro público ni creación de hogares adicionales. La pertenencia al hogar se valida en servicios de aplicación y RLS limita cada fila privada por `household_id`; las operaciones críticas usan transacciones y rechazan una tercera membresía.

## Alternatives Considered

### Registro público multiusuario

- **Pros**: crecimiento futuro sin cambios de producto.
- **Cons**: más abuso, soporte, flujos de invitación y superficie de seguridad.
- **Why not**: contradice el alcance permanente de un único hogar.

### Autorización solo en la interfaz

- **Pros**: implementación inicial aparente más corta.
- **Cons**: cualquier cliente podría intentar acceder a datos ajenos.
- **Why not**: ocultar controles no protege información privada.

## Consequences

### Positive

- Menor superficie de ataque y reglas de acceso fáciles de probar.
- Aislamiento reforzado tanto en servidor como en base de datos.

### Negative

- Añadir una persona o un segundo hogar requerirá una nueva decisión de producto y arquitectura.

### Risks

- Una política RLS incompleta podría filtrar datos; las pruebas incluirán identidad ajena, tercera cuenta y escalada de rol.
