-- Hotfix 2026-07-28: shopping_toggle_item y pantry_adjust_item (vía
-- private.pantry_mutate) no deben insertar una clave idempotente para una
-- petición con versión ya obsoleta, y un reintento con la misma clave y la
-- misma carga debe servir el resultado guardado aunque la versión actual
-- haya avanzado por esa misma mutación. Ejecutar después de las
-- migraciones; nunca persiste datos.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'race-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'race-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '32000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Race household', '[]'::jsonb, 'race-household-0001');
select public.pantry_record_entry('fridge', 'Synthetic yogurt', 'units', null, 4, 'unit', 'race-entry-0001');
select public.shopping_add_item('Synthetic bread', 'manual', 'race-shop-add-0001');
reset role;

set local "request.jwt.claim.sub" = '32000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Race outsider household', '[]'::jsonb, 'race-household-0002');
reset role;

set local "request.jwt.claim.sub" = '32000000-0000-0000-0000-000000000001';
set local role authenticated;

-- Dos mutaciones rápidas sobre el mismo artículo (misma versión de partida,
-- claves distintas como generaría un doble clic): la primera gana, la
-- segunda ve la versión obsoleta y NO debe insertar clave idempotente. Antes
-- de este hotfix la insertaba y el rollback posterior la descartaba, pero ya
-- había generado WAL y bloqueado la fila.
do $$
declare shop_item_id uuid; before_count integer; after_count integer;
begin
  select id into shop_item_id from public.shopping_items limit 1;
  perform public.shopping_toggle_item(shop_item_id, 1, true, 'shopping-toggle-win-01');
  select count(*) into before_count from public.idempotency_keys
    where operation = 'shopping_toggle_item' and key = 'shopping-toggle-stale-01';
  begin
    perform public.shopping_toggle_item(shop_item_id, 1, true, 'shopping-toggle-stale-01');
    raise exception 'Stale toggle was accepted';
  exception when serialization_failure then null;
  end;
  select count(*) into after_count from public.idempotency_keys
    where operation = 'shopping_toggle_item' and key = 'shopping-toggle-stale-01';
  if before_count <> 0 or after_count <> 0 then
    raise exception 'Stale toggle claimed an idempotency key (% -> %)', before_count, after_count;
  end if;
end;
$$;

-- Reintento idempotente de una mutación ya aplicada: misma clave y misma
-- carga devuelven el resultado guardado sin volver a mutar, aunque la
-- versión actual del ítem ya haya avanzado por esa misma mutación.
do $$
declare shop_item_id uuid; first_result jsonb; replay_result jsonb; current_version integer;
begin
  select id into shop_item_id from public.shopping_items limit 1;
  select version into current_version from public.shopping_items where id = shop_item_id;
  first_result := public.shopping_toggle_item(shop_item_id, current_version, false, 'shopping-toggle-replay-01');
  replay_result := public.shopping_toggle_item(shop_item_id, current_version, false, 'shopping-toggle-replay-01');
  if first_result <> replay_result then
    raise exception 'Replay returned a different result';
  end if;
  if (select version from public.shopping_items where id = shop_item_id) <> (first_result->>'version')::integer then
    raise exception 'Replay mutated the item a second time';
  end if;
end;
$$;

-- Misma clave con una carga distinta: se rechaza y no aplica la segunda carga.
do $$
declare shop_item_id uuid; current_version integer;
begin
  select id into shop_item_id from public.shopping_items limit 1;
  select version into current_version from public.shopping_items where id = shop_item_id;
  perform public.shopping_toggle_item(shop_item_id, current_version, true, 'shopping-toggle-reuse-01');
  begin
    perform public.shopping_toggle_item(shop_item_id, current_version, false, 'shopping-toggle-reuse-01');
    raise exception 'Reused key with a different payload was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- pantry_adjust_item (private.pantry_mutate): la misma protección de
-- versión obsoleta sin insertar clave idempotente.
do $$
declare pantry_item_id uuid; before_count integer; after_count integer;
begin
  select id into pantry_item_id from public.pantry_items limit 1;
  perform public.pantry_adjust_item(pantry_item_id, 1, 'units', null, 3, 'unit', 'pantry-adjust-win-01');
  select count(*) into before_count from public.idempotency_keys
    where operation = 'pantry_adjust_item' and key = 'pantry-adjust-stale-01';
  begin
    perform public.pantry_adjust_item(pantry_item_id, 1, 'units', null, 5, 'unit', 'pantry-adjust-stale-01');
    raise exception 'Stale pantry adjust was accepted';
  exception when serialization_failure then null;
  end;
  select count(*) into after_count from public.idempotency_keys
    where operation = 'pantry_adjust_item' and key = 'pantry-adjust-stale-01';
  if before_count <> 0 or after_count <> 0 then
    raise exception 'Stale pantry adjust claimed an idempotency key (% -> %)', before_count, after_count;
  end if;
end;
$$;

-- Reintento idempotente de pantry_adjust_item: mismo resultado sin doble
-- descuento de movimiento, aunque la versión ya haya avanzado.
do $$
declare pantry_item_id uuid; first_result jsonb; replay_result jsonb; current_version integer; movements_before integer; movements_after integer;
begin
  select id into pantry_item_id from public.pantry_items limit 1;
  select version into current_version from public.pantry_items where id = pantry_item_id;
  select count(*) into movements_before from public.pantry_movements where item_id = pantry_item_id;
  first_result := public.pantry_adjust_item(pantry_item_id, current_version, 'units', null, 7, 'unit', 'pantry-adjust-replay-01');
  replay_result := public.pantry_adjust_item(pantry_item_id, current_version, 'units', null, 7, 'unit', 'pantry-adjust-replay-01');
  select count(*) into movements_after from public.pantry_movements where item_id = pantry_item_id;
  if first_result <> replay_result then
    raise exception 'Pantry adjust replay returned a different result';
  end if;
  if movements_after <> movements_before + 1 then
    raise exception 'Pantry adjust replay recorded a duplicate movement';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no puede mutar el ítem de otro hogar ni dejar rastro de
-- clave idempotente en el intento.
set local "request.jwt.claim.sub" = '32000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
declare before_count integer; after_count integer;
begin
  select count(*) into before_count from public.idempotency_keys where operation = 'shopping_toggle_item';
  begin
    perform public.shopping_toggle_item((select id from public.shopping_items limit 1), 1, true, 'shopping-toggle-outsider-01');
    raise exception 'Outsider could toggle a foreign shopping item';
  exception when serialization_failure then null;
  end;
  select count(*) into after_count from public.idempotency_keys where operation = 'shopping_toggle_item';
  if after_count <> before_count then
    raise exception 'Outsider attempt claimed an idempotency key';
  end if;
end;
$$;
reset role;

rollback;
