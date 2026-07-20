-- Fase 4A: fundamentos de Recetas. Biblioteca privada por hogar.
-- El modelo cubre recetas, ingredientes y pasos; las mutaciones se encapsulan
-- en RPCs idempotentes. El editor estructurado (ingredientes/pasos) es Fase 4B.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  dish_type text check (dish_type is null or dish_type in ('breakfast', 'starter', 'main', 'side', 'dessert', 'drink', 'other')),
  total_minutes integer check (total_minutes is null or (total_minutes >= 0 and total_minutes <= 1440)),
  servings integer check (servings is null or (servings >= 1 and servings <= 99)),
  version integer not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity numeric check (quantity is null or quantity >= 0),
  unit_code text references public.units(code),
  created_at timestamptz not null default now(),
  unique (recipe_id, position)
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  position integer not null check (position >= 0),
  instruction text not null check (char_length(trim(instruction)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (recipe_id, position)
);

create index recipes_household_updated_idx on public.recipes (household_id, updated_at desc);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "Active members read recipes"
on public.recipes for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members read recipe ingredients"
on public.recipe_ingredients for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members read recipe steps"
on public.recipe_steps for select to authenticated
using ((select private.is_active_household_member(household_id)));

-- Captura progresiva (UX-REC-001): una receta con solo nombre es válida y
-- recuperable. Los ingredientes y pasos se editan en Fase 4B con RPCs propios.
create function public.recipes_create_recipe(title text, dish_type text, total_minutes integer, servings integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; recipe_row public.recipes;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if title is null or char_length(trim(title)) not between 1 and 160
     or (dish_type is not null and dish_type not in ('breakfast', 'starter', 'main', 'side', 'dessert', 'drink', 'other'))
     or (total_minutes is not null and (total_minutes < 0 or total_minutes > 1440))
     or (servings is not null and (servings < 1 or servings > 99)) then
    raise exception 'Invalid recipe' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('recipes_create_recipe', jsonb_build_object('title', lower(trim(title)), 'dish_type', dish_type, 'total_minutes', total_minutes, 'servings', servings));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_create_recipe', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.recipes (household_id, title, dish_type, total_minutes, servings, created_by)
  values (household_id_value, trim(title), dish_type, total_minutes, servings, actor_id)
  returning * into recipe_row;
  result := jsonb_build_object('recipe_id', recipe_row.id, 'version', recipe_row.version);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_create_recipe', idempotency_key, result);
  return result;
end;
$$;

revoke all on public.recipes, public.recipe_ingredients, public.recipe_steps from anon, authenticated;
grant select on public.recipes, public.recipe_ingredients, public.recipe_steps to authenticated;
revoke all on function public.recipes_create_recipe(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.recipes_create_recipe(text, text, integer, integer, text) to authenticated;

alter publication supabase_realtime add table public.recipes;
