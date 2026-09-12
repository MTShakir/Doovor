-- Instructor profile photos (INS-01, AUTH-04, M1-03).
--
-- The browser crops, resizes and re-encodes the picture before it is uploaded, which is what
-- removes the camera metadata: a photo taken at home carries the GPS position of that home,
-- and a profile picture is public. The bucket accepts the one type the browser produces, so
-- an untouched original cannot be stored even by a caller that skips the app.

-- The column holds the object path, not a full address: the address is built from whichever
-- project is serving, so a restored or moved project keeps working.
alter table public.instructor_profiles rename column photo_url to photo_path;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies on storage.objects are evaluated as the caller, so the helper needs an explicit
-- grant. It is security definer and returns only the caller's own profiles.
grant execute on function private.auth_instructor_ids() to authenticated;

-- Profile pictures are public by definition: they appear on public profiles and city pages.
create policy avatars_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Everything else is restricted to the instructor whose folder it is.
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );
