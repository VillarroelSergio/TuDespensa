-- Compra C1: lista activa persistente por hogar.
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null default 'active' check (status = 'active'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, status)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  food_id uuid not null,
  source text not null default 'manual' check (source in ('manual', 'pantry')),
  is_purchased boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopping_list_id, food_id),
  foreign key (household_id, food_id)
    references public.household_foods(household_id, id) on delete restrict
);

create index shopping_items_list_open_idx
  on public.shopping_items (shopping_list_id, is_purchased, created_at);

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

create policy "Active members read shopping lists"
on public.shopping_lists for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members read shopping items"
on public.shopping_items for select to authenticated
using ((select private.is_active_household_member(household_id)));

create function public.shopping_add_item(food_name text, item_source text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; food_id_value uuid; list_id_value uuid;
  item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if food_name is null or char_length(trim(food_name)) not between 1 and 120 or item_source not in ('manual', 'pantry') then
    raise exception 'Invalid shopping item' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('shopping_add_item', jsonb_build_object('food_name', lower(trim(food_name)), 'source', item_source));
  replay := private.pantry_claim(household_id_value, actor_id, 'shopping_add_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.household_foods (household_id, name) values (household_id_value, trim(food_name)) on conflict do nothing;
  select id into food_id_value from public.household_foods where household_id = household_id_value and lower(name) = lower(trim(food_name));
  insert into public.shopping_lists (household_id, status) values (household_id_value, 'active')
  on conflict (household_id, status) do update set updated_at = now() returning id into list_id_value;
  insert into public.shopping_items (household_id, shopping_list_id, food_id, source)
  values (household_id_value, list_id_value, food_id_value, item_source)
  on conflict (shopping_list_id, food_id) do update set is_purchased = false, source = excluded.source, version = public.shopping_items.version + 1, updated_at = now()
  returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(household_id_value, actor_id, 'shopping_add_item', idempotency_key, result);
  return result;
end;
$$;

create function public.shopping_toggle_item(item_id uuid, version integer, purchased boolean, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select * into item_row from public.shopping_items where id = item_id and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('shopping_toggle_item', jsonb_build_object('item_id', item_id, 'version', version, 'purchased', purchased));
  replay := private.pantry_claim(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  update public.shopping_items set is_purchased = purchased, version = item_row.version + 1, updated_at = now() where id = item_row.id returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, result);
  return result;
end;
$$;

revoke all on public.shopping_lists, public.shopping_items from anon, authenticated;
grant select on public.shopping_lists, public.shopping_items to authenticated;
revoke all on function public.shopping_add_item(text, text, text), public.shopping_toggle_item(uuid, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.shopping_add_item(text, text, text), public.shopping_toggle_item(uuid, integer, boolean, text) to authenticated;

alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_items;
