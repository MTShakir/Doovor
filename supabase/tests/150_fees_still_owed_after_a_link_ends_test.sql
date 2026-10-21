-- Fees still owed after a link ends (D-287, D-313): each side sees them, with the names, and only theirs.
begin;
select plan(6);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
select id as link from public.school_links where business_id = :'asha_biz' \gset

select tests.authenticate_as(:'ben');
select public.set_school_fee_terms(:'link', 'weekly', 1500, private.today() + 1, 0, null);
reset role;
select public.system_raise_school_fees(private.today() + 8);

select tests.authenticate_as(:'ben');
select is(jsonb_array_length(public.links_still_owing(:'school')), 0, 'a link still running is not one of these');
select public.end_school_link(:'link');
select is(
  (select jsonb_build_object('school', o ->> 'schoolName', 'business', o ->> 'businessName', 'instructor', o ->> 'instructorName', 'on', o ->> 'endedOn')
     from jsonb_array_elements(public.links_still_owing(:'school')) o),
  jsonb_build_object('school', 'Bee School', 'business', 'Asha Driving', 'instructor', 'Asha', 'on', private.today()::text),
  'the school sees the link it ended, with what it is called'
);
reset role;

select tests.authenticate_as(:'asha_user');
select is(jsonb_array_length(public.links_still_owing(:'asha_biz')), 1, 'and so does the instructor whose Business owes the fees');
reset role;

select tests.authenticate_as(:'otto');
select is(jsonb_array_length(public.links_still_owing(:'school')), 0, 'somebody else sees nothing');
reset role;

-- Every fee settled: nothing is still owed.
update public.school_fees set status = 'paid', settled_at = now() where link_id = :'link';
select tests.authenticate_as(:'ben');
select is(jsonb_array_length(public.links_still_owing(:'school')), 0, 'once everything is settled, it is gone');
reset role;

select ok(
  not has_function_privilege('anon', 'public.links_still_owing(uuid)', 'execute'),
  'nobody signed out reads it'
);

select * from finish();
rollback;
