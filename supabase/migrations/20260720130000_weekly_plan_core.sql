-- Fase 5A: plan semanal base. Semana de un hogar y huecos de comida/cena.
-- El selector de recetas (P2) y el menú contextual son Fase 5B; aquí quedan el
-- modelo, sus garantías de unicidad y las RPC idempotentes de escritura.

-- Una semana por hogar, identificada por la fecha local de inicio (lunes ISO).
-- Existe para dar identidad a la semana (duplicar semana es una fase posterior);
-- se crea de forma perezosa cuando se planifica el primer hueco.
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start_date date not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start_date)
);

-- Como máximo una asignación por hogar, fecha y tipo de comida (DOMAIN-DATA-MODEL).
-- La unicidad se declara sobre (household_id, meal_date, meal_type): una fecha
-- pertenece a una sola semana, así que es la restricción directa y suficiente.
create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('lunch', 'dinner')),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  servings integer check (servings is null or (servings >= 1 and servings <= 99)),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, meal_date, meal_type)
);

create index planned_meals_household_date_idx on public.planned_meals (household_id, meal_date);

alter table public.meal_plans enable row level security;
alter table public.planned_meals enable row level security;

create policy "Active members read meal plans"
on public.meal_plans for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members read planned meals"
on public.planned_meals for select to authenticated
using ((select private.is_active_household_member(household_id)));

-- Asigna una receta a un hueco (fecha + comida/cena). Reasignar el mismo hueco
-- lo sustituye: la unicidad garantiza que nunca haya dos recetas en un hueco.
-- Los parámetros llevan sufijo `_value` (como `pantry_set_attention`) para no
-- colisionar con las columnas homónimas: un `on conflict (meal_date, ...)` con
-- nombres ambiguos no podría inferir el índice único.
create function public.plan_set_meal(meal_date_value date, meal_type_value text, recipe_id_value uuid, servings_value integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; week_start date;
  plan_id uuid; meal_row public.planned_meals;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner')
     or (servings_value is not null and (servings_value < 1 or servings_value > 99)) then
    raise exception 'Invalid planned meal' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  -- La receta debe pertenecer al hogar: evita planificar recetas ajenas.
  if not exists (select 1 from public.recipes where id = recipe_id_value and household_id = household_id_value) then
    raise exception 'Recipe not found in household' using errcode = 'invalid_parameter_value';
  end if;

  request_hash_value := private.pantry_request_hash('plan_set_meal', jsonb_build_object('meal_date', meal_date_value, 'meal_type', meal_type_value, 'recipe_id', recipe_id_value, 'servings', servings_value));
  replay := private.pantry_claim(household_id_value, actor_id, 'plan_set_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  week_start := (date_trunc('week', meal_date_value::timestamp))::date;
  insert into public.meal_plans (household_id, week_start_date, created_by)
  values (household_id_value, week_start, actor_id)
  on conflict (household_id, week_start_date) do update set week_start_date = excluded.week_start_date
  returning id into plan_id;

  insert into public.planned_meals (meal_plan_id, household_id, meal_date, meal_type, recipe_id, servings, created_by)
  values (plan_id, household_id_value, meal_date_value, meal_type_value, recipe_id_value, servings_value, actor_id)
  on conflict (household_id, meal_date, meal_type) do update
    set recipe_id = excluded.recipe_id, servings = excluded.servings,
        meal_plan_id = excluded.meal_plan_id, updated_at = now()
  returning * into meal_row;

  result := jsonb_build_object('planned_meal_id', meal_row.id, 'meal_date', meal_row.meal_date, 'meal_type', meal_row.meal_type);
  perform private.pantry_store_result(household_id_value, actor_id, 'plan_set_meal', idempotency_key, result);
  return result;
end;
$$;

-- Vaciar un hueco. Idempotente: repetir sobre un hueco vacío no es un error,
-- así el «Deshacer» de Fase 5B puede reintentarse sin efectos extraños.
create function public.plan_clear_meal(meal_date_value date, meal_type_value text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; removed integer;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner') then
    raise exception 'Invalid planned meal' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;

  request_hash_value := private.pantry_request_hash('plan_clear_meal', jsonb_build_object('meal_date', meal_date_value, 'meal_type', meal_type_value));
  replay := private.pantry_claim(household_id_value, actor_id, 'plan_clear_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  delete from public.planned_meals
  where household_id = household_id_value
    and meal_date = meal_date_value
    and meal_type = meal_type_value;
  get diagnostics removed = row_count;

  result := jsonb_build_object('removed', removed);
  perform private.pantry_store_result(household_id_value, actor_id, 'plan_clear_meal', idempotency_key, result);
  return result;
end;
$$;

revoke all on public.meal_plans, public.planned_meals from anon, authenticated;
grant select on public.meal_plans, public.planned_meals to authenticated;
revoke all on function public.plan_set_meal(date, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.plan_set_meal(date, text, uuid, integer, text) to authenticated;
revoke all on function public.plan_clear_meal(date, text, text) from public, anon, authenticated;
grant execute on function public.plan_clear_meal(date, text, text) to authenticated;

alter publication supabase_realtime add table public.planned_meals;
