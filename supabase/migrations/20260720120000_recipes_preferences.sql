-- Fase 4C: preferencias, taxonomía de categorías y dataset inicial versionado.
-- Favorito y puntuación por persona; categorías por dimensión para filtros y
-- futuras sugerencias; carga de recetas base idempotente y no destructiva.

-- Procedencia para la carga versionada. seed_key hace idempotente el alta; una
-- recarga del dataset nunca sobrescribe una receta ya editada por el hogar.
-- ponytail: sin columnas de licencia de terceros hasta que se cargue un dataset
-- externo; el seed inicial es contenido original del proyecto (attribution basta).
alter table public.recipes
  add column origin text not null default 'household' check (origin in ('household', 'seed')),
  add column seed_key text,
  add column seed_version integer,
  add column attribution text,
  add constraint recipes_seed_key_household_key unique (household_id, seed_key);

create table public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  dimension text not null check (dimension in ('dish_type', 'main_ingredient', 'technique', 'time', 'season', 'mediterranean')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index recipe_categories_household_dimension_name_idx on public.recipe_categories (household_id, dimension, lower(name));

create table public.recipe_category_assignments (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  category_id uuid not null references public.recipe_categories(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, category_id)
);

create table public.recipe_preferences (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  is_favorite boolean not null default false,
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

alter table public.recipe_categories enable row level security;
alter table public.recipe_category_assignments enable row level security;
alter table public.recipe_preferences enable row level security;

create policy "Active members read recipe categories"
on public.recipe_categories for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members read recipe category assignments"
on public.recipe_category_assignments for select to authenticated
using ((select private.is_active_household_member(household_id)));

-- Las preferencias son por persona pero se agregan para el menú compartido, así
-- que el hogar puede leer todas; escribir solo las propias (vía RPC).
create policy "Active members read recipe preferences"
on public.recipe_preferences for select to authenticated
using ((select private.is_active_household_member(household_id)));

-- Favorito y puntuación de la persona autenticada. Upsert idempotente por
-- (recipe_id, user_id); la última intención gana, sin control de versión.
create function public.recipes_set_preference(recipe_id_value uuid, is_favorite boolean, rating integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid(); household_id_value uuid; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if rating is not null and (rating < 1 or rating > 5) then raise exception 'Invalid rating' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.recipes
  where id = recipe_id_value and private.is_active_household_member(household_id, actor_id);
  if household_id_value is null then raise exception 'Recipe is unavailable or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('recipes_set_preference', jsonb_build_object('recipe_id', recipe_id_value, 'is_favorite', is_favorite, 'rating', rating));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_set_preference', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.recipe_preferences (recipe_id, household_id, user_id, is_favorite, rating, updated_at)
  values (recipe_id_value, household_id_value, actor_id, coalesce(is_favorite, false), rating, now())
  on conflict (recipe_id, user_id) do update set is_favorite = excluded.is_favorite, rating = excluded.rating, updated_at = now();
  result := jsonb_build_object('recipe_id', recipe_id_value, 'is_favorite', coalesce(is_favorite, false), 'rating', rating);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_set_preference', idempotency_key, result);
  return result;
end;
$$;

-- Reemplaza las categorías de una receta. Crea las categorías del hogar que no
-- existan (por dimensión+nombre) y sustituye las asignaciones. Idempotente por
-- contenido; no necesita versión porque la asignación es un conjunto.
create function public.recipes_set_categories(recipe_id_value uuid, categories jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid(); household_id_value uuid; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(categories, '[]'::jsonb)) c
             where (c->>'dimension') not in ('dish_type', 'main_ingredient', 'technique', 'time', 'season', 'mediterranean')
                or char_length(trim(coalesce(c->>'name', ''))) not between 1 and 60) then
    raise exception 'Invalid category' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.recipes
  where id = recipe_id_value and private.is_active_household_member(household_id, actor_id);
  if household_id_value is null then raise exception 'Recipe is unavailable or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('recipes_set_categories', jsonb_build_object('recipe_id', recipe_id_value, 'categories', coalesce(categories, '[]'::jsonb)));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_set_categories', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  insert into public.recipe_categories (household_id, dimension, name)
  select household_id_value, c->>'dimension', trim(c->>'name')
  from jsonb_array_elements(coalesce(categories, '[]'::jsonb)) c
  on conflict (household_id, dimension, lower(name)) do nothing;

  delete from public.recipe_category_assignments where recipe_id = recipe_id_value;
  insert into public.recipe_category_assignments (recipe_id, category_id, household_id)
  select distinct recipe_id_value, cat.id, household_id_value
  from jsonb_array_elements(coalesce(categories, '[]'::jsonb)) c
  join public.recipe_categories cat
    on cat.household_id = household_id_value and cat.dimension = c->>'dimension' and lower(cat.name) = lower(trim(c->>'name'));

  result := jsonb_build_object('recipe_id', recipe_id_value);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_set_categories', idempotency_key, result);
  return result;
end;
$$;

-- Inserta una receta base si su seed_key no existe ya en el hogar (idempotente,
-- no destructivo). Reutilizada por el cargador público del dataset.
create function private.recipes_seed_one(
  household_id_value uuid, actor_id uuid, seed_key_value text, seed_version_value integer,
  title text, dish_type text, total_minutes integer, servings integer,
  ingredients jsonb, steps jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare new_recipe_id uuid; category_id_value uuid;
begin
  if exists (select 1 from public.recipes where household_id = household_id_value and seed_key = seed_key_value) then
    return false;
  end if;
  insert into public.recipes (household_id, title, dish_type, total_minutes, servings, created_by, origin, seed_key, seed_version, attribution)
  values (household_id_value, title, dish_type, total_minutes, servings, actor_id, 'seed', seed_key_value, seed_version_value, 'Recetas base del proyecto MiDespensa')
  returning id into new_recipe_id;
  insert into public.recipe_ingredients (recipe_id, household_id, position, name, quantity, unit_code)
  select new_recipe_id, household_id_value, (e.ord - 1)::int, trim(e.value->>'name'), nullif(e.value->>'quantity', '')::numeric, nullif(e.value->>'unit_code', '')
  from jsonb_array_elements(ingredients) with ordinality as e(value, ord);
  insert into public.recipe_steps (recipe_id, household_id, position, instruction)
  select new_recipe_id, household_id_value, (s.ord - 1)::int, trim(s.value)
  from jsonb_array_elements_text(steps) with ordinality as s(value, ord);
  insert into public.recipe_categories (household_id, dimension, name) values (household_id_value, 'mediterranean', 'Mediterránea')
  on conflict (household_id, dimension, lower(name)) do nothing;
  select id into category_id_value from public.recipe_categories where household_id = household_id_value and dimension = 'mediterranean' and lower(name) = 'mediterránea';
  insert into public.recipe_category_assignments (recipe_id, category_id, household_id) values (new_recipe_id, category_id_value, household_id_value)
  on conflict do nothing;
  return true;
end;
$$;

-- Carga el dataset inicial (contenido original del proyecto) en el hogar activo.
create function public.recipes_load_seed(idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; request_hash_value text; replay jsonb; result jsonb; loaded integer := 0;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('recipes_load_seed', jsonb_build_object('seed_version', 1));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_load_seed', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  if private.recipes_seed_one(household_id_value, actor_id, 'gazpacho-andaluz', 1, 'Gazpacho andaluz', 'starter', 15, 4,
    '[{"name":"Tomate maduro","quantity":1,"unit_code":"kg"},{"name":"Pepino","quantity":1,"unit_code":"unit"},{"name":"Pimiento verde","quantity":1,"unit_code":"unit"},{"name":"Aceite de oliva","quantity":50,"unit_code":"ml"},{"name":"Vinagre","quantity":15,"unit_code":"ml"},{"name":"Sal"}]'::jsonb,
    '["Trocea las verduras y ponlas en la batidora.","Añade aceite, vinagre y sal.","Tritura hasta que quede fino y enfría antes de servir."]'::jsonb) then loaded := loaded + 1; end if;
  if private.recipes_seed_one(household_id_value, actor_id, 'tortilla-de-patatas', 1, 'Tortilla de patatas', 'main', 40, 4,
    '[{"name":"Patata","quantity":600,"unit_code":"g"},{"name":"Huevo","quantity":5,"unit_code":"unit"},{"name":"Cebolla","quantity":1,"unit_code":"unit"},{"name":"Aceite de oliva","quantity":200,"unit_code":"ml"},{"name":"Sal"}]'::jsonb,
    '["Pela y corta las patatas en láminas finas.","Fríelas a fuego suave con la cebolla hasta que estén tiernas.","Bate los huevos, mezcla con la patata y cuaja la tortilla por ambos lados."]'::jsonb) then loaded := loaded + 1; end if;
  if private.recipes_seed_one(household_id_value, actor_id, 'lentejas-guisadas', 1, 'Lentejas guisadas', 'main', 60, 4,
    '[{"name":"Lenteja pardina","quantity":400,"unit_code":"g"},{"name":"Zanahoria","quantity":2,"unit_code":"unit"},{"name":"Cebolla","quantity":1,"unit_code":"unit"},{"name":"Pimentón","quantity":5,"unit_code":"g"},{"name":"Aceite de oliva","quantity":30,"unit_code":"ml"}]'::jsonb,
    '["Sofríe la cebolla y la zanahoria en aceite.","Añade el pimentón y las lentejas y cubre con agua.","Cuece a fuego lento hasta que las lentejas estén tiernas."]'::jsonb) then loaded := loaded + 1; end if;

  result := jsonb_build_object('loaded', loaded);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_load_seed', idempotency_key, result);
  return result;
end;
$$;

revoke all on public.recipe_categories, public.recipe_category_assignments, public.recipe_preferences from anon, authenticated;
grant select on public.recipe_categories, public.recipe_category_assignments, public.recipe_preferences to authenticated;
revoke all on function public.recipes_set_preference(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.recipes_set_preference(uuid, boolean, integer, text) to authenticated;
revoke all on function public.recipes_set_categories(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.recipes_set_categories(uuid, jsonb, text) to authenticated;
revoke all on function public.recipes_load_seed(text) from public, anon, authenticated;
grant execute on function public.recipes_load_seed(text) to authenticated;

alter publication supabase_realtime add table public.recipe_preferences;
