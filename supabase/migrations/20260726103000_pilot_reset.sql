-- Reinicio explícito del piloto. Solo la persona propietaria puede borrar el
-- hogar completo y las cuentas activas que pertenecen a él. La eliminación de
-- auth.users se realiza después, exclusivamente desde una server action con la
-- clave de servicio; esta función solo elimina los datos de aplicación.

create or replace function private.reject_pantry_movement_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('midespensa.allow_pilot_reset', true) = 'on' then
    return old;
  end if;

  raise exception 'Pantry movements are immutable'
    using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create or replace function public.reset_pilot_household(confirmation text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  member_ids uuid[];
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = 'insufficient_privilege';
  end if;

  if confirmation <> 'BORRAR' then
    raise exception 'Confirmation is required'
      using errcode = 'invalid_parameter_value';
  end if;

  select member.household_id
  into household_id_value
  from public.household_members as member
  where member.user_id = actor_id
    and member.status = 'active'
    and member.role = 'owner'
  for update;

  if household_id_value is null then
    raise exception 'Only the household owner can reset the pilot'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bloquea altas/bajas concurrentes de integrantes mientras se construye la
  -- lista de cuentas que se eliminarán.
  perform 1
  from public.households
  where id = household_id_value
  for update;

  select array_agg(member.user_id order by member.user_id)
  into member_ids
  from public.household_members as member
  where member.household_id = household_id_value
    and member.status = 'active';

  -- El único trigger que impide borrar en cascada protege el historial de
  -- despensa. Se habilita únicamente dentro de esta transacción privilegiada.
  perform set_config('midespensa.allow_pilot_reset', 'on', true);
  delete from public.pantry_movements
  where household_id = household_id_value;

  delete from public.households
  where id = household_id_value;

  return coalesce(member_ids, '{}'::uuid[]);
end;
$$;

revoke all on function public.reset_pilot_household(text) from public;
grant execute on function public.reset_pilot_household(text) to authenticated;
