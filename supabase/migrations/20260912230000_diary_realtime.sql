-- A change to the diary reaches whoever is looking at it (DIA-03, M1-23).
--
-- Broadcast from the database rather than letting clients listen to table changes: the
-- message carries an instructor id and nothing else, the topic is per instructor, and who
-- may join a topic is decided by a policy here rather than by what a client asks for.

create or replace function private.diary_topic(p_instructor_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'diary:' || p_instructor_id::text;
$$;

create or replace function private.bookings_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instructor uuid := coalesce(new.instructor_id, old.instructor_id);
begin
  -- Identifiers only: a message says something changed, not what it was.
  perform realtime.send(
    jsonb_build_object('instructor_profile_id', v_instructor, 'booking_id', coalesce(new.id, old.id)),
    'changed',
    private.diary_topic(v_instructor),
    true
  );
  -- A lesson moved between instructors is news for both diaries.
  if tg_op = 'UPDATE' and new.instructor_id is distinct from old.instructor_id then
    perform realtime.send(
      jsonb_build_object('instructor_profile_id', old.instructor_id, 'booking_id', old.id),
      'changed',
      private.diary_topic(old.instructor_id),
      true
    );
  end if;
  return null;
end;
$$;

create trigger bookings_broadcast
  after insert or update or delete on public.bookings
  for each row execute function private.bookings_broadcast();

-- Who may listen. A diary topic belongs to one instructor: they can read it, and so can
-- anyone who manages bookings for the Business they teach for (DIA-09).
create policy diary_broadcast_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1
        from public.instructor_profiles p
       where private.diary_topic(p.id) = (select realtime.topic())
         and (
           p.id in (select private.auth_instructor_ids())
           or private.auth_has_permission(p.business_id, 'manage_bookings')
         )
    )
  );
