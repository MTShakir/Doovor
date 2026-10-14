-- A pass photo's size (D-267): written down as it is added, both or neither, and handed back to
-- the public wall and to the staff who check it, so each is shown whole at its own shape.
begin;
select plan(14);

select tests.create_fixture();

\set business_a 'aaaa0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000080'

select tests.create_user_with_id(:'staff', 'staff.gallery.size@test.local', 'Sue Staff');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

update public.businesses set plan = 'pro' where id = :'business_a';
update public.instructor_profiles
   set verification_status = 'approved', public_slug = 'asha-driving', is_listed = true
 where id = 'a1000000-0000-0000-0000-000000000001';

select tests.authenticate_as(:'asha');

-- ---------------------------------------------------------------------------------------
-- Adding one.
-- ---------------------------------------------------------------------------------------
select lives_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L, 1050, 1400) $$,
         :'business_a' || '/upright.webp', (private.today() - 2)::text, 'Uma Upright'),
  'a photo taken upright is added with its size'
);
select is(
  (select array[image_width, image_height] from public.gallery_photos where image_path = :'business_a' || '/upright.webp'),
  array[1050, 1400],
  'and the size is written down as it was sent'
);

select lives_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L) $$,
         :'business_a' || '/no-size.webp', (private.today() - 3)::text, 'Ned Nosize'),
  'a page open from before the size was sent still adds one'
);
select ok(
  (select image_width is null and image_height is null from public.gallery_photos where image_path = :'business_a' || '/no-size.webp'),
  'without a size, which it takes as it loads'
);

-- ---------------------------------------------------------------------------------------
-- What is refused.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L, 1050, null) $$,
         :'business_a' || '/half.webp', (private.today() - 1)::text, 'Hal Half'),
  'VALIDATION_FAILED',
  'a width without a height is refused'
);
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L, 1050, 0) $$,
         :'business_a' || '/flat.webp', (private.today() - 1)::text, 'Fay Flat'),
  'VALIDATION_FAILED',
  'a picture with no height is refused'
);
select throws_ok(
  format($$ select public.add_gallery_photo(%L, %L, null, %L, 20000, 1400) $$,
         :'business_a' || '/huge.webp', (private.today() - 1)::text, 'Hugo Huge'),
  'VALIDATION_FAILED',
  'and so is a size no prepared picture has'
);
select tests.clear_authentication();

select throws_ok(
  format($$ update public.gallery_photos set image_height = null where image_path = %L $$, :'business_a' || '/upright.webp'),
  '23514',
  null,
  'the table itself keeps the width and the height together'
);

-- ---------------------------------------------------------------------------------------
-- What the public sees, and what staff see.
-- ---------------------------------------------------------------------------------------
select is(
  (select array[(photo ->> 'width')::integer, (photo ->> 'height')::integer]
     from jsonb_array_elements(public.instructor_gallery('asha-driving') -> 'photos') photo
    where photo ->> 'learnerName' = 'Uma Upright'),
  array[1050, 1400],
  'the profile hands back each photo''s size'
);
select ok(
  (select photo -> 'width' = 'null'::jsonb and photo -> 'height' = 'null'::jsonb
     from jsonb_array_elements(public.instructor_gallery('asha-driving') -> 'photos') photo
    where photo ->> 'learnerName' = 'Ned Nosize'),
  'and says plainly when there is none'
);

select tests.authenticate_as(:'staff', 'aal2');
select is(
  (select array[(row ->> 'image_width')::integer, (row ->> 'image_height')::integer]
     from jsonb_array_elements(public.admin_gallery(:'business_a') -> 'rows') row
    where row ->> 'learner_name' = 'Uma Upright'),
  array[1050, 1400],
  'and so does the wall staff check them on'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- One function, not two.
-- ---------------------------------------------------------------------------------------
select ok(
  to_regprocedure('public.add_gallery_photo(text, date, uuid, text)') is null,
  'the old four-argument function is gone, so a call cannot mean either'
);
select ok(
  has_function_privilege('authenticated', 'public.add_gallery_photo(text, date, uuid, text, integer, integer)', 'execute'),
  'somebody signed in may call the new one'
);
select ok(
  not has_function_privilege('anon', 'public.add_gallery_photo(text, date, uuid, text, integer, integer)', 'execute'),
  'and nobody signed out may'
);

select * from finish();
