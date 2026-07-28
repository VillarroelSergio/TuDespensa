-- Compra: permite quitar un producto de la lista (no solo marcarlo como
-- comprado). A diferencia de la despensa, aquí no hay estado "terminado" que
-- conservar: se borra la fila, igual que shopping_toggle_item usa versión
-- para detectar cambios concurrentes.
create function public.shopping_remove_item(item_id uuid, version integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select * into item_row from public.shopping_items where id = item_id and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('shopping_remove_item', jsonb_build_object('item_id', item_id, 'version', version));
  replay := private.pantry_claim(item_row.household_id, actor_id, 'shopping_remove_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  delete from public.shopping_items where id = item_row.id;
  result := jsonb_build_object('item_id', item_row.id, 'removed', true);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'shopping_remove_item', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.shopping_remove_item(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.shopping_remove_item(uuid, integer, text) to authenticated;
