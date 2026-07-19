# ADR-0003: Vercel Hobby inicial y Cloudflare como salida

**Date**: 2026-07-19  
**Status**: accepted  
**Deciders**: Sergio Villa

## Context

MiDespensa es un proyecto personal de dos personas que busca coste inicial cero y despliegue seguro para Next.js. Vercel Hobby es apto mientras se mantenga el uso personal y no comercial.

## Decision

Desplegamos inicialmente Next.js en Vercel Hobby y Supabase en región europea. Conservamos compatibilidad de despliegue para migrar a Cloudflare Workers mediante OpenNext si el uso deja de cumplir las condiciones de Vercel o cambia la prioridad operativa.

## Alternatives Considered

### Cloudflare Workers desde el inicio

- **Pros**: cuotas gratuitas y mayor control de la plataforma edge.
- **Cons**: adaptación y operación de Next.js más específicas.
- **Why not**: Vercel reduce la fricción inicial con Next.js.

### VPS propio

- **Pros**: control absoluto.
- **Cons**: coste, actualizaciones, superficie de ataque y copias a cargo del hogar.
- **Why not**: no es proporcional a dos usuarios.

## Consequences

### Positive

- Publicación y previews sencillos sin coste inicial previsto.
- Salida identificada si cambian las condiciones comerciales.

### Negative

- Dependemos de los límites y condiciones de un proveedor gratuito.

### Risks

- Las condiciones y cuotas pueden cambiar; se revisarán antes de publicar y en la revisión mensual de operación.
