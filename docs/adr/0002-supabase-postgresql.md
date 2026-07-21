# ADR-0002: Supabase y PostgreSQL como plataforma de datos

**Date**: 2026-07-19  
**Status**: accepted  
**Deciders**: Sergio Villa

## Context

El producto necesita relaciones consistentes entre recetas, ingredientes, menú, compra y despensa, además de sincronización entre dos dispositivos y autorización por hogar.

## Decision

Usamos Supabase con PostgreSQL, Auth, Realtime y Storage. Las reglas e invariantes viven en migraciones SQL, restricciones, funciones transaccionales y Row Level Security; PostgreSQL es la fuente de verdad.

## Alternatives Considered

### Firebase como base principal

- **Pros**: sincronización sencilla y ecosistema gestionado.
- **Cons**: modelo documental menos natural para relaciones y consolidaciones transaccionales.
- **Why not**: compra, despensa y recetas requieren integridad relacional clara.

### PostgreSQL autogestionado

- **Pros**: control total de infraestructura.
- **Cons**: parches, copias, Auth y Realtime recaen en el hogar.
- **Why not**: añade mantenimiento sin aportar valor al MVP.

## Consequences

### Positive

- Integridad relacional, transacciones y RLS en un único sistema.
- Sincronización y autenticación listas para integrar.

### Negative

- Dependencia operativa de Supabase y límites del plan gratuito.

### Risks

- El plan Free no sustituye copias gestionadas; se mantienen exportaciones cifradas y se podrá subir de plan si la continuidad lo exige.
