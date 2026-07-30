-- Auditoría 2026-07-29. Tres correcciones independientes:
--
-- 1) recipes_save_recipe reclamaba la clave de idempotencia ANTES de comprobar
--    la versión optimista. Es el mismo patrón que provocó la tormenta de
--    rollbacks documentada en 20260728163451: una petición con versión obsoleta
--    insertaba la clave, fallaba la comprobación y deshacía toda la
--    transacción, generando WAL y contención sin avanzar. Se reordena a
--    peek -> validar versión -> claim, igual que las RPC ya corregidas.
--    plan_cook_meal y shopping_confirm_purchase siguen con el patrón antiguo:
--    validan y mutan dentro del mismo bucle, así que reordenarlas exige
--    reestructurar la lógica y se aborda aparte.
--
-- 2) private.recipes_seed_one no revocaba EXECUTE de public. Al crear una
--    función, PostgreSQL concede EXECUTE a PUBLIC por defecto, y esta acepta
--    household_id/actor_id por parámetro sin comprobar quién llama. Hoy no es
--    alcanzable (el esquema private no se expone en api.schemas), pero era la
--    única función private sin revoke y bastaría exponer el esquema para
--    convertirla en una vía de inyectar recetas en cualquier hogar.
--
-- 3) resolve_catalog_food conservaba el umbral de similitud 0.4 que
--    20260729130000 ya corrigió a 0.6 en resolve_household_food: "aceite de
--    oliva" seguía pudiendo resolverse contra "aceite de girasol" al buscar en
--    el catálogo.

create or replace function public.recipes_save_recipe(
  recipe_id_value uuid,
  title text,
  dish_type text,
  total_minutes integer,
  servings integer,
  source_url text,
  ingredients jsonb,
  steps jsonb,
  expected_version integer,
  idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid(); recipe_row public.recipes;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if title is null or char_length(trim(title)) not between 1 and 160
     or (dish_type is not null and dish_type not in ('breakfast', 'starter', 'main', 'side', 'dessert', 'drink', 'other'))
     or (total_minutes is not null and (total_minutes < 0 or total_minutes > 1440))
     or (servings is not null and (servings < 1 or servings > 99))
     or (source_url is not null and (source_url !~ '^https?://' or char_length(source_url) > 2048))
     or expected_version is null or expected_version < 1 then
    raise exception 'Invalid recipe' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(ingredients, '[]'::jsonb)) e
             where char_length(trim(coalesce(e->>'name', ''))) not between 1 and 120
                or (nullif(e->>'quantity', '') is not null and (e->>'quantity')::numeric < 0)
                or (nullif(e->>'unit_code', '') is not null and not exists (select 1 from public.units u where u.code = e->>'unit_code'))) then
    raise exception 'Invalid ingredient' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(steps, '[]'::jsonb)) s
             where char_length(trim(s)) not between 1 and 2000) then
    raise exception 'Invalid step' using errcode = 'invalid_parameter_value';
  end if;

  select * into recipe_row from public.recipes
  where id = recipe_id_value and private.is_active_household_member(household_id, actor_id)
  for update;
  if recipe_row.id is null then
    raise exception 'Recipe was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;

  request_hash_value := private.pantry_request_hash('recipes_save_recipe',
    jsonb_build_object('recipe_id', recipe_id_value, 'version', expected_version, 'title', lower(trim(title)),
      'dish_type', dish_type, 'total_minutes', total_minutes, 'servings', servings, 'source_url', source_url,
      'ingredients', coalesce(ingredients, '[]'::jsonb), 'steps', coalesce(steps, '[]'::jsonb)));
  replay := private.pantry_peek_idempotent(recipe_row.household_id, actor_id, 'recipes_save_recipe', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if recipe_row.version <> expected_version then
    raise exception 'Recipe was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;
  replay := private.pantry_claim(recipe_row.household_id, actor_id, 'recipes_save_recipe', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  update public.recipes
  set title = trim(title), dish_type = dish_type, total_minutes = total_minutes, servings = servings,
      source_url = source_url, status = 'ready', version = version + 1, updated_at = now()
  where id = recipe_id_value;

  delete from public.recipe_ingredients where recipe_id = recipe_id_value;
  insert into public.recipe_ingredients (recipe_id, household_id, position, name, quantity, unit_code)
  select recipe_id_value, recipe_row.household_id, (e.ord - 1)::int, trim(e.value->>'name'),
         nullif(e.value->>'quantity', '')::numeric, nullif(e.value->>'unit_code', '')
  from jsonb_array_elements(coalesce(ingredients, '[]'::jsonb)) with ordinality as e(value, ord);

  delete from public.recipe_steps where recipe_id = recipe_id_value;
  insert into public.recipe_steps (recipe_id, household_id, position, instruction)
  select recipe_id_value, recipe_row.household_id, (s.ord - 1)::int, trim(s.value)
  from jsonb_array_elements_text(coalesce(steps, '[]'::jsonb)) with ordinality as s(value, ord);

  result := jsonb_build_object('recipe_id', recipe_id_value, 'version', recipe_row.version + 1);
  perform private.pantry_store_result(recipe_row.household_id, actor_id, 'recipes_save_recipe', idempotency_key, result);
  return result;
end;
$$;

revoke all on function private.recipes_seed_one(uuid, uuid, text, integer, text, text, integer, integer, jsonb, jsonb) from public;

create or replace function private.resolve_catalog_food(food_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(trim(food_name));
  catalog_id uuid;
begin
  select id into catalog_id from public.catalog_foods
  where lower(canonical_name) = normalized;
  if catalog_id is not null then return catalog_id; end if;

  select catalog_food_id into catalog_id from public.food_aliases
  where lower(alias) = normalized;
  if catalog_id is not null then return catalog_id; end if;

  select id into catalog_id from public.catalog_foods
  where extensions.similarity(lower(canonical_name), normalized) > 0.6
  order by extensions.similarity(lower(canonical_name), normalized) desc
  limit 1;
  if catalog_id is not null then return catalog_id; end if;

  select catalog_food_id into catalog_id from public.food_aliases
  where extensions.similarity(lower(alias), normalized) > 0.6
  order by extensions.similarity(lower(alias), normalized) desc
  limit 1;
  return catalog_id;
end;
$$;
