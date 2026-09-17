-- Platform settings: read by staff, changed by a super admin alone, every value checked, every
-- change audited (ADM-05, PRD 6.2, M5-20).
begin;
select plan(28);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set super 'e0000000-0000-0000-0000-000000000050'
\set support 'e0000000-0000-0000-0000-000000000051'

select tests.create_user_with_id(:'super', 'super.settings@test.local', 'Sue Super');
select tests.create_user_with_id(:'support', 'support.settings@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin'), (:'support', 'support_admin');

-- The defaults every Business starts from, as a super admin might set them.
\set rules '{"buffer_minutes": 15, "notice_hours": 12, "horizon_weeks": 10, "cancellation_window_hours": 24, "late_fee_percent": 50, "request_expiry_hours": 6, "reminder_hours_before": [48, 2]}'

-- ---------------------------------------------------------------------------------------
-- Reading.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select results_eq(
  $$ select array_agg(k order by k) from jsonb_object_keys(public.admin_platform_settings()) as k $$,
  $$ values (array['booking_defaults', 'feature_flags', 'marketplace_fee', 'marketplace_switch_on', 'plan_limits']) $$,
  'support staff read the settings a super admin looks after (ADM-05)'
);
select results_eq(
  $$ select public.admin_platform_settings() -> 'booking_defaults' -> 'value' -> 'reminder_hours_before', public.admin_platform_settings() -> 'booking_defaults' -> 'value' ? 'reminder_hours' $$,
  $$ values ('[24, 2]'::jsonb, false) $$,
  'with the default reminder times kept where the reminder job now reads them'
);
select tests.authenticate_as(:'support');
select throws_ok($$ select public.admin_platform_settings() $$, '42501', null, 'not before their second step (AUTH-08)');
select tests.authenticate_as(:'asha', 'aal2');
select throws_ok($$ select public.admin_platform_settings() $$, '42501', null, 'nor anybody outside the platform staff');
select throws_ok(
  $$ update public.platform_settings set value = '{}' where key = 'feature_flags' $$,
  '42501', null, 'and nobody signed in writes a setting straight into the table'
);

-- ---------------------------------------------------------------------------------------
-- Who may change one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok(format($$ select public.admin_set_platform_setting('booking_defaults', %L) $$, :'rules'), '42501', null,
  'support staff cannot change a setting (PRD 6.2)');
select tests.authenticate_as(:'super');
select throws_ok(format($$ select public.admin_set_platform_setting('booking_defaults', %L) $$, :'rules'), '42501', null,
  'nor a super admin before their second step');

select tests.authenticate_as(:'super', 'aal2');
select lives_ok(format($$ select public.admin_set_platform_setting('booking_defaults', %L) $$, :'rules'), 'a super admin changes the default booking rules');
select lives_ok(format($$ select public.admin_set_platform_setting('booking_defaults', %L) $$, :'rules'), 'and saving the same again changes nothing');

select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'booking_defaults'), :'rules'::jsonb, 'the new defaults are kept');
select is(
  (select count(*)::int from public.audit_log
    where action = 'platform.setting_changed' and actor_user_id = :'super'
      and before ->> 'key' = 'booking_defaults' and (after -> 'value' ->> 'notice_hours')::int = 12),
  1,
  'once in the audit log, with what it was and what it became (NFR-SEC-06)'
);
select is((private.booking_rules(:'asha_profile') ->> 'notice_hours')::int, 12, 'and a Business with no rules of its own takes them at once');

-- ---------------------------------------------------------------------------------------
-- Every value is checked.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'super', 'aal2');
create or replace function pg_temp.refused(p_key text, p_value jsonb) returns text language plpgsql as $$
begin
  perform public.admin_set_platform_setting(p_key, p_value);
  return null;
exception when others then
  get stacked diagnostics p_key = pg_exception_detail;
  return (p_key::jsonb) ->> 'field';
end;
$$;

select is(pg_temp.refused('booking_defaults', :'rules'::jsonb || '{"notice_hours": 100}'), 'notice_hours', 'notice beyond 72 hours is refused (PRD 11.1)');
select is(pg_temp.refused('booking_defaults', :'rules'::jsonb || '{"late_fee_percent": 30}'), 'late_fee_percent', 'a late fee other than nothing, half or all is refused');
select is(pg_temp.refused('booking_defaults', :'rules'::jsonb || '{"buffer_minutes": 7.5}'), 'buffer_minutes', 'a gap that is not whole minutes is refused');
select is(pg_temp.refused('booking_defaults', :'rules'::jsonb || '{"reminder_hours_before": [0]}'), 'reminder_hours_before', 'a reminder at the lesson itself is refused');
select is(pg_temp.refused('booking_defaults', :'rules'::jsonb - 'horizon_weeks'), 'value', 'a rule left out is refused');
select is(pg_temp.refused('booking_defaults', :'rules'::jsonb || '{"surprise": 1}'), 'value', 'and so is a rule nobody knows');

select lives_ok($$ select public.admin_set_platform_setting('marketplace_switch_on', '{"verified_instructors": 30, "open_hours_14_days": 200}') $$,
  'the switch-on rule is changed (PRD 4.2)');
select is(pg_temp.refused('marketplace_switch_on', '{"verified_instructors": 0, "open_hours_14_days": 200}'), 'verified_instructors', 'but never to nobody');

select lives_ok($$ select public.admin_set_platform_setting('plan_limits', '{"pro": {"sms_reminders_per_month": 250}, "school": {"sms_reminders_per_month": 400}}') $$,
  'the plan limits are changed (PRD 9.18)');
select is(pg_temp.refused('plan_limits', '{"pro": {"sms_reminders_per_month": -1}, "school": {"sms_reminders_per_month": 400}}'), 'pro', 'but not below nothing');

select lives_ok($$ select public.admin_set_platform_setting('marketplace_fee', '{"percent": 4, "cap_pence": 150}') $$, 'the marketplace fee is changed');
select is(pg_temp.refused('marketplace_fee', '{"percent": 25, "cap_pence": 150}'), 'percent', 'but not beyond a fifth of a lesson');

select lives_ok($$ select public.admin_set_platform_setting('feature_flags', '{"google_sign_in": false, "apple_sign_in": false, "marketplace": false}') $$,
  'a feature is switched off');
select is(pg_temp.refused('feature_flags', '{"google_sign_in": "no", "apple_sign_in": false, "marketplace": false}'), 'value', 'with a yes or no, nothing else');
select is(pg_temp.refused('founding_offer', '{"months": 6, "school_limit": 5, "instructor_limit": 5}'), 'key', 'the founding offer is not changed from here (D-128)');

-- ---------------------------------------------------------------------------------------
-- Who else reads what.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as_anon();
select is(public.feature_flags(), '{"google_sign_in": false, "apple_sign_in": false, "marketplace": false}'::jsonb,
  'every page reads which features are on, signed in or not');

select * from finish();
rollback;
