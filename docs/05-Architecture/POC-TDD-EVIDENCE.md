---
title: Evidencia TDD — POC de seguridad y sincronización
aliases:
  - POC TDD Evidence
tags:
  - midespensa
  - arquitectura
  - pruebas
  - supabase
status: verified
updated: 2026-07-19
related:
  - "[[TECHNICAL-ARCHITECTURE]]"
  - "[[DOMAIN-DATA-MODEL]]"
---

# Evidencia TDD — POC de seguridad y sincronización

## Alcance

Prueba de integración SQL ejecutada sobre `TuDespensa Development` con PostgreSQL 17 y UUID sintéticos. No crea usuarios de Auth, no envía correos y no conserva datos: el script termina con `ROLLBACK`.

## Recorridos comprobados

1. Como miembro A o B del hogar, puedo leer la misma despensa compartida.
2. Como identidad ajena, no puedo leer el hogar ni su despensa.
3. Como sistema, rechazo una tercera membresía activa.
4. Como dos personas que editan el mismo elemento, la segunda edición con versión antigua recibe conflicto.
5. Como cliente que reintenta una acción, recibo el mismo resultado sin duplicar la mutación.
6. Como aplicación, la tabla compartida queda incluida en `supabase_realtime`.

## RED → GREEN

| Fase | Evidencia | Resultado |
| --- | --- | --- |
| RED | `supabase/tests/poc_two_session_security.sql` contra el esquema vacío | Error `P0001: POC schema is not installed` |
| GREEN | El mismo script tras las migraciones `poc_two_session_security`, `fix_poc_idempotency_replay` y `fix_poc_idempotency_claim` | Ejecución correcta; todas las aserciones superadas |

El fallo intermedio del reintento descubrió que `SELECT ... FOR UPDATE` sobre la tabla idempotente exigía un permiso de actualización no concedido. La corrección final reclama la clave mediante `INSERT ... ON CONFLICT DO NOTHING`, evitando ampliar privilegios y haciendo el reintento atómico.

## Especificación verificable

| # | Garantía | Artefacto | Tipo | Resultado |
| --- | --- | --- | --- | --- |
| 1 | Los dos miembros leen un único hogar y elemento compartido | `supabase/tests/poc_two_session_security.sql` | integración SQL/RLS | PASS |
| 2 | Una identidad ajena no obtiene filas privadas | mismo script | integración SQL/RLS | PASS |
| 3 | No existe una tercera membresía activa | trigger `poc_enforce_two_active_members` | integración SQL | PASS |
| 4 | La versión antigua devuelve `serialization_failure` y preserva la edición confirmada | RPC `poc_update_pantry_item` | integración SQL | PASS |
| 5 | La misma clave idempotente devuelve el resultado inicial y deja una única fila | RPC `poc_consume_pantry_item` | integración SQL | PASS |
| 6 | `poc_pantry_items` pertenece a la publicación `supabase_realtime` | catálogo `pg_publication_tables` | integración de configuración | PASS |

## Cobertura y límites

La prueba cubre los 6 de 6 escenarios definidos en [[TECHNICAL-ARCHITECTURE#16. Protocolo de prueba técnica mínima]] para la capa de PostgreSQL. No existe aún una aplicación TypeScript, por lo que no es aplicable una métrica de cobertura de líneas; tampoco se ha validado el correo de Auth ni la recepción de un evento WebSocket en un navegador. Ambos quedan como prueba E2E obligatoria al implementar el cliente web y provisionar las dos cuentas reales.
