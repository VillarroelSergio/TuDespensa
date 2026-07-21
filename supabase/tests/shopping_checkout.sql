-- Integración SQL de Fase 7 (cierre de compra). Ejecutar tras las migraciones;
-- nunca persiste datos.
begin;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'shopping_confirm_purchase') then
    raise exception 'shopping_confirm_purchase is not installed';
  end if;
  if not exists (select 1 from pg_proc where proname = 'shopping_checkout_preview') then
    raise exception 'shopping_checkout_preview is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '56000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'co-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '56000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'co-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '56000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Checkout household', '[]'::jsonb, 'co-household-0001');

do $$
declare
  tomato jsonb;
  oil_item uuid; oil_ver integer;
  tomato_item uuid; tomato_ver integer;
  salt_item uuid; salt_ver integer;
  preview jsonb; confirmed jsonb; replay jsonb; payload jsonb;
  pantry_oil numeric; pantry_oil_unit text; tomato_present boolean;
  oil_entries integer;
begin
  -- Despensa: aceite 0.5 L ya presente, para probar la suma al confirmar.
  perform public.pantry_record_entry('pantry', 'Aceite de oliva', 'measure', null, 0.5, 'l', 'co-pantry-0001');

  -- Compra: aceite con cantidad (vía plan) + tomates manual (sin cantidad).
  perform public.shopping_add_plan_items(
    '[{"name":"Aceite de oliva","quantity":1,"unit_code":"l"}]'::jsonb, 'co-plan-0001');
  tomato := public.shopping_add_item('Tomates', 'manual', 'co-add-0001');
  tomato_item := (tomato->>'item_id')::uuid; tomato_ver := (tomato->>'version')::integer;

  -- Marcar ambos como comprados.
  select si.id, si.version into oil_item, oil_ver from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'aceite de oliva';
  perform public.shopping_toggle_item(oil_item, oil_ver, true, 'co-toggle-0001');
  perform public.shopping_toggle_item(tomato_item, tomato_ver, true, 'co-toggle-0002');

  -- Vista previa: aceite = actualizar 0.5 → 1.5 L; tomates = alta.
  preview := public.shopping_checkout_preview();
  if jsonb_array_length(preview) <> 2 then
    raise exception 'Preview should list two purchased items: %', preview;
  end if;
  if not exists (select 1 from jsonb_array_elements(preview) e
      where e->>'name' = 'Aceite de oliva' and e->>'action' = 'update'
        and (e->>'to_quantity')::numeric = 1.5) then
    raise exception 'Oil preview did not project the summed quantity: %', preview;
  end if;
  if not exists (select 1 from jsonb_array_elements(preview) e
      where e->>'name' = 'Tomates' and e->>'action' = 'add') then
    raise exception 'Tomatoes preview should be an add: %', preview;
  end if;

  -- Confirmar (con la versión actual de cada comprado).
  payload := (select jsonb_agg(jsonb_build_object('item_id', si.id, 'version', si.version))
              from public.shopping_items si where si.is_purchased);
  confirmed := public.shopping_confirm_purchase(payload, 'co-confirm-0001');
  if (confirmed->>'confirmed')::integer <> 2 then
    raise exception 'Expected two confirmations, got %', confirmed;
  end if;

  -- Despensa: aceite sumado a 1.5 L; tomates presente.
  select pi.quantity, pi.unit_code into pantry_oil, pantry_oil_unit from public.pantry_items pi
    join public.household_foods hf on hf.id = pi.food_id where lower(hf.name) = 'aceite de oliva';
  if pantry_oil <> 1.5 or pantry_oil_unit <> 'l' then
    raise exception 'Oil was not summed in pantry: % %', pantry_oil, pantry_oil_unit;
  end if;
  select pi.presence into tomato_present from public.pantry_items pi
    join public.household_foods hf on hf.id = pi.food_id where lower(hf.name) = 'tomates';
  if tomato_present is not true then
    raise exception 'Tomatoes were not added to the pantry';
  end if;

  -- Los comprados salen de la lista.
  if (select count(*) from public.shopping_items where is_purchased) <> 0 then
    raise exception 'Confirmed items were not removed from the list';
  end if;

  -- Un movimiento de entrada trazable por producto.
  select count(*) into oil_entries from public.pantry_movements pm
    join public.pantry_items pi on pi.id = pm.item_id
    join public.household_foods hf on hf.id = pi.food_id
    where lower(hf.name) = 'aceite de oliva' and pm.movement_type = 'entry'
      and pm.item_snapshot->>'source' = 'shopping_checkout';
  if oil_entries <> 1 then
    raise exception 'Expected one checkout entry movement for oil, got %', oil_entries;
  end if;

  -- Idempotencia: repetir con la misma clave y payload no vuelve a aplicar.
  replay := public.shopping_confirm_purchase(payload, 'co-confirm-0001');
  if replay <> confirmed then
    raise exception 'shopping_confirm_purchase was not idempotent';
  end if;
  select pi.quantity into pantry_oil from public.pantry_items pi
    join public.household_foods hf on hf.id = pi.food_id where lower(hf.name) = 'aceite de oliva';
  if pantry_oil <> 1.5 then
    raise exception 'Replay double-applied the quantity: %', pantry_oil;
  end if;

  -- Conflicto: confirmar con una versión distinta a la real aborta entero.
  perform public.shopping_add_item('Sal', 'manual', 'co-add-0002');
  select si.id, si.version into salt_item, salt_ver from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'sal';
  perform public.shopping_toggle_item(salt_item, salt_ver, true, 'co-toggle-0003');
  begin
    perform public.shopping_confirm_purchase(
      jsonb_build_array(jsonb_build_object('item_id', salt_item, 'version', salt_ver)),
      'co-confirm-0002');
    raise exception 'Stale version should have conflicted';
  exception when serialization_failure then
    null; -- esperado
  end;
  -- La sal sigue en la lista: nada se aplicó a medias.
  if (select count(*) from public.shopping_items si
      join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'sal') <> 1 then
    raise exception 'Conflict left the list in a bad state';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no ve ni confirma la compra del otro.
set local "request.jwt.claim.sub" = '56000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Outsider checkout', '[]'::jsonb, 'co-household-0002');
do $$
begin
  if jsonb_array_length(public.shopping_checkout_preview()) <> 0 then
    raise exception 'Outsider sees another household checkout preview';
  end if;
end;
$$;
reset role;

rollback;
