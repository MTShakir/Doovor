-- A fixed-window rate limiter in Postgres (NFR-SEC-03, D-008, M2-02).
--
-- Supabase Auth already limits sign-in, codes and emails. This is for everything we write
-- ourselves that a stranger can reach: invitations, self-booking, messages. It counts hits per
-- key per window and says whether this one is allowed, in one statement, so two requests
-- arriving together cannot both see a count below the limit.

create table public.rate_limit_buckets (
  /** What is being limited and for whom, for example "invite:<user id>". */
  key text not null,
  /** The window this count belongs to, truncated to the window size. */
  window_started_at timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_started_at)
);

alter table public.rate_limit_buckets enable row level security;

-- Nobody reads or writes this through the API: the function below is the only way in.
create policy rate_limit_buckets_no_api_access on public.rate_limit_buckets
  for all to authenticated, anon using (false) with check (false);

create index rate_limit_buckets_window_idx on public.rate_limit_buckets (window_started_at);

/**
 * Counts one hit and says whether it is allowed. The insert and the count are the same
 * statement, so a burst arriving at once is counted once each rather than all seeing zero.
 */
create or replace function private.rate_limit_hit(p_key text, p_window interval, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "key"}';
  end if;
  if p_max is null or p_max < 1 or p_window is null or p_window <= interval '0' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "limit"}';
  end if;

  -- Fixed windows: every key in the same window shares a start, so the row is found, not made.
  v_window_start := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));

  insert into public.rate_limit_buckets (key, window_started_at, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_started_at) do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

/**
 * What the app calls. The key is built here from an action and a subject, so a caller cannot
 * spend someone else's allowance by naming their key.
 */
create or replace function public.system_rate_limit_hit(
  p_action text,
  p_who text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.rate_limit_hit(
    p_action || ':' || p_who,
    make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1)),
    p_max
  );
$$;

/** Old windows are of no use to anyone. Called by the daily maintenance job. */
create or replace function public.system_clear_rate_limits(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with cleared as (
    delete from public.rate_limit_buckets where window_started_at < now() - p_older_than returning 1
  )
  select count(*)::int into v_count from cleared;
  return v_count;
end;
$$;

revoke all on function private.rate_limit_hit(text, interval, integer) from public, anon, authenticated;
revoke all on function public.system_rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.system_rate_limit_hit(text, text, integer, integer) to service_role;
revoke all on function public.system_clear_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.system_clear_rate_limits(interval) to service_role;
