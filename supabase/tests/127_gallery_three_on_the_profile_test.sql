-- Three pass photos on a profile, the checked ones first, and the whole wall for its own page
-- (D-268): which three, in what order, how many there are in all, and the call the app made
-- before it knew about any of this.
begin;
select plan(13);

select tests.create_fixture();

\set business_a 'aaaa0000-0000-0000-0000-000000000000'
\set business_b 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set ian 'b0000000-0000-0000-0000-000000000003'
\set staff 'e0000000-0000-0000-0000-000000000080'

select tests.create_user_with_id(:'staff', 'staff.gallery.three@test.local', 'Sue Staff');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

update public.businesses set plan = 'pro' where id = :'business_a';
update public.businesses set plan = 'school' where id = :'business_b';
update public.instructor_profiles
   set verification_status = 'approved', public_slug = 'asha-driving', is_listed = true
 where id = 'a1000000-0000-0000-0000-000000000001';

-- Six passes on Asha's wall, a day apart, the newest first: Ava passed yesterday.
select tests.authenticate_as(:'asha');
select public.add_gallery_photo(:'business_a' || '/' || name || '.webp', private.today() - days, null, name)
  from (values ('Ava', 1), ('Ben', 2), ('Cal', 3), ('Dee', 4), ('Eve', 5), ('Fay', 6)) as passes (name, days);
select tests.clear_authentication();

-- The names on a wall, in the order it hands them back.
create function pg_temp.names(p_gallery jsonb) returns text[] language sql as $$
  select array_agg(photo ->> 'learnerName' order by place)
    from jsonb_array_elements(p_gallery -> 'photos') with ordinality as photos (photo, place);
$$;

-- ---------------------------------------------------------------------------------------
-- Nothing checked yet: the newest three.
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.names(public.instructor_gallery('asha-driving')),
  array['Ava', 'Ben', 'Cal'],
  'with nothing checked, a profile shows the newest three'
);
select is(
  (public.instructor_gallery('asha-driving') ->> 'total')::integer,
  6,
  'and says how many there are in all'
);

-- Staff tick two of the older ones, and take the oldest down.
select tests.authenticate_as(:'staff', 'aal2');
select public.admin_check_gallery_photo(id, true) from public.gallery_photos where learner_name in ('Dee', 'Eve');
select public.admin_hide_gallery_photo(id, true) from public.gallery_photos where learner_name = 'Fay';
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- The three on a profile: checked first.
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.names(public.instructor_gallery('asha-driving')),
  array['Dee', 'Eve', 'Ava'],
  'the checked ones come first, newest first, and the newest of the rest fills the third place'
);
select is(
  (public.instructor_gallery('asha-driving') -> 'photos' -> 0 ->> 'verified')::boolean,
  true,
  'and the first carries its tick'
);
select is(
  (public.instructor_gallery('asha-driving') ->> 'total')::integer,
  5,
  'and one taken down is not counted'
);

-- ---------------------------------------------------------------------------------------
-- The whole wall: newest first, tick or not.
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.names(public.instructor_gallery('asha-driving', true)),
  array['Ava', 'Ben', 'Cal', 'Dee', 'Eve'],
  'the whole wall is every photo still up, newest first'
);
select is(
  (public.instructor_gallery('asha-driving', true) ->> 'total')::integer,
  5,
  'with the same count'
);
select is(
  pg_temp.names(public.instructor_gallery('asha-driving', null)),
  array['Dee', 'Eve', 'Ava'],
  'and asking with nothing is asking for the three'
);

-- ---------------------------------------------------------------------------------------
-- A school's wall works the same way.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian');
select public.add_gallery_photo(:'business_b' || '/' || name || '.webp', private.today() - days, null, name)
  from (values ('Gus', 1), ('Hal', 2), ('Ivy', 3), ('Jo', 4)) as passes (name, days);
select tests.clear_authentication();

select is(
  pg_temp.names(public.school_gallery('bee-school')),
  array['Gus', 'Hal', 'Ivy'],
  'a school profile shows three of its instructors'' passes'
);
select is(
  array[jsonb_array_length(public.school_gallery('bee-school', true) -> 'photos'), (public.school_gallery('bee-school') ->> 'total')::integer],
  array[4, 4],
  'and its whole wall has all four, which the profile counts'
);

-- ---------------------------------------------------------------------------------------
-- Who may ask, and the call from before.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as_anon();
select is(
  pg_temp.names(public.instructor_gallery('asha-driving')),
  array['Dee', 'Eve', 'Ava'],
  'anybody may read a profile''s three, signed in or not, with the slug alone as the app used to ask'
);
select is(
  jsonb_array_length(public.school_gallery('bee-school', true) -> 'photos'),
  4,
  'and a whole wall'
);
select tests.clear_authentication();

select ok(
  to_regprocedure('public.instructor_gallery(text)') is null and to_regprocedure('public.school_gallery(text)') is null,
  'the one-argument functions are gone, so a call with the slug alone can only mean the new ones'
);

select * from finish();
