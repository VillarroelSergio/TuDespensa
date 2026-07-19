-- Integración SQL de Fase 3. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.catalog_foods') is null
     or to_regclass('public.household_food_aliases') is null
     or to_regclass('public.pantry_consume_soon') is null then
    raise exception 'Pantry catalog schema is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pantry-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pantry-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pantry-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '31000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Pantry household', '[]'::jsonb, 'pantry-household-0001');
select public.pantry_record_entry('fridge', 'Synthetic milk', 'units', null, 2, 'unit', 'pantry-entry-0001');
reset role;

insert into public.household_members (household_id, user_id, role, status)
select id, '31000000-0000-0000-0000-000000000002', 'member', 'active' from public.households where name = 'Pantry household';

-- El reintento retorna exactamente el mismo resultado y no duplica movimiento.
set local "request.jwt.claim.sub" = '31000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
declare first_result jsonb; replay_result jsonb;
begin
  first_result := public.pantry_mark_low((select id from public.pantry_items limit 1), 1, 'pantry-low-0001');
  replay_result := public.pantry_mark_low((select id from public.pantry_items limit 1), 1, 'pantry-low-0001');
  if first_result <> replay_result
     or (select count(*) from public.pantry_movements where movement_type = 'consumption') <> 1 then
    raise exception 'Pantry retry was not idempotent';
  end if;
end;
$$;
reset role;

-- El segundo miembro no puede aplicar una versión antigua.
set local "request.jwt.claim.sub" = '31000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.pantry_mark_out((select id from public.pantry_items limit 1), 1, 'pantry-out-0001');
    raise exception 'Stale pantry update was accepted';
  exception when serialization_failure then null;
  end;
end;
$$;
reset role;

-- La restricción física de la base no permite cantidades negativas.
do $$
begin
  begin
    update public.pantry_items set tracking_mode = 'units', approximate_state = null, quantity = -1, unit_code = 'unit'
    where id = (select id from public.pantry_items limit 1);
    raise exception 'Negative quantity was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- El historial no se puede editar ni borrar.
do $$
begin
  begin
    update public.pantry_movements set movement_type = 'adjustment' where id = (select id from public.pantry_movements limit 1);
    raise exception 'Pantry movement update was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.pantry_movements where id = (select id from public.pantry_movements limit 1);
    raise exception 'Pantry movement delete was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

-- Un tercer hogar no ve ni puede mutar el inventario ajeno.
set local "request.jwt.claim.sub" = '31000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.pantry_items) <> 0
     or (select count(*) from public.household_foods) <> 0
     or (select count(*) from public.pantry_movements) <> 0 then
    raise exception 'Third household can read pantry data';
  end if;
  begin
    perform public.pantry_mark_out((select id from public.pantry_items limit 1), 2, 'pantry-outsider-0001');
    raise exception 'Third household can mutate pantry data';
  exception when serialization_failure then null;
  end;
end;
$$;
reset role;

-- Nuevas tablas y notificaciones están disponibles en las dos sesiones del hogar.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_movements')
     or not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_foods') then
    raise exception 'Pantry realtime publication is incomplete';
  end if;
end;
$$;

rollback;
