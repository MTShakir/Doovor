-- A name with accents keeps its letters in a link (PUB-01, PUB-02, D-375).
--
-- A Business's address and an instructor's profile and booking link are made from names, and every
-- letter outside a to z became a gap: "Sinéad's Driving & Co" was given
-- /instructors/leeds/sin-ad-s-driving-co, and Siân, Zoë, Seán, José or Ní Mháille came out broken
-- in the link an instructor puts on their car and in their messages. Found in the A to Z round on
-- 22 Oct 2026. Letters now lose their accents first (é is e, ŵ is w, ß is ss, æ is ae), and an
-- apostrophe goes without leaving a gap, so "Sinéad's" is "sineads". Addresses already made are left
-- as they are: they are on cards, in bios and in messages already.

create extension if not exists unaccent with schema extensions;

create or replace function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(
        regexp_replace(
          lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value, ''))),
          '[''‘’`]+', '', 'g'
        ),
        '[^a-z0-9]+', '-', 'g'
      )),
      ''
    ),
    'n'
  );
$$;
