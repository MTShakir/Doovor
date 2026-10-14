-- What an instructor, and the school they teach for, are told about their badge (NTF-03, INS-03,
-- PRD Appendix B, D-260).
--
-- Deciding a verification queues `instructor/verification-decided`, and the daily sweep sends
-- `instructor/badge-expiring`, but nothing listened to either, so neither the decision nor the
-- warning ever reached anybody. The jobs that now do read the people through this, as the service
-- role reads everything it tells anybody.

/**
 * The instructor a notice is about: who they are, how their badge was last decided and why, when it
 * runs out, and the owners and managers of the school they teach for, who hear as well. An
 * independent instructor's own Business has nobody else to tell. Null for a profile that is gone.
 */
create or replace function public.system_instructor_notice(p_instructor_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'instructor_profile_id', p.id,
           'business_id', p.business_id,
           'user_id', p.user_id,
           'name', p.display_name,
           'verification_status', p.verification_status,
           'reason', p.verification_decision_reason,
           'badge_expiry', p.badge_expiry,
           -- How many times it has been decided, which only goes up: each decision is a row of the
           -- append-only audit log, so a second refusal is a second notice and a retry is not.
           'decisions', (
             select count(*)
               from public.audit_log a
              where a.action = 'instructor.verification_decided'
                and a.entity_id = p.id
           ),
           'school_staff_ids', coalesce((
             select jsonb_agg(m.user_id order by m.created_at)
               from public.memberships m
               join public.businesses b on b.id = m.business_id
              where m.business_id = p.business_id
                and b.type = 'school'
                and m.role in ('owner', 'manager')
                and m.status = 'active'
                and m.user_id <> p.user_id
           ), '[]'::jsonb)
         )
    from public.instructor_profiles p
   where p.id = p_instructor_profile_id;
$$;

revoke all on function public.system_instructor_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_instructor_notice(uuid) to service_role;
