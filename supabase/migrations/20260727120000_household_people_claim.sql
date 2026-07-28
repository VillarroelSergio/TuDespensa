-- Identidad de hogar: cada cuenta puede "reclamar" cuál de los nombres dados
-- de alta en el onboarding es ella, o añadir el suyo si no está en la lista.
-- Así "Mi hogar" puede mostrar el nombre real de cada cuenta en vez de solo
-- "Tú" / "Integrante del hogar".

alter table public.household_people
  add column if not exists linked_user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists household_people_linked_user_idx
  on public.household_people (linked_user_id) where linked_user_id is not null;

create function public.claim_household_person(person_id uuid, person_name text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  normalized_name text;
  person_row public.household_people;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  if (person_id is null) = (person_name is null) then
    raise exception 'Provide exactly one of person_id or person_name'
      using errcode = 'invalid_parameter_value';
  end if;

  request_hash_value := private.pantry_request_hash(
    'claim_household_person', jsonb_build_object('person_id', person_id, 'person_name', person_name));
  replay := private.pantry_claim(household_id_value, actor_id, 'claim_household_person', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  if person_id is not null then
    select * into person_row from public.household_people
    where id = person_id and household_id = household_id_value and linked_user_id is null
    for update;
    if person_row.id is null then
      raise exception 'That name is not available to claim' using errcode = 'serialization_failure';
    end if;
    update public.household_people set linked_user_id = actor_id where id = person_row.id
    returning * into person_row;
  else
    normalized_name := regexp_replace(trim(person_name), '\s+', ' ', 'g');
    if char_length(normalized_name) not between 1 and 80 then
      raise exception 'Invalid person name' using errcode = 'invalid_parameter_value';
    end if;

    -- Si el nombre escrito coincide con uno ya dado de alta (sin reclamar),
    -- se reclama ese en vez de crear un duplicado.
    select * into person_row from public.household_people
    where household_id = household_id_value and lower(name) = lower(normalized_name)
    for update;

    if person_row.id is not null then
      if person_row.linked_user_id is not null then
        raise exception 'That name is already claimed' using errcode = 'unique_violation';
      end if;
      update public.household_people set linked_user_id = actor_id where id = person_row.id
      returning * into person_row;
    else
      insert into public.household_people (household_id, name, linked_user_id)
      values (household_id_value, normalized_name, actor_id)
      returning * into person_row;
    end if;
  end if;

  result := jsonb_build_object('person_id', person_row.id, 'name', person_row.name);
  perform private.pantry_store_result(household_id_value, actor_id, 'claim_household_person', idempotency_key, result);
  return result;
exception
  when unique_violation then
    if sqlerrm like '%household_people_linked_user_idx%' then
      raise exception 'You already claimed a name in this household'
        using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

revoke all on function public.claim_household_person(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_household_person(uuid, text, text) to authenticated;
