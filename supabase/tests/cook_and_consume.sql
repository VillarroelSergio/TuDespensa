-- Integración SQL de Fase 8 (cocinar y consumo asistido). Ejecutar tras las
-- migraciones; nunca persiste datos.
begin;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'plan_cook_meal') then
    raise exception 'plan_cook_meal is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cook-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cook-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '58000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Cook household', '[]'::jsonb, 'ck-household-0001');

do $$
declare
  recipe jsonb; recipe_id uuid;
  oil jsonb; oil_item uuid; oil_ver integer;
  salt jsonb; salt_item uuid; salt_ver integer;
  rice jsonb; rice_item uuid; rice_ver integer;
  cooked jsonb; replay jsonb; payload jsonb;
  pantry_oil numeric; salt_state text; salt_present boolean; rice_qty numeric;
  cooked_marks integer; oil_moves integer; lunch_cooked timestamptz; dinner_cooked timestamptz;
begin
  -- Receta y dos huecos (comida y cena) planificados.
  recipe := public.recipes_create_recipe('Ensalada templada', 'main', 15, 2, 'ck-recipe-0001');
  recipe_id := (recipe->>'recipe_id')::uuid;
  perform public.plan_set_meal('2026-07-21', 'lunch', recipe_id, 2, 'ck-plan-0001');
  perform public.plan_set_meal('2026-07-21', 'dinner', recipe_id, 2, 'ck-plan-0002');

  -- Despensa: aceite (1.5 L), sal (aproximada 'some') y arroz (1 kg).
  oil := public.pantry_record_entry('pantry', 'Aceite de oliva', 'measure', null, 1.5, 'l', 'ck-oil-0001');
  oil_item := (oil->>'item_id')::uuid; oil_ver := (oil->>'version')::integer;
  salt := public.pantry_record_entry('pantry', 'Sal', 'approximate', 'some', null, null, 'ck-salt-0001');
  salt_item := (salt->>'item_id')::uuid; salt_ver := (salt->>'version')::integer;
  rice := public.pantry_record_entry('pantry', 'Arroz', 'measure', null, 1, 'kg', 'ck-rice-0001');
  rice_item := (rice->>'item_id')::uuid; rice_ver := (rice->>'version')::integer;

  -- Cocinar la comida: descuenta 0.2 L de aceite y baja la sal a 'low'.
  payload := jsonb_build_array(
    jsonb_build_object('item_id', oil_item, 'version', oil_ver, 'tracking_mode', 'measure',
      'approximate_state', null, 'quantity', 1.3, 'unit_code', 'l'),
    jsonb_build_object('item_id', salt_item, 'version', salt_ver, 'tracking_mode', 'approximate',
      'approximate_state', 'low', 'quantity', null, 'unit_code', null));
  cooked := public.plan_cook_meal('2026-07-21', 'lunch', payload, 'ck-cook-0001');
  if (cooked->>'consumed')::integer <> 2 or (cooked->>'cooked')::boolean is not true then
    raise exception 'Expected two consumptions and cooked=true, got %', cooked;
  end if;

  -- Despensa descontada: aceite 1.3 L, sal 'low' y aún presente.
  select quantity into pantry_oil from public.pantry_items where id = oil_item;
  if pantry_oil <> 1.3 then raise exception 'Oil was not discounted: %', pantry_oil; end if;
  select approximate_state, presence into salt_state, salt_present from public.pantry_items where id = salt_item;
  if salt_state <> 'low' or salt_present is not true then
    raise exception 'Salt state was not stepped down: % %', salt_state, salt_present;
  end if;

  -- La comida queda marcada como cocinada; la cena, no.
  select cooked_at into lunch_cooked from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'lunch';
  select cooked_at into dinner_cooked from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'dinner';
  if lunch_cooked is null or dinner_cooked is not null then
    raise exception 'Cook marking is wrong: lunch=% dinner=%', lunch_cooked, dinner_cooked;
  end if;

  -- Un movimiento de consumo trazable por producto descontado.
  select count(*) into oil_moves from public.pantry_movements
    where item_id = oil_item and movement_type = 'consumption'
      and item_snapshot->>'source' = 'meal_cooked';
  if oil_moves <> 1 then raise exception 'Expected one cook consumption for oil, got %', oil_moves; end if;

  -- Idempotencia: repetir con la misma clave y payload no vuelve a descontar.
  replay := public.plan_cook_meal('2026-07-21', 'lunch', payload, 'ck-cook-0001');
  if replay <> cooked then raise exception 'plan_cook_meal was not idempotent'; end if;
  select quantity into pantry_oil from public.pantry_items where id = oil_item;
  if pantry_oil <> 1.3 then raise exception 'Replay double-discounted the oil: %', pantry_oil; end if;

  -- Cocinar de nuevo un hueco ya cocinado (otra clave) aborta: no se descuenta dos veces.
  begin
    perform public.plan_cook_meal('2026-07-21', 'lunch', payload, 'ck-cook-0002');
    raise exception 'Cooking an already-cooked meal should conflict';
  exception when serialization_failure then null; -- esperado
  end;

  -- Conflicto de versión en la cena: una versión distinta a la real aborta entero.
  begin
    perform public.plan_cook_meal('2026-07-21', 'dinner',
      jsonb_build_array(jsonb_build_object('item_id', rice_item, 'version', rice_ver + 1,
        'tracking_mode', 'measure', 'approximate_state', null, 'quantity', 0.5, 'unit_code', 'kg')),
      'ck-cook-0003');
    raise exception 'Stale version should have conflicted';
  exception when serialization_failure then null; -- esperado
  end;
  -- Nada se aplicó a medias: arroz intacto y cena sin cocinar.
  select quantity into rice_qty from public.pantry_items where id = rice_item;
  select cooked_at into dinner_cooked from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'dinner';
  if rice_qty <> 1 or dinner_cooked is not null then
    raise exception 'Conflict left cooking half-applied: rice=% dinner=%', rice_qty, dinner_cooked;
  end if;

  -- Cocinar solo cuenta las comidas realmente cocinadas.
  select count(*) into cooked_marks from public.planned_meals where cooked_at is not null;
  if cooked_marks <> 1 then raise exception 'Unexpected number of cooked meals: %', cooked_marks; end if;
end;
$$;
reset role;

-- Un hogar ajeno no puede cocinar la comida del otro (no la ve).
set local "request.jwt.claim.sub" = '58000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Outsider cook', '[]'::jsonb, 'ck-household-0002');
do $$
begin
  begin
    perform public.plan_cook_meal('2026-07-21', 'dinner', '[]'::jsonb, 'ck-outsider-0001');
    raise exception 'Outsider should not cook another household meal';
  exception when serialization_failure then null; -- esperado: el hueco no existe para este hogar
  end;
end;
$$;
reset role;

rollback;
