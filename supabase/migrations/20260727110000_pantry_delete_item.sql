-- Despensa: además de "Se terminó", ahora se puede eliminar un producto
-- directamente en cualquier estado (no solo el ya terminado). Sustituye a
-- pantry_remove_finished_item, que solo lo permitía si presence = false; el
-- nombre y la restricción ya no describen lo que hace falta.

drop function if exists public.pantry_remove_finished_item(uuid, integer, text);

create function public.pantry_delete_item(item_id uuid, version integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  item_row public.pantry_items;
  hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select * into item_row from public.pantry_items
  where id = item_id and private.is_active_household_member(household_id, actor_id)
  for update;
  if item_row.id is null or item_row.removed_at is not null then raise exception 'Pantry item is unavailable' using errcode = 'serialization_failure'; end if;
  if item_row.version <> version then raise exception 'Pantry item changed' using errcode = 'serialization_failure'; end if;
  hash_value := private.pantry_request_hash('pantry_delete_item', jsonb_build_object('item_id', item_id, 'version', version));
  replay := private.pantry_claim(item_row.household_id, actor_id, 'pantry_delete_item', idempotency_key, hash_value);
  if replay is not null then return replay; end if;
  update public.pantry_items
  set removed_at = now(), version = item_row.version + 1, updated_at = now()
  where id = item_row.id
  returning * into item_row;
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, item_snapshot)
  values (item_row.household_id, item_row.id, 'removal', actor_id, jsonb_build_object('removed_at', item_row.removed_at, 'version', item_row.version));
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'removed', true);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'pantry_delete_item', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.pantry_delete_item(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.pantry_delete_item(uuid, integer, text) to authenticated;
