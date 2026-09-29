-- The gallery (D-218): who may add a pass photo, whose name it may carry, which plans carry it,
-- what the public sees, and what staff can do about one.
begin;
select plan(21);

select tests.create_fixture();

\set business_a 'aaaa0000-0000-0000-0000-000000000000'
\set business_b 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set ian 'b0000000-0000-0000-0000-000000000003'
\set learner_1 'c0000000-0000-0000-0000-000000000001'
\set learner_2 'c0000000-0000-0000-0000-000000000002'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000080'

select tests.create_user_with_id(:'staff', 'staff.gallery@test.local', 'Sue Staff');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

-- Days are counted from `private.today()`, the day in the United Kingdom, because that is what
-- the rule inside `add_gallery_photo` compares against (D-141). The database's own `current_date`
-- is a different day whenever the server is set elsewhere, which is what `pnpm db:test:another-day`
-- proves every run (D-156), and it made "a pass that has not happened yet" happen already.

-- Both Businesses are on a plan that carries it, except where a test says otherwise.
update public.businesses set plan = 'pro' where id = :'business_a';
update public.businesses set plan = 'school' where id = :'business_b';
-- Asha's profile is public, so the public function has something to find.
update public.instructor_profiles
   set verification_status = 'approved', public_slug = 'asha-driving', is_listed = true
 where id = 'a1000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------------------
-- Adding one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');

select lives_ok(
  format($$ select public.add_gallery_photo(%L, %L, %L, null) $$,
         :'business_a' || '/passed-1.webp', (private.today() - 3)::text, :'learner_1'),
  'an instructor adds a photo for a learner of theirs'
);
select id as first_photo from public.gallery_photos where image_path = :'business_a' || '/passed-1.webp' \gset

select is(
  (select learner_name from public.gallery_photos where id = :'first_photo'),
  'Lee One',
  'and the banner takes the name from the account rather than the form'
);
select is(
  (select instructor_id from public.gallery_photos where id = :'first_photo'),
  ('a1000000-0000-0000-0000-000000000001')::uuid,
  'and the photo knows whose learner it was'
);
select ok(
  (select consent_confirmed_at is not null from public.gallery_photos where id = :'first_photo'),
  'and when permission was confirmed is written down'
);

-- Somebody who is not on the books yet: a typed name is allowed, because the photo is taken on
-- the day and the learner may already have left.
select lives_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/passed-2.webp', (private.today() - 1)::text, '  Jaz Hall  '),
  'a name typed by hand is taken'
);
select is(
  (select learner_name from public.gallery_photos where image_path = :'business_a' || '/passed-2.webp'),
  'Jaz Hall',
  'and it is tidied up'
);

-- ---------------------------------------------------------------------------------------
-- What is refused.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, %L, null) $$,
         :'business_a' || '/passed-3.webp', (private.today() - 1)::text, :'learner_2'),
  'NOT_ALLOWED',
  'a learner they have never taught is not theirs to put on a wall'
);

select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_b' || '/passed-4.webp', (private.today() - 1)::text, 'Someone Else'),
  'VALIDATION_FAILED',
  'a picture in another Business folder is refused'
);

select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/passed-5.webp', (private.today() + 1)::text, 'Tomorrow Person'),
  'VALIDATION_FAILED',
  'a pass that has not happened yet is refused'
);

select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/passed-6.webp', (private.today() - 1)::text, '   '),
  'VALIDATION_FAILED',
  'a photo with nobody on it is refused'
);

select tests.clear_authentication();
select tests.authenticate_as(:'outsider');
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/passed-7.webp', (private.today() - 1)::text, 'Nobody At All'),
  'NOT_ALLOWED',
  'somebody who works nowhere cannot add one'
);
select tests.clear_authentication();

-- The plan carries it, or it does not (D-210's rule, applied here).
update public.businesses set plan = 'free' where id = :'business_a';
select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/passed-8.webp', (private.today() - 1)::text, 'Free Plan'),
  'PLAN_REQUIRED',
  'a Business on Free cannot add one'
);
select tests.clear_authentication();

select ok(
  (select public.instructor_gallery('asha-driving') is null),
  'and its profile stops showing the wall while the plan does not carry it'
);

update public.businesses set plan = 'pro' where id = :'business_a';

-- ---------------------------------------------------------------------------------------
-- What the public sees.
-- ---------------------------------------------------------------------------------------
select is(
  (select jsonb_array_length(public.instructor_gallery('asha-driving') -> 'photos')),
  2,
  'the profile shows both photos, newest pass first'
);
select is(
  (select (public.instructor_gallery('asha-driving') -> 'photos' -> 0 ->> 'learnerName')),
  'Jaz Hall',
  'and the most recent pass is first'
);
select is(
  (select (public.instructor_gallery('asha-driving') -> 'photos' -> 0 ->> 'verified')::boolean),
  false,
  'and nothing is ticked until somebody has checked it'
);

-- ---------------------------------------------------------------------------------------
-- Staff: the tick, and taking one down.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian');
select throws_ok(
  format($$ select public.admin_check_gallery_photo(%L, true) $$, :'first_photo'),
  'NOT_ALLOWED',
  'an instructor cannot tick their own photo'
);
select tests.clear_authentication();

select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(
  format($$ select public.admin_check_gallery_photo(%L, true) $$, :'first_photo'),
  'staff tick one they have checked'
);
select lives_ok(
  format($$ select public.admin_hide_gallery_photo(%L, true) $$, :'first_photo'),
  'and take one down'
);
-- Read while still staff: nobody else may see the row, so an unauthenticated read would say the
-- tick was gone whether it was or not.
select ok(
  (select verified_at is null from public.gallery_photos where id = :'first_photo'),
  'and taking one down takes the tick with it, because we no longer stand behind it'
);
select tests.clear_authentication();

select is(
  (select jsonb_array_length(public.instructor_gallery('asha-driving') -> 'photos')),
  1,
  'and the profile stops showing it'
);

select * from finish();
rollback;
