-- Somebody who joins a school is welcomed to it, as what they do there (NTF-03, D-259, D-400).
begin;
select plan(4);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'

update public.users set email_verified_at = now() where id in (:'ben', :'manager', :'ian_user', :'asha_user');

select is(
  public.system_welcome_notice(:'ian_user') -> 'school',
  jsonb_build_object('name', 'Bee School', 'role', 'instructor'),
  'an instructor teaching under a school is welcomed to it as one of its instructors'
);
select is(
  public.system_welcome_notice(:'manager') -> 'school',
  jsonb_build_object('name', 'Bee School', 'role', 'manager'),
  'a manager as somebody who helps run it'
);
select is(public.system_welcome_notice(:'ben') -> 'school', 'null'::jsonb, 'its owner, who set it up, is welcomed as a school');
select is(public.system_welcome_notice(:'asha_user') -> 'school', 'null'::jsonb, 'and an instructor on their own as before');

select * from finish();
rollback;
