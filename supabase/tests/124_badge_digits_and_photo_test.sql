-- A badge is sent with its photo, a PNG photo is accepted, and the number is digits (INS-02, D-262).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'

select tests.create_user('staff.digits@test.local', 'Sam Support') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');

select tests.authenticate_as(:'asha_user');

-- ---------------------------------------------------------------------------------------
-- The photo.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 400)::date, true, null) $$, :'asha'),
  'P0001', 'VALIDATION_FAILED',
  'a badge with no photo, and none on file, is refused'
);
select lives_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 400)::date, true, %L) $$, :'asha', :'asha' || '/badge-photo-png.png'),
  'a PNG photo is accepted, which is what a browser that cannot write WebP sends (D-224)'
);
select lives_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 500)::date, true, null) $$, :'asha'),
  'sending it again keeps the photo already on file'
);
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 400)::date, true, %L) $$, :'asha', :'asha' || '/badge.jpg'),
  'P0001', 'VALIDATION_FAILED',
  'and a photo that did not go through the browser''s canvas is not'
);

-- A decision clears the photo (D-158), so sending again after one needs a new photo.
select tests.authenticate_as(:'staff', 'aal2');
select public.decide_verification(:'asha', false, 'The photo is too blurred to read');
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 400)::date, true, null) $$, :'asha'),
  'P0001', 'VALIDATION_FAILED',
  'after a refusal, the badge is sent again with a new photo'
);
select lives_ok(
  format($$ select public.submit_verification(%L, 'adi', '612345', (private.today() + 400)::date, true, %L) $$, :'asha', :'asha' || '/badge-photo-two.webp'),
  'which then goes back to being checked'
);

-- ---------------------------------------------------------------------------------------
-- The number: digits, five to seven of them, spaces ignored.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', 'AB1234', (private.today() + 400)::date, true, null) $$, :'asha'),
  'P0001', 'VALIDATION_FAILED',
  'letters are refused'
);
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '1234', (private.today() + 400)::date, true, null) $$, :'asha'),
  'P0001', 'VALIDATION_FAILED',
  'and four digits'
);
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '07700900123', (private.today() + 400)::date, true, null) $$, :'asha'),
  'P0001', 'VALIDATION_FAILED',
  'and a phone number typed into it'
);
select lives_ok(
  format($$ select public.submit_verification(%L, 'adi', '61234', (private.today() + 400)::date, true, null) $$, :'asha'),
  'five digits are accepted'
);
select lives_ok(
  format($$ select public.submit_verification(%L, 'adi', '612 3456', (private.today() + 400)::date, true, null) $$, :'asha'),
  'and seven, typed with a space'
);

select tests.clear_authentication();
select * from finish();
rollback;
