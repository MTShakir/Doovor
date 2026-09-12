-- Onboarding progress (AUTH-04, M1-02).
--
-- Five steps, each one screen. Everything except the name can be skipped, so progress is
-- recorded on its own rather than guessed from which fields are filled in. `onboarding_step`
-- is the step to show next; `onboarding_completed_at` is set when they reach the end.

alter table public.instructor_profiles
  add column onboarding_step smallint not null default 1 check (onboarding_step between 1 and 5),
  add column onboarding_completed_at timestamptz;

grant update (onboarding_step, onboarding_completed_at) on public.instructor_profiles to authenticated;
