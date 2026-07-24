-- return_target is UI navigation state without domain invariants; column-level
-- grant follows the households.name precedent instead of adding an RPC.
-- RLS "Active members manage onboarding progress" (FOR ALL) already scopes it.
grant update (return_target) on public.onboarding_progress to authenticated;
