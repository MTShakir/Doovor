-- Profile photos: public to look at, private to change (INS-01, AUTH-04, M1-03).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'

-- The column holds a path, so the address is built from whichever project is serving.
select has_column('public', 'instructor_profiles', 'photo_path', 'the profile stores the object path');
select hasnt_column('public', 'instructor_profiles', 'photo_url', 'and no longer a full address');

-- The bucket
select is((select public from storage.buckets where id = 'avatars'), true, 'profile photos are public to read');
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/webp'],
  'the bucket takes only what the browser produces, so an original with camera metadata cannot be stored'
);
select ok(
  (select file_size_limit from storage.buckets where id = 'avatars') <= 2097152,
  'and only a small file'
);

-- Who may write
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L) $$, :'asha' || '/one.webp', :'asha_user'),
  'an instructor uploads into their own folder'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L) $$, :'asha' || '/two.webp', :'ian_user'),
  '42501',
  null,
  'and never into the folder of another instructor'
);

-- Storage refuses direct deletes so nobody strands a file; the tests opt in to check the policy.
do $$ begin perform set_config('storage.allow_delete_query', 'true', true); end $$;
with removed as (
  delete from storage.objects where bucket_id = 'avatars' and name = :'asha' || '/one.webp' returning 1
)
select is((select count(*)::int from removed), 0, 'one instructor cannot remove the photo of another');

-- Who may read
select tests.authenticate_as_anon();
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name = :'asha' || '/one.webp'),
  1,
  'anyone can read a profile photo: they appear on public profiles'
);

select tests.authenticate_as(:'asha_user');
with removed as (
  delete from storage.objects where bucket_id = 'avatars' and name = :'asha' || '/one.webp' returning 1
)
select is((select count(*)::int from removed), 1, 'an instructor removes their own photo');

select * from finish();
rollback;
