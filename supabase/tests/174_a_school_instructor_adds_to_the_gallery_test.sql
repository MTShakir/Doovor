-- An instructor or manager at a school on a paid plan adds pass photos to its gallery (D-218, D-374).
begin;
select plan(8);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set instructor 'b0000000-0000-0000-0000-000000000003'
\set owner_a 'a0000000-0000-0000-0000-000000000001'
\set learner 'c0000000-0000-0000-0000-000000000001'

update public.businesses set plan = 'school' where id = :'school';

-- The school's own instructor and manager, who cannot read its billing (D-123), can ask this.
select tests.authenticate_as(:'instructor');
select is(public.gallery_is_open(:'school'), true, 'an instructor at a school on the School plan finds the gallery open');
select throws_ok(
  format('select * from public.business_billing(%L)', :'school'),
  '42501', 'NOT_ALLOWED',
  'and still cannot read what the school pays'
);

select tests.authenticate_as(:'manager');
select is(public.gallery_is_open(:'school'), true, 'so does its manager');

-- On Free it is shut, for the owner as for anybody.
select tests.clear_authentication();
update public.businesses set plan = 'free' where id = :'asha';
select tests.authenticate_as(:'owner_a');
select is(public.gallery_is_open(:'asha'), false, 'a Business on Free has no gallery');

-- Nobody outside the Business asks.
select tests.authenticate_as(:'instructor');
select throws_ok(
  format('select public.gallery_is_open(%L)', :'asha'),
  '42501', 'NOT_ALLOWED',
  'an instructor at another Business is refused'
);
select tests.authenticate_as(:'learner');
select throws_ok(
  format('select public.gallery_is_open(%L)', :'school'),
  '42501', 'NOT_ALLOWED',
  'a learner who learns there is refused'
);
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.gallery_is_open(%L)', :'school'),
  '42501', 'permission denied for function gallery_is_open',
  'and somebody signed out cannot call it at all'
);
select tests.clear_authentication();

-- The question the screens ask is the rule the database keeps when a photo is added.
update public.businesses set plan = 'free' where id = :'school';
select tests.authenticate_as(:'instructor');
select throws_ok(
  $$ select public.add_gallery_photo('bbbb0000-0000-0000-0000-000000000000/pass.jpg', current_date, null, 'Lee One') $$,
  'PLAN_REQUIRED',
  'where it says shut, adding a photo is refused too'
);
select tests.clear_authentication();

select * from finish();
rollback;
