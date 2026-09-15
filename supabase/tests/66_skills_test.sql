-- The skill map (PRG-02, PRD Appendix A, M4-01).
begin;
select plan(6);

-- The same list is pinned in packages/core/src/skills.test.ts, against the app's copy.
select results_eq(
  $$ select code from public.skills order by position $$,
  $$ values ('CTRL'), ('COCKPIT'), ('MOVEOFF'), ('MIRRORS'), ('SIGNALS'), ('CLEAR'), ('RESPONSE'), ('SPEED'),
            ('FOLLOW'), ('PROGRESS'), ('JUNCTIONS'), ('ROUNDABOUT'), ('JUDGEMENT'), ('POSITION'), ('PEDX'),
            ('STOPS'), ('AWARE'), ('E-STOP'), ('MANOEUVRE'), ('DUALCW'), ('RURAL'), ('INDEP'), ('ECO') $$,
  'the 23 areas of Appendix A, in the order of the test report'
);

select results_eq(
  $$ select name, sub_skills from public.skills where code in ('JUNCTIONS', 'E-STOP') order by position $$,
  $$ values ('Junctions', array['Approach speed', 'Observation', 'Turning right', 'Turning left', 'Cutting corners']),
            ('Emergency stop', '{}'::text[]) $$,
  'each area says what it covers, and an area that is one thing covers nothing more'
);

set local role anon;
select is((select count(*)::int from public.skills), 23, 'anybody can read the skill map, before signing in');
reset role;

select tests.create_fixture();
select tests.authenticate_as('b0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.skills), 23, 'a signed-in owner reads the same map');
select throws_ok(
  $$ insert into public.skills (code, position, name) values ('PARKING', 24, 'Parking') $$,
  '42501', null,
  'nobody signed in can add an area'
);
select throws_ok(
  $$ update public.skills set name = 'Knobs' where code = 'CTRL' $$,
  '42501', null,
  'or rename one'
);
select tests.clear_authentication();

select * from finish();
rollback;
