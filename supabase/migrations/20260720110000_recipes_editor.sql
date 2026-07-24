-- Fase 4B: editor y detalle de Recetas. Guardado estructurado (ingredientes y
-- pasos) con control optimista de versión, y captura de enlace como receta
-- `pending` para revisión humana. Sin OCR ni importación automática (fuera de 4B).

alter table public.recipes
  add column status text not null default 'ready' check (status in ('pending', 'ready')),
  add column source_url text check (source_url is null or source_url ~ '^https?://' and char_length(source_url) <= 2048);

-- Guarda la receta completa en una transacción: metadatos + ingredientes + pasos.
-- Reemplaza las colecciones (borra e inserta) porque el editor envía el conjunto
-- visible; así el guardado es idempotente y no deja filas huérfanas de una edición
-- previa. Guardar una receta la promueve a `ready` (ha pasado por revisión humana).
create function public.recipes_save_recipe(
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
  replay := private.pantry_claim(recipe_row.household_id, actor_id, 'recipes_save_recipe', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if recipe_row.version <> expected_version then
    raise exception 'Recipe was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;

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

-- Captura un enlace como receta `pending` para revisarla después (sin lectura
-- automática). El título definitivo lo pone la persona al revisar en R2.
create function public.recipes_capture_link(source_url text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; recipe_row public.recipes;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if source_url is null or source_url !~ '^https?://' or char_length(source_url) > 2048 then
    raise exception 'Invalid link' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('recipes_capture_link', jsonb_build_object('source_url', source_url));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_capture_link', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.recipes (household_id, title, status, source_url, created_by)
  values (household_id_value, 'Receta pendiente', 'pending', source_url, actor_id)
  returning * into recipe_row;
  result := jsonb_build_object('recipe_id', recipe_row.id, 'version', recipe_row.version);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_capture_link', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.recipes_save_recipe(uuid, text, text, integer, integer, text, jsonb, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.recipes_save_recipe(uuid, text, text, integer, integer, text, jsonb, jsonb, integer, text) to authenticated;
revoke all on function public.recipes_capture_link(text, text) from public, anon, authenticated;
grant execute on function public.recipes_capture_link(text, text) to authenticated;
