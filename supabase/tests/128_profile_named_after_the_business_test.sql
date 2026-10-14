-- An independent instructor's profile lives at an address made from their Business name, and
-- every address it had before still leads to it (PUB-01, D-269).
begin;
select plan(16);

select tests.create_fixture();

\set business_a 'aaaa0000-0000-0000-0000-000000000000'
\set business_b 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set ian_profile 'b1000000-0000-0000-0000-000000000001'

-- As profiles were before this: Asha's address made from her own name, Ian's from his.
update public.instructor_profiles set public_slug = 'asha-instructor' where id = :'asha_profile';
update public.instructor_profiles set public_slug = 'tumbleweed-driving' where id = :'ian_profile';

-- ---------------------------------------------------------------------------------------
-- What the migration did to every Business of one.
-- ---------------------------------------------------------------------------------------
select is(
  private.name_profile_after_business(:'business_a'),
  'asha-driving',
  'a profile takes an address made from its Business name'
);
select is(
  public.current_profile_slug('asha-instructor'),
  'asha-driving',
  'and the address it had leads to it'
);
select is(
  private.name_profile_after_business(:'business_a'),
  'asha-driving',
  'and doing it again changes nothing'
);
select is(
  private.name_profile_after_business(:'business_b'),
  null,
  'a school is left alone: its instructors all work for it, and it has an address of its own'
);

-- ---------------------------------------------------------------------------------------
-- Renaming follows.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select public.set_business_name(:'business_a', 'Quillfeather Driving');
select tests.clear_authentication();

select is(
  (select public_slug from public.instructor_profiles where id = :'asha_profile'),
  'quillfeather-driving',
  'renaming the Business moves the profile to the new name'
);
select is(
  array[public.current_profile_slug('asha-instructor'), public.current_profile_slug('asha-driving')],
  array['quillfeather-driving', 'quillfeather-driving'],
  'and every address it had before leads there'
);
select is(
  (select after ->> 'profile_slug' from public.audit_log
    where action = 'business.renamed' and entity_id = :'business_a' and after ->> 'name' = 'Quillfeather Driving'),
  'quillfeather-driving',
  'and the audit says where it went'
);

select tests.authenticate_as(:'asha');
select public.set_business_name(:'business_a', 'Asha Driving');
select tests.clear_authentication();
select is(
  (select public_slug from public.instructor_profiles where id = :'asha_profile'),
  'asha-driving',
  'going back to an old name takes back its own old address'
);
select is(
  public.current_profile_slug('quillfeather-driving'),
  'asha-driving',
  'and the one it left leads back'
);
select is(
  public.current_profile_slug('asha-driving'),
  null,
  'and an address in use is not also an old one'
);

-- A name somebody else's address already has: the same name, told apart.
select tests.authenticate_as(:'asha');
select public.set_business_name(:'business_a', 'Tumbleweed Driving');
select tests.clear_authentication();
select matches(
  (select public_slug from public.instructor_profiles where id = :'asha_profile'),
  '^tumbleweed-driving-[0-9a-f]{5}$',
  'a name another profile has is told apart, and theirs is left alone'
);
select is(
  private.unique_slug('Quillfeather Driving', 'instructor_profiles') <> 'quillfeather-driving',
  true,
  'and an address that leads to somebody is never handed to anybody else'
);

-- A school's name is the school's: renaming it moves no instructor.
select tests.authenticate_as(:'ben');
select public.set_business_name(:'business_b', 'Bee Driving School');
select tests.clear_authentication();
select is(
  (select public_slug from public.instructor_profiles where id = :'ian_profile'),
  'tumbleweed-driving',
  'renaming a school leaves its instructors where they are'
);

-- ---------------------------------------------------------------------------------------
-- Never by hand, and gone with the account.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ update public.instructor_profiles set public_slug = 'quillfeather-driving' where id = %L $$, :'asha_profile'),
  '42501',
  null,
  'nobody sets an address by hand, so nobody can take the one an old link leads to'
);
select tests.clear_authentication();

select tests.authenticate_as_anon();
select is(
  public.current_profile_slug('never-was-anybody'),
  null,
  'an address that was never anybody''s leads nowhere'
);
select tests.clear_authentication();

update public.instructor_profiles set public_slug = null where id = :'asha_profile';
select is(
  (select count(*)::integer from private.former_profile_slugs where instructor_id = :'asha_profile'),
  0,
  'a profile taken off the site with its account takes its old addresses with it'
);

select * from finish();
