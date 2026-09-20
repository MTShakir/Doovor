-- Downloading the audit log is itself written to it (ADM-07, NFR-SEC-06, D-173).
--
-- The product owner asked for staff to be able to take the log away as a file for the days they
-- have chosen. Taking a copy of who did what is a sensitive act, so it leaves an entry of its own,
-- with what was asked for and how many entries went into the file.

-- The screen reads a page of fifty; a file takes up to five thousand, so one call brings them all
-- rather than a hundred round trips. The function's own guard sits above what a file asks for, so
-- the screen can still ask for one more than it shows and learn that there are more.
-- Reading the log is still not recorded (D-130); taking a copy of it is.
create or replace function public.admin_audit_log(
  p_actions text[] default null,
  p_person text default null,
  p_business text default null,
  p_from date default null,
  p_to date default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  occurred_at timestamptz,
  action text,
  actor_name text,
  actor_email text,
  actor_role text,
  entity text,
  about_name text,
  about_email text,
  business_name text,
  before jsonb,
  after jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person text := nullif(btrim(coalesce(p_person, '')), '');
  v_business text := nullif(btrim(coalesce(p_business, '')), '');
  v_person_pattern text;
  v_business_pattern text;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_person) > 100 or char_length(v_business) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "before"}';
  end if;
  v_person_pattern := private.contains_pattern(v_person);
  v_business_pattern := private.contains_pattern(v_business);

  return query
    select a.id,
           a.occurred_at,
           a.action,
           actor.full_name,
           actor.email,
           a.actor_role,
           a.entity,
           about.full_name,
           about.email,
           b.name,
           a.before,
           a.after
      from public.audit_log a
      left join public.users actor on actor.id = a.actor_user_id
      -- Whom it was about: the person, member of staff, member or instructor it names, or the learner
      -- a lesson, record or payment is for, while that row is still there.
      left join lateral (
        select case a.entity
                 when 'user' then a.entity_id
                 when 'platform_staff' then a.entity_id
                 when 'membership' then (select m.user_id from public.memberships m where m.id = a.entity_id)
                 when 'instructor_profile' then (select p.user_id from public.instructor_profiles p where p.id = a.entity_id)
                 when 'learner_relationship' then (select r.learner_id from public.learner_relationships r where r.id = a.entity_id)
                 when 'booking' then (select b.learner_id from public.bookings b where b.id = a.entity_id)
                 when 'booking_recurrence' then (select r.learner_id from public.booking_recurrences r where r.id = a.entity_id)
                 when 'lesson_record' then (select r.learner_id from public.lesson_records r where r.id = a.entity_id)
                 when 'payment' then (select p.learner_id from public.payments p where p.id = a.entity_id)
                 when 'refund' then (select r.learner_id from public.refunds r where r.id = a.entity_id)
                 when 'receipt' then (select r.learner_id from public.receipts r where r.id = a.entity_id)
                 when 'credit_lot' then (select l.learner_id from public.credit_lots l where l.id = a.entity_id)
               end as user_id
      ) as subject on true
      left join public.users about on about.id = subject.user_id
      left join public.businesses b on b.id = coalesce(a.business_id, case when a.entity = 'business' then a.entity_id end)
     where (p_actions is null or a.action = any (p_actions))
       and (p_from is null or a.occurred_at >= (p_from::timestamp at time zone 'Europe/London'))
       and (p_to is null or a.occurred_at < ((p_to + 1)::timestamp at time zone 'Europe/London'))
       and (
         v_person is null
         or actor.full_name ilike v_person_pattern
         or actor.email ilike v_person_pattern
         or about.full_name ilike v_person_pattern
         or about.email ilike v_person_pattern
       )
       and (v_business is null or b.name ilike v_business_pattern)
       and (p_before_at is null or (a.occurred_at, a.id) < (p_before_at, p_before_id))
     order by a.occurred_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 10000);
end;
$$;

create or replace function public.record_audit_export(p_filters jsonb, p_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  perform private.write_audit(
    'audit_log.exported',
    'user',
    v_user,
    null,
    null,
    jsonb_build_object('asked_for', coalesce(p_filters, '{}'::jsonb), 'entries', greatest(coalesce(p_count, 0), 0))
  );
end;
$$;

comment on function public.record_audit_export(jsonb, integer) is
  'Writes down that platform staff took a copy of the audit log (ADM-07, D-173).';

revoke all on function public.record_audit_export(jsonb, integer) from public, anon;
grant execute on function public.record_audit_export(jsonb, integer) to authenticated;
