-- Buckets take what a browser can actually write (D-224): WebP, and PNG for the browsers that
-- cannot encode WebP from a canvas. Never JPEG, because a camera writes JPEG and the rule these
-- buckets were built on is that an untouched original cannot be stored.
begin;
select plan(4);

select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/webp', 'image/png'],
  'a profile picture may be either'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'gallery'),
  array['image/webp', 'image/png'],
  'and so may a pass photo'
);

-- Every bucket the app uploads to, so a new one is not left on WebP alone by accident.
select is(
  (select count(*)::int from storage.buckets
    where id in ('avatars', 'badges', 'receipts', 'feedback', 'gallery')
      and allowed_mime_types = array['image/webp', 'image/png']),
  5,
  'and every bucket the app writes to says the same'
);

-- The rule that makes the two above worth having: nothing a camera writes is on the list.
select is(
  (select count(*)::int from storage.buckets
    where id in ('avatars', 'badges', 'receipts', 'feedback', 'gallery')
      and ('image/jpeg' = any (allowed_mime_types) or 'image/heic' = any (allowed_mime_types))),
  0,
  'and no bucket takes a type a camera writes'
);

select * from finish();
rollback;
