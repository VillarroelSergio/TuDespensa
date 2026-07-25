-- Browser trust is deliberately separate from Supabase Auth sessions. The value
-- stored in the cookie is an opaque random token; only its SHA-256 hash reaches
-- PostgreSQL. This is a UX gate for the application, not Supabase AAL2 MFA.
create table public.trusted_browsers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index trusted_browsers_active_user_idx
  on public.trusted_browsers (user_id, expires_at)
  where revoked_at is null;

alter table public.trusted_browsers enable row level security;
revoke all on table public.trusted_browsers from anon, authenticated;

create function public.is_current_browser_trusted(browser_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  browser_id uuid;
begin
  if actor_id is null or browser_token is null or char_length(browser_token) < 32 then
    return false;
  end if;

  select id into browser_id
  from public.trusted_browsers
  where user_id = actor_id
    and token_hash = encode(extensions.digest(convert_to(browser_token, 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if browser_id is null then return false; end if;
  update public.trusted_browsers set last_seen_at = now() where id = browser_id;
  return true;
end;
$$;

revoke all on function public.is_current_browser_trusted(text) from public, anon;
grant execute on function public.is_current_browser_trusted(text) to authenticated;

-- MiDespensa is intentionally a single household. This prevents a newly
-- registered but uninvited identity from using onboarding to create a second
-- household; invitations remain the only route to the existing household.
create function private.reject_second_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.households where id <> new.id) then
    raise exception 'This private application already has its household'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger households_singleton_guard
before insert on public.households
for each row execute function private.reject_second_household();

revoke all on function private.reject_second_household() from public, anon, authenticated;
