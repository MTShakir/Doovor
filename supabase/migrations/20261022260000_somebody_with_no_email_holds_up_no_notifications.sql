-- Somebody with no email address holds up nobody's notifications (NTF-01, NTF-03, D-373).
--
-- A learner an instructor adds by hand with only a mobile number has no email address (D-068).
-- The claim handed the sender that address as null, the sender read it as text, and the run
-- stopped at that row: everything claimed with it stayed unsent for its ten minutes (D-367), and
-- what came before it in the run, already emailed or pushed, was never marked sent, so the next
-- run sent it again. Found in the A to Z round on 22 Oct 2026: an instructor who had booked a
-- learner added by mobile was never told about a lesson moved or cancelled. The claim now hands
-- over an empty address, as it already did a missing mobile, which the sender reads as "no
-- email to send"; and the sender keeps one row's trouble to that row.

create or replace function public.system_claim_notifications(p_limit integer default 25)
returns table (
  id uuid,
  user_id uuid,
  email text,
  phone text,
  full_name text,
  business_id uuid,
  business_plan text,
  kind text,
  category public.notification_category,
  title text,
  body text,
  link text,
  channels public.notification_channel[],
  dedupe_key text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select n.id from public.notifications n
     where n.sent_at is null
       and n.attempts < 5
       -- The inbox needs no sending: it is the row itself.
       and n.channels <> '{in_app}'::public.notification_channel[]
       -- Not while another run is sending it, unless that run has plainly died (D-367).
       and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
     order by n.created_at
     limit greatest(coalesce(p_limit, 25), 1)
     for update skip locked
  ),
  claimed as (
    update public.notifications n
       set attempts = n.attempts + 1,
           claimed_at = now()
      from due
     where n.id = due.id
    returning n.*
  )
  select c.id, c.user_id, coalesce(u.email, ''), coalesce(u.phone, ''), u.full_name, c.business_id,
         coalesce(bu.plan::text, ''), c.kind, c.category,
         c.title, c.body, c.link, c.channels, c.dedupe_key
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.businesses bu on bu.id = c.business_id;
$$;
