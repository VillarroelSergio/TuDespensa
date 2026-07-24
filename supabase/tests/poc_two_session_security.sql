-- Prueba de integración para el POC. Ejecutar contra TuDespensa Development.
-- Las identidades son UUID sintéticos aplicados como claims JWT de una sesión autenticada.

begin;

do $$
begin
  if to_regclass('public.poc_households') is null
     or to_regclass('public.poc_household_members') is null
     or to_regclass('public.poc_pantry_items') is null
     or to_regclass('public.poc_idempotency_keys') is null then
    raise exception 'POC schema is not installed';
  end if;
end;
$$;

delete from public.poc_idempotency_keys;
delete from public.poc_pantry_items;
delete from public.poc_household_members;
delete from public.poc_households;

insert into public.poc_households (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Synthetic household');

insert into public.poc_household_members (household_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'member');

insert into public.poc_pantry_items (id, household_id, label)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Synthetic tomatoes');

-- Las dos sesiones autorizadas ven el mismo hogar y la misma despensa.
set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  if (select count(*) from public.poc_households) <> 1
     or (select count(*) from public.poc_pantry_items) <> 1 then
    raise exception 'First member cannot read the shared household';
  end if;
end;
$$;
reset role;

set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  if (select count(*) from public.poc_households) <> 1
     or (select count(*) from public.poc_pantry_items) <> 1 then
    raise exception 'Second member cannot read the shared household';
  end if;
end;
$$;
reset role;

-- Una identidad ajena no puede leer datos privados.
set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.poc_households) <> 0
     or (select count(*) from public.poc_pantry_items) <> 0 then
    raise exception 'Outsider can read private data';
  end if;
end;
$$;
reset role;

-- El tercer miembro activo se rechaza sin modificar el hogar.
do $$
begin
  begin
    insert into public.poc_household_members (household_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'member');
    raise exception 'Third member was accepted';
  exception
    when check_violation then null;
  end;

  if (select count(*) from public.poc_household_members where active) <> 2 then
    raise exception 'Household member limit was not preserved';
  end if;
end;
$$;

-- El segundo cambio basado en una versión antigua se rechaza.
set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.poc_update_pantry_item(
  '30000000-0000-0000-0000-000000000001',
  1,
  'Updated by first member'
);
reset role;

set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.poc_update_pantry_item(
      '30000000-0000-0000-0000-000000000001',
      1,
      'Stale update by second member'
    );
    raise exception 'Stale update was accepted';
  exception
    when serialization_failure then null;
  end;
end;
$$;
reset role;

do $$
begin
  if (select label from public.poc_pantry_items where id = '30000000-0000-0000-0000-000000000001') <> 'Updated by first member'
     or (select version from public.poc_pantry_items where id = '30000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Optimistic concurrency did not preserve the confirmed update';
  end if;
end;
$$;

-- Repetir la misma operación idempotente no duplica el movimiento.
set local "request.jwt.claim.sub" = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
declare
  first_result jsonb;
  replay_result jsonb;
begin
  first_result := public.poc_consume_pantry_item(
    '30000000-0000-0000-0000-000000000001',
    2,
    'poc-consume-001'
  );
  replay_result := public.poc_consume_pantry_item(
    '30000000-0000-0000-0000-000000000001',
    2,
    'poc-consume-001'
  );

  if first_result <> replay_result
     or (select version from public.poc_pantry_items where id = '30000000-0000-0000-0000-000000000001') <> 3
     or (select count(*) from public.poc_idempotency_keys) <> 1 then
    raise exception 'Idempotent replay changed state more than once';
  end if;
end;
$$;
reset role;

-- Realtime recibe cambios de la tabla compartida.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'poc_pantry_items'
  ) then
    raise exception 'Pantry POC table is not published to Realtime';
  end if;
end;
$$;

rollback;
