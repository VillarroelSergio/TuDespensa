-- Auditoría 2026-07-31 (B-7). Mover una comida de hueco eran dos escrituras
-- separadas desde el servidor: `plan_set_meal` en el destino y después
-- `plan_clear_meal` en el origen. Se hacía en ese orden a propósito —si fallaba
-- la segunda, la comida aparecía duplicada en vez de perderse— pero el estado
-- intermedio incorrecto seguía siendo posible y quedaba fijado en la base de
-- datos, con Realtime propagándolo a la otra persona del hogar.
--
-- Aquí las dos partes viven en la misma transacción: o se mueve entera o no se
-- mueve nada. No hay ventana en la que la semana esté mal.
create function public.plan_move_meal(
  from_date_value date,
  from_type_value text,
  to_date_value date,
  to_type_value text,
  idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  source_row public.planned_meals;
  week_start date;
  plan_id uuid;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if from_date_value is null or to_date_value is null
     or from_type_value not in ('lunch', 'dinner')
     or to_type_value not in ('lunch', 'dinner') then
    raise exception 'Invalid planned meal' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  -- Mover a donde ya se está no es un error: se responde sin tocar nada, para
  -- que un reintento del navegador no acabe en un fallo confuso.
  if from_date_value = to_date_value and from_type_value = to_type_value then
    return jsonb_build_object('moved', false);
  end if;

  request_hash_value := private.pantry_request_hash('plan_move_meal', jsonb_build_object(
    'from_date', from_date_value, 'from_type', from_type_value,
    'to_date', to_date_value, 'to_type', to_type_value));
  replay := private.pantry_peek_idempotent(
    household_id_value, actor_id, 'plan_move_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  select * into source_row
  from public.planned_meals
  where household_id = household_id_value
    and meal_date = from_date_value
    and meal_type = from_type_value
  for update;
  if source_row.id is null then
    raise exception 'Planned meal was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  replay := private.pantry_claim(
    household_id_value, actor_id, 'plan_move_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  -- La semana de destino puede ser otra: hay que asegurar su plan antes de
  -- colgar el hueco de él.
  week_start := (date_trunc('week', to_date_value::timestamp))::date;
  insert into public.meal_plans (household_id, week_start_date, created_by)
  values (household_id_value, week_start, actor_id)
  on conflict (household_id, week_start_date)
    do update set week_start_date = excluded.week_start_date
  returning id into plan_id;

  -- El destino ocupado se sustituye, igual que hacía plan_set_meal.
  delete from public.planned_meals
  where household_id = household_id_value
    and meal_date = to_date_value
    and meal_type = to_type_value;

  update public.planned_meals
  set meal_date = to_date_value,
      meal_type = to_type_value,
      meal_plan_id = plan_id,
      updated_at = now()
  where id = source_row.id;

  result := jsonb_build_object('moved', true, 'recipe_id', source_row.recipe_id);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'plan_move_meal', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.plan_move_meal(date, text, date, text, text) from public, anon;
grant execute on function public.plan_move_meal(date, text, date, text, text) to authenticated;
