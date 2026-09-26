-- An instructor's own colour on the page a learner sees (D-210).
begin;
select plan(15);

select tests.create_fixture();

\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'

update public.businesses set plan = 'pro' where id = :'asha_business';

-- ---------------------------------------------------------------------------------------
-- The rule, colour for colour.
--
-- The same list is in packages/core/src/colour-agreement.test.ts. Two copies of one rule drift
-- unless something holds them together, and the pair of lists is that something.
-- ---------------------------------------------------------------------------------------
-- None of these is a brand colour: this file cannot import brand.ts, and a hex value written out
-- by hand is what the copy guard exists to stop. What the brand's own colours do is asserted in
-- packages/core/src/colour.test.ts, which can read them properly.
select is(
  (select array_agg(private.readable_on_white(c) order by c)
     from unnest(array['#0B0B0B', '#1A4D8F', '#2F4F4F', '#8B0000']) as c),
  array[true, true, true, true],
  'a colour white writing reads on is usable'
);
select is(
  (select array_agg(private.readable_on_white(c) order by c)
     from unnest(array['#3DD68C', '#AFEEEE', '#F5D76E', '#FDFDFD']) as c),
  array[false, false, false, false],
  'and one it does not is refused, however much somebody likes it'
);
select is(private.readable_on_white('nonsense'), false, 'and so is something that is not a colour');
select is(private.readable_on_white(null), false, 'and nothing at all');

-- ---------------------------------------------------------------------------------------
-- Picking one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select is(public.set_brand_colour(:'asha_business', '#1a4d8f'), '#1A4D8F', 'a colour is kept the way it is written down');
select is(
  (select brand_colour from public.businesses where id = :'asha_business'),
  '#1A4D8F',
  'and it is on the Business'
);
-- The audit log is staff only, so it is read with nobody signed in rather than as the instructor.
select tests.clear_authentication();
select is(
  (select (after ->> 'colour') from public.audit_log
    where action = 'business.colour_set' and entity_id = :'asha_business'),
  '#1A4D8F',
  'and the audit row says what it became'
);

select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.set_brand_colour(%L, '#F5D76E') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'a colour nobody could read is refused'
);
select throws_ok(
  format($$ select public.set_brand_colour(%L, 'teal') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'and so is a word'
);
select is(public.set_brand_colour(:'asha_business', ''), null, 'and clearing it puts the page back to the default');

-- ---------------------------------------------------------------------------------------
-- Who may, and on what plan.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_brand_colour(%L, '#1A4D8F') $$, :'asha_business'),
  '42501', null, 'nobody paints somebody else''s page'
);

select tests.clear_authentication();
update public.businesses set plan = 'free' where id = :'asha_business';
select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.set_brand_colour(%L, '#1A4D8F') $$, :'asha_business'),
  'P0001', 'PLAN_REQUIRED', 'and Free does not carry it'
);

-- ---------------------------------------------------------------------------------------
-- What the page serves.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
update public.businesses set plan = 'pro', brand_colour = '#1A4D8F' where id = :'asha_business';
-- The fixture's instructor has not been through verification, and a link only opens for somebody
-- the platform has checked (INS-02), so this one is given both.
update public.instructor_profiles
   set verification_status = 'approved', public_slug = 'asha-colours'
 where business_id = :'asha_business';

select is(
  (public.booking_page('asha-colours') ->> 'brandColour'),
  '#1A4D8F',
  'the booking page carries the colour while the plan does'
);

update public.businesses set plan = 'free' where id = :'asha_business';
select is(
  (public.booking_page('asha-colours') ->> 'brandColour'),
  null,
  'and goes back to the default when it does not, keeping what was picked'
);
select is(
  (select brand_colour from public.businesses where id = :'asha_business'),
  '#1A4D8F',
  'and what was picked is still there for when the plan comes back'
);

select * from finish();
rollback;
