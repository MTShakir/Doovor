-- Transactional outbox for background jobs (M1-01, D-017, PRD 14.5).
--
-- RPCs never call the job runner directly. They record the event here in the same
-- transaction as the change it describes, and a dispatcher sends it afterwards. If the app
-- stops between the commit and the send, the event is still waiting.

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  -- Identifiers only, never personal data: events leave the United Kingdom (ARCHITECTURE 9).
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

alter table public.outbox_events enable row level security;

-- Deliberately reachable by nobody through the API. Jobs use the system functions below,
-- which run as the owner. The policy is explicit so the intent is readable, and so the
-- structural test that every table carries a policy still passes.
create policy outbox_events_no_api_access on public.outbox_events
  for all to authenticated, anon using (false) with check (false);

create index outbox_events_pending_idx on public.outbox_events (created_at) where sent_at is null;

-- Called from inside an RPC, in the same transaction as the write it describes.
create or replace function private.enqueue_event(p_name text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.outbox_events (name, payload) values (p_name, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- The dispatcher runs as the service role: claim, send, then mark.
create or replace function public.system_claim_outbox_events(p_limit integer default 50)
returns setof public.outbox_events
language sql
security definer
set search_path = ''
as $$
  with due as (
    select id from public.outbox_events
     where sent_at is null
       and attempts < 10
     order by created_at
     limit greatest(coalesce(p_limit, 50), 1)
     for update skip locked
  )
  update public.outbox_events e
     set attempts = e.attempts + 1
    from due
   where e.id = due.id
  returning e.*;
$$;

create or replace function public.system_mark_outbox_sent(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.outbox_events set sent_at = now(), last_error = null
     where id = any(coalesce(p_ids, '{}'::uuid[])) and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

create or replace function public.system_mark_outbox_failed(p_ids uuid[], p_error text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.outbox_events set last_error = left(coalesce(p_error, 'unknown'), 500)
     where id = any(coalesce(p_ids, '{}'::uuid[])) and sent_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

revoke all on function public.system_claim_outbox_events(integer) from public, anon, authenticated;
revoke all on function public.system_mark_outbox_sent(uuid[]) from public, anon, authenticated;
revoke all on function public.system_mark_outbox_failed(uuid[], text) from public, anon, authenticated;
grant execute on function public.system_claim_outbox_events(integer) to service_role;
grant execute on function public.system_mark_outbox_sent(uuid[]) to service_role;
grant execute on function public.system_mark_outbox_failed(uuid[], text) to service_role;
