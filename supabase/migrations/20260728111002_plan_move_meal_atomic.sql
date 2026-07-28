-- Mueve una comida sin exponer estados intermedios. A diferencia de encadenar
-- plan_set_meal + plan_clear_meal desde el servidor, cualquier error revierte
-- la operación completa y conserva el hueco original.
create function public.plan_move_meal(
  from_meal_date_value date,
  from_meal_type_value text,
  to_meal_date_value date,
  to_meal_type_value text,
  idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  source_meal public.planned_meals;
  destination_meal public.planned_meals;
  destination_plan_id uuid;
  destination_week_start date;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if from_meal_date_value is null or to_meal_date_value is null
     or from_meal_type_value not in ('lunch', 'dinner')
     or to_meal_type_value not in ('lunch', 'dinner') then
    raise exception 'Invalid planned meal move' using errcode = 'invalid_parameter_value';
  end if;
  if from_meal_date_value = to_meal_date_value
     and from_meal_type_value = to_meal_type_value then
    raise exception 'Move destination must differ from origin' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash(
    'plan_move_meal',
    jsonb_build_object(
      'from_date', from_meal_date_value,
      'from_type', from_meal_type_value,
      'to_date', to_meal_date_value,
      'to_type', to_meal_type_value
    )
  );
  replay := private.pantry_claim(
    household_id_value, actor_id, 'plan_move_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  -- Las dos filas existentes se bloquean en el mismo orden para evitar que dos
  -- movimientos simultáneos se pisen entre sí. Si el destino aparece durante
  -- el UPDATE, la restricción única aborta la transacción entera.
  perform 1
  from public.planned_meals
  where household_id = household_id_value
    and (
      (meal_date = from_meal_date_value and meal_type = from_meal_type_value)
      or (meal_date = to_meal_date_value and meal_type = to_meal_type_value)
    )
  order by meal_date, meal_type
  for update;

  select * into source_meal
  from public.planned_meals
  where household_id = household_id_value
    and meal_date = from_meal_date_value
    and meal_type = from_meal_type_value;
  if source_meal.id is null then
    raise exception 'Origin meal was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  select * into destination_meal
  from public.planned_meals
  where household_id = household_id_value
    and meal_date = to_meal_date_value
    and meal_type = to_meal_type_value;
  if destination_meal.id is not null then
    raise exception 'Move destination is already occupied' using errcode = 'invalid_parameter_value';
  end if;

  destination_week_start := (date_trunc('week', to_meal_date_value::timestamp))::date;
  insert into public.meal_plans (household_id, week_start_date, created_by)
  values (household_id_value, destination_week_start, actor_id)
  on conflict (household_id, week_start_date) do update
    set week_start_date = excluded.week_start_date
  returning id into destination_plan_id;

  update public.planned_meals
  set meal_plan_id = destination_plan_id,
      meal_date = to_meal_date_value,
      meal_type = to_meal_type_value,
      updated_at = now()
  where id = source_meal.id;

  result := jsonb_build_object(
    'moved', true,
    'from_date', from_meal_date_value,
    'from_type', from_meal_type_value,
    'to_date', to_meal_date_value,
    'to_type', to_meal_type_value
  );
  perform private.pantry_store_result(
    household_id_value, actor_id, 'plan_move_meal', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.plan_move_meal(date, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.plan_move_meal(date, text, date, text, text)
  to authenticated;
