-- Audit log (NFR-SEC-06, ADM-07). Append-only: rows can be added only through
-- private.write_audit, and triggers reject UPDATE, DELETE and TRUNCATE for every role.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- No foreign keys: the history must survive anonymisation and deletion of the actor.
  actor_user_id uuid,
  actor_role text not null,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity text not null,
  entity_id uuid,
  business_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  request_id text
);

create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index audit_log_business_idx on public.audit_log (business_id, occurred_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.audit_log enable row level security;

create or replace function private.prevent_audit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function private.prevent_audit_changes();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.prevent_audit_changes();

-- Request context set by PostgREST for API calls. Null outside a request.
create or replace function private.request_header(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> lower(p_name);
$$;

create or replace function private.safe_inet(p_value text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(trim(p_value), '')::inet;
exception when others then
  return null;
end;
$$;

-- The role an actor holds for this entry: staff role, membership role, learner or system.
create or replace function private.actor_role_for(p_user_id uuid, p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.role::text from public.platform_staff s where s.user_id = p_user_id),
    (select m.role::text from public.memberships m
      where m.user_id = p_user_id and m.business_id = p_business_id and m.status = 'active'),
    case when p_user_id is null then 'system' else 'user' end
  );
$$;

create or replace function private.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_business_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_actor_user_id uuid default null,
  p_actor_role text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor_user_id, (select auth.uid()));
begin
  insert into public.audit_log (
    actor_user_id, actor_role, action, entity, entity_id, business_id, before, after, ip, user_agent, request_id
  ) values (
    v_actor,
    coalesce(p_actor_role, private.actor_role_for(v_actor, p_business_id)),
    p_action,
    p_entity,
    p_entity_id,
    p_business_id,
    p_before,
    p_after,
    coalesce(p_ip, private.safe_inet(split_part(private.request_header('x-forwarded-for'), ',', 1))),
    coalesce(p_user_agent, private.request_header('user-agent')),
    private.request_header('x-request-id')
  );
end;
$$;

-- Sign-in: every new Supabase Auth session, whatever the method. Fails open with a
-- warning so an audit problem can never lock people out.
create or replace function private.audit_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.write_audit(
      'auth.sign_in', 'session', new.id, null, null,
      jsonb_build_object('aal', new.aal::text),
      new.user_id, null, new.ip, new.user_agent
    );
  exception when others then
    raise warning 'audit_sign_in failed: %', sqlerrm;
  end;
  return new;
end;
$$;

create trigger on_auth_session_created
  after insert on auth.sessions
  for each row execute function private.audit_sign_in();

-- Role changes: membership created, changed (role, status or permissions) or removed.
create or replace function private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_after := jsonb_build_object('user_id', new.user_id, 'role', new.role, 'status', new.status, 'permissions', new.permissions);
    perform private.write_audit('membership.created', 'membership', new.id, new.business_id, null, v_after);
    return new;
  elsif tg_op = 'UPDATE' then
    if (new.role, new.status, new.permissions) is distinct from (old.role, old.status, old.permissions) then
      v_before := jsonb_build_object('role', old.role, 'status', old.status, 'permissions', old.permissions);
      v_after := jsonb_build_object('role', new.role, 'status', new.status, 'permissions', new.permissions);
      perform private.write_audit('membership.role_changed', 'membership', new.id, new.business_id, v_before, v_after);
    end if;
    return new;
  else
    v_before := jsonb_build_object('user_id', old.user_id, 'role', old.role, 'status', old.status);
    perform private.write_audit('membership.deleted', 'membership', old.id, old.business_id, v_before, null);
    return old;
  end if;
end;
$$;

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function private.audit_membership_change();

-- Staff role changes are sensitive too.
create or replace function private.audit_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.write_audit('staff.removed', 'platform_staff', old.user_id, null, jsonb_build_object('role', old.role), null);
    return old;
  end if;
  perform private.write_audit(
    case when tg_op = 'INSERT' then 'staff.added' else 'staff.role_changed' end,
    'platform_staff', new.user_id, null,
    case when tg_op = 'UPDATE' then jsonb_build_object('role', old.role) end,
    jsonb_build_object('role', new.role)
  );
  return new;
end;
$$;

create trigger platform_staff_audit
  after insert or update or delete on public.platform_staff
  for each row execute function private.audit_staff_change();

grant select on public.audit_log to authenticated;

create policy audit_log_select_staff on public.audit_log
  for select to authenticated
  using ((select private.auth_is_staff()));
