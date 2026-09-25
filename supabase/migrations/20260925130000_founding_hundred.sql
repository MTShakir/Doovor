-- The founding offer is the first hundred instructors, not the first five hundred (D-203).
--
-- The offer's numbers have always been a setting rather than code, because they are the pricing
-- page's promise and change with it (D-128). This moves the instructor number; the schools number
-- and the twelve months stay where they are.
--
-- Anybody who already has it keeps it: the offer is recorded on the Business when it is given, and
-- lowering the limit only decides who gets one from here on.

update public.platform_settings
   set value = jsonb_set(value, '{instructor_limit}', '100'::jsonb),
       description = 'Paid plan free for 12 months for the first 100 instructors and 50 schools (PRD 9.18, D-203)'
 where key = 'founding_offer';
