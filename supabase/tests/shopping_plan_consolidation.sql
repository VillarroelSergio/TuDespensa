-- Integración SQL de Fase 6. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.shopping_items') is null then
    raise exception 'Shopping schema is not installed';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'shopping_add_plan_items'
  ) then
    raise exception 'shopping_add_plan_items is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '55000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'shop-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'shop-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '55000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Shop household', '[]'::jsonb, 'shop-household-0001');

do $$
declare
  first_result jsonb; replay_result jsonb;
  tomato_qty numeric; tomato_unit text; manual_source text;
begin
  -- Un producto manual que ya está en la lista no debe tocarse al consolidar.
  perform public.shopping_add_item('Aceite', 'manual', 'shop-manual-0001');

  first_result := public.shopping_add_plan_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"},
      {"name":"Aceite","quantity":200,"unit_code":"ml"},
      {"name":"Sal","quantity":null,"unit_code":null}]'::jsonb,
    'shop-plan-0001'
  );
  if (first_result->>'added')::int <> 2 then
    raise exception 'Expected two new products, got %', first_result->>'added';
  end if;

  -- El producto manual conserva su origen al consolidar sobre él.
  select source into manual_source from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id
    where lower(hf.name) = 'aceite';
  if manual_source <> 'manual' then
    raise exception 'Consolidation overwrote a manual product source';
  end if;

  -- Idempotencia: repetir la misma consolidación no añade ni duplica.
  replay_result := public.shopping_add_plan_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"},
      {"name":"Aceite","quantity":200,"unit_code":"ml"},
      {"name":"Sal","quantity":null,"unit_code":null}]'::jsonb,
    'shop-plan-0001'
  );
  if replay_result <> first_result then
    raise exception 'shopping_add_plan_items was not idempotent';
  end if;
  -- Aceite (manual) + Tomate + Sal = 3; el replay no debe crear un cuarto.
  if (select count(*) from public.shopping_items) <> 3 then
    raise exception 'Replay duplicated shopping items';
  end if;

  -- Consolidar de nuevo el mismo tomate (clave distinta) acumula la cantidad
  -- porque las unidades son compatibles.
  perform public.shopping_add_plan_items(
    '[{"name":"Tomate","quantity":300,"unit_code":"g"}]'::jsonb, 'shop-plan-0002'
  );
  select quantity, unit_code into tomato_qty, tomato_unit from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id
    where lower(hf.name) = 'tomate';
  if tomato_qty <> 800 or tomato_unit <> 'g' then
    raise exception 'Compatible quantities were not summed: % %', tomato_qty, tomato_unit;
  end if;
  if (select count(*) from public.shopping_items si
      join public.household_foods hf on hf.id = si.food_id
      where lower(hf.name) = 'tomate') <> 1 then
    raise exception 'Tomato was duplicated instead of merged';
  end if;

  -- Unidad incompatible (litros + gramos): no se inventa una suma, queda sin cantidad.
  perform public.shopping_add_plan_items(
    '[{"name":"Leche","quantity":1,"unit_code":"l"}]'::jsonb, 'shop-plan-0003'
  );
  perform public.shopping_add_plan_items(
    '[{"name":"Leche","quantity":500,"unit_code":"g"}]'::jsonb, 'shop-plan-0004'
  );
  if (select quantity from public.shopping_items si
      join public.household_foods hf on hf.id = si.food_id
      where lower(hf.name) = 'leche') is not null then
    raise exception 'Incompatible units were merged into a quantity';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno tiene su propia lista y no ve la del otro.
set local "request.jwt.claim.sub" = '55000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Outsider shop', '[]'::jsonb, 'shop-household-0002');
do $$
begin
  perform public.shopping_add_plan_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"}]'::jsonb, 'outsider-plan-0001'
  );
  if (select count(*) from public.shopping_items si
      join public.household_foods hf on hf.id = si.food_id
      where lower(hf.name) = 'aceite') <> 0 then
    raise exception 'Outsider can read another household shopping list';
  end if;
end;
$$;
reset role;

rollback;
