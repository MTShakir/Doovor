-- A school recommends a price an hour to its linked instructors and may set the most they charge,
-- never a fixed or lowest price; the database holds their prices to the most when they change them
-- (M9-10, D-286).
begin;
select plan(19);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_type 'a2000000-0000-0000-0000-000000000001'

-- Who may say it: whoever sets the school's own prices.
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_linked_price_guide(%L, 4000, 4500) $$, :'school'),
  'the owner recommends £40 an hour and allows at most £45'
);
select is(
  (select array[linked_recommended_hourly_pence, linked_max_hourly_pence] from public.businesses where id = :'school'),
  array[4000, 4500],
  'and the school keeps both'
);
select tests.authenticate_as(:'manager');
select lives_ok(
  format($$ select public.set_linked_price_guide(%L, 4000, 4500) $$, :'school'),
  'a manager, who sets the school''s prices, may too'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_linked_price_guide(%L, 3000, null) $$, :'school'),
  'NOT_ALLOWED',
  'an instructor at the school may not'
);
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.set_linked_price_guide(%L, 3000, null) $$, :'school'),
  'NOT_ALLOWED',
  'nor anybody outside it'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_linked_price_guide(%L, 5000, 4500) $$, :'school'),
  'VALIDATION_FAILED',
  'a recommended price above the most is refused'
);

-- Before she links, Asha charges £50 an hour and sells ten hours for £500.
select tests.authenticate_as(:'asha_user');
select public.set_lesson_prices(:'asha_biz', jsonb_build_array(jsonb_build_object('lesson_type_id', :'asha_type', 'duration_minutes', 60, 'price_pence', 5000)));
insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id)
values (:'asha_biz', '10 hours', 600, 50000, :'asha_type');

reset role;
insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');

select tests.authenticate_as(:'asha_user');
select is(
  public.school_link_of(:'asha_biz') -> 'maxHourlyPence',
  '4500'::jsonb,
  'linked, she can read the most the school allows'
);
select is(
  public.school_link_of(:'asha_biz') -> 'recommendedHourlyPence',
  '4000'::jsonb,
  'and what it recommends'
);
select throws_ok(
  format($$ select public.set_lesson_prices(%L, jsonb_build_array(jsonb_build_object('lesson_type_id', %L, 'duration_minutes', 60, 'price_pence', 4600))) $$,
         :'asha_biz', :'asha_type'),
  'VALIDATION_FAILED',
  'a price above the most is refused'
);
select lives_ok(
  format($$ select public.set_lesson_prices(%L, jsonb_build_array(jsonb_build_object('lesson_type_id', %L, 'duration_minutes', 120, 'price_pence', 9000))) $$,
         :'asha_biz', :'asha_type'),
  'two hours at £90 is £45 an hour, which is allowed'
);
select lives_ok(
  format($$ select public.set_lesson_prices(%L, jsonb_build_array(
                     jsonb_build_object('lesson_type_id', %L, 'duration_minutes', 60, 'price_pence', 5000),
                     jsonb_build_object('lesson_type_id', %L, 'duration_minutes', 120, 'price_pence', 8800))) $$,
         :'asha_biz', :'asha_type', :'asha_type'),
  'a price she set before linking stays while she changes another'
);
select is(
  (select price_pence from public.lesson_prices where business_id = :'asha_biz' and duration_minutes = 60),
  5000,
  'and nothing lowers it for her'
);
select throws_ok(
  format($$ insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id) values (%L, '20 hours', 1200, 92000, %L) $$,
         :'asha_biz', :'asha_type'),
  'VALIDATION_FAILED',
  'a package above the most an hour is refused'
);
select lives_ok(
  format($$ insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id) values (%L, '20 hours', 1200, 90000, %L) $$,
         :'asha_biz', :'asha_type'),
  'and one at it is allowed'
);
select lives_ok(
  format($$ update public.packages set name = 'Ten hours' where business_id = %L and minutes = 600 $$, :'asha_biz'),
  'a package from before can be renamed'
);
select lives_ok(
  format($$ update public.packages set is_active = false where business_id = %L and minutes = 600 $$, :'asha_biz'),
  'and taken off sale'
);
select throws_ok(
  format($$ update public.packages set is_active = true where business_id = %L and minutes = 600 $$, :'asha_biz'),
  'VALIDATION_FAILED',
  'but not put back on sale above the most'
);

reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'school.price_guide_set' and business_id = :'school'),
  2,
  'each change is written down'
);

-- Once she leaves, her prices are hers alone again.
update public.school_links set status = 'ended', ended_at = now(), end_reason = 'left', ended_by = :'asha_user'
 where business_id = :'asha_biz';
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.set_lesson_prices(%L, jsonb_build_array(jsonb_build_object('lesson_type_id', %L, 'duration_minutes', 60, 'price_pence', 6000))) $$,
         :'asha_biz', :'asha_type'),
  'unlinked, any price is hers to set'
);

select * from finish();
rollback;
