-- El middleware corre en cada navegación protegida y antes hacía 2 viajes de
-- red a Supabase además de auth.getUser(): is_current_browser_trusted(...) y
-- luego un select a household_members/households para el onboarding. Esta
-- función fusiona ambas comprobaciones en una sola llamada RPC.
create function public.middleware_context(browser_token text)
returns table(trusted boolean, onboarding_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  browser_id uuid;
  is_trusted boolean := false;
  household_onboarding_status text;
begin
  if actor_id is null then
    return query select false, null::text;
    return;
  end if;

  if browser_token is not null and char_length(browser_token) >= 32 then
    select tb.id into browser_id
    from public.trusted_browsers tb
    where tb.user_id = actor_id
      and tb.token_hash = encode(extensions.digest(convert_to(browser_token, 'UTF8'), 'sha256'), 'hex')
      and tb.revoked_at is null
      and tb.expires_at > now()
    limit 1;

    if browser_id is not null then
      update public.trusted_browsers set last_seen_at = now() where id = browser_id;
      is_trusted := true;
    end if;
  end if;

  select h.onboarding_status into household_onboarding_status
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = actor_id and m.status = 'active'
  limit 1;

  return query select is_trusted, household_onboarding_status;
end;
$$;

revoke all on function public.middleware_context(text) from public, anon;
grant execute on function public.middleware_context(text) to authenticated;

-- Sustituida por middleware_context: ya no queda ningún llamador.
revoke all on function public.is_current_browser_trusted(text) from authenticated;
drop function public.is_current_browser_trusted(text);
