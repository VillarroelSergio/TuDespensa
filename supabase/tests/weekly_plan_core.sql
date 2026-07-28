-- Integración SQL de Fase 5A. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.meal_plans') is null or to_regclass('public.planned_meals') is null then
    raise exception 'Weekly plan schema is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '44000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plan-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'plan-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Plan household', '[]'::jsonb, 'plan-household-0001');

do $$
declare
  recipe_id_value uuid; other_recipe_id uuid;
  set_result jsonb; replay_result jsonb; clear_result jsonb; move_result jsonb;
begin
  recipe_id_value := (public.recipes_create_recipe('Lentejas', null, null, null, 'plan-create-0001'))->>'recipe_id';
  other_recipe_id := (public.recipes_create_recipe('Tortilla', null, null, null, 'plan-create-0002'))->>'recipe_id';

  -- Asignar un hueco: crea la semana de forma perezosa y es idempotente.
  set_result := public.plan_set_meal('2026-07-21', 'lunch', recipe_id_value, 2, 'plan-set-0001');
  replay_result := public.plan_set_meal('2026-07-21', 'lunch', recipe_id_value, 2, 'plan-set-0001');
  if set_result <> replay_result then raise exception 'plan_set_meal was not idempotent'; end if;
  if (select count(*) from public.planned_meals) <> 1 then raise exception 'Planned meal was not stored'; end if;

  -- La semana se identifica por su lunes ISO (2026-07-21 es martes).
  if (select week_start_date from public.meal_plans) <> date '2026-07-20' then
    raise exception 'Week start is not the ISO monday';
  end if;
  if (select count(*) from public.meal_plans) <> 1 then raise exception 'Week was duplicated'; end if;

  -- Reasignar el mismo hueco sustituye la receta, nunca añade una segunda.
  perform public.plan_set_meal('2026-07-21', 'lunch', other_recipe_id, null, 'plan-set-0002');
  if (select count(*) from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'lunch') <> 1 then
    raise exception 'Slot holds more than one recipe';
  end if;
  if (select recipe_id from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'lunch') <> other_recipe_id then
    raise exception 'Slot reassignment did not replace the recipe';
  end if;
  if (select servings from public.planned_meals where meal_date = '2026-07-21' and meal_type = 'lunch') is not null then
    raise exception 'Slot reassignment kept the previous servings';
  end if;

  -- Comida y cena del mismo día son huecos distintos.
  perform public.plan_set_meal('2026-07-21', 'dinner', recipe_id_value, null, 'plan-set-0003');
  if (select count(*) from public.planned_meals where meal_date = '2026-07-21') <> 2 then
    raise exception 'Lunch and dinner are not independent slots';
  end if;

  -- Una fecha de otra semana crea su propia semana.
  perform public.plan_set_meal('2026-07-28', 'lunch', recipe_id_value, null, 'plan-set-0004');
  if (select count(*) from public.meal_plans) <> 2 then raise exception 'Second week was not created'; end if;

  -- Servicio inválido: rechazado.
  begin
    perform public.plan_set_meal('2026-07-22', 'brunch', recipe_id_value, null, 'plan-set-0005');
    raise exception 'Invalid meal type accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Raciones fuera de rango: rechazadas.
  begin
    perform public.plan_set_meal('2026-07-22', 'lunch', recipe_id_value, 0, 'plan-set-0006');
    raise exception 'Out-of-range servings accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Vaciar un hueco; repetirlo sobre un hueco vacío no es un error.
  clear_result := public.plan_clear_meal('2026-07-21', 'dinner', 'plan-clear-0001');
  if (clear_result->>'removed')::int <> 1 then raise exception 'Slot was not cleared'; end if;
  if (select count(*) from public.planned_meals where meal_date = '2026-07-21') <> 1 then
    raise exception 'Clearing removed more than one slot';
  end if;
  if ((public.plan_clear_meal('2026-07-23', 'lunch', 'plan-clear-0002'))->>'removed')::int <> 0 then
    raise exception 'Clearing an empty slot reported a removal';
  end if;

  -- Mover es una única operación: elimina el origen solo si puede ocupar el destino.
  perform public.plan_set_meal('2026-07-22', 'lunch', recipe_id_value, 3, 'plan-move-set-0001');
  move_result := public.plan_move_meal(
    '2026-07-22', 'lunch', '2026-07-23', 'dinner', 'plan-move-0001');
  if (move_result->>'moved')::boolean is not true then
    raise exception 'Move did not report success';
  end if;
  if exists (
    select 1 from public.planned_meals
    where meal_date = '2026-07-22' and meal_type = 'lunch'
  ) then
    raise exception 'Move kept the origin meal';
  end if;
  if not exists (
    select 1 from public.planned_meals
    where meal_date = '2026-07-23' and meal_type = 'dinner'
      and recipe_id = recipe_id_value and servings = 3
  ) then
    raise exception 'Move did not preserve the recipe and servings at destination';
  end if;
  if public.plan_move_meal(
    '2026-07-22', 'lunch', '2026-07-23', 'dinner', 'plan-move-0001') <> move_result then
    raise exception 'plan_move_meal was not idempotent';
  end if;

  -- Un destino ocupado se rechaza sin perder ni sobrescribir comidas.
  perform public.plan_set_meal('2026-07-24', 'lunch', recipe_id_value, null, 'plan-move-set-0002');
  perform public.plan_set_meal('2026-07-24', 'dinner', other_recipe_id, null, 'plan-move-set-0003');
  begin
    perform public.plan_move_meal(
      '2026-07-24', 'lunch', '2026-07-24', 'dinner', 'plan-move-0002');
    raise exception 'Move overwrote an occupied destination';
  exception when invalid_parameter_value then null;
  end;
  if (select recipe_id from public.planned_meals where meal_date = '2026-07-24' and meal_type = 'lunch') <> recipe_id_value
     or (select recipe_id from public.planned_meals where meal_date = '2026-07-24' and meal_type = 'dinner') <> other_recipe_id then
    raise exception 'Rejected move changed a meal';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no ve el plan ni puede planificar recetas que no le pertenecen.
set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Outsider household', '[]'::jsonb, 'plan-household-0002');
do $$
declare target_id uuid;
begin
  if (select count(*) from public.planned_meals) <> 0 then
    raise exception 'Outsider can read another household plan';
  end if;
  select id into target_id from public.recipes where title = 'Lentejas' limit 1;
  begin
    perform public.plan_set_meal('2026-07-21', 'lunch', coalesce(target_id, gen_random_uuid()), null, 'outsider-plan-0001');
    raise exception 'Outsider planned a recipe from another household';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

rollback;
