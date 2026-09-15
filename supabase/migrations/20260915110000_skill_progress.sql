-- Where a learner is with each area of the skill map (PRG-03, M4-07).
--
-- One row for each area a learner has been rated in: the rating from the latest lesson that rated
-- it, when that lesson was, and how many lessons have rated it. The latest lesson is the one that
-- happened last, not the record that arrived last: a record written with no signal can arrive days
-- after a newer one. The view runs as whoever reads it, so each reader's map is made of the records
-- they may read, the learner's from every Business they learn with and a Business's from its own.
-- It is rolled up here rather than on the page, so a learner rated hundreds of times is still at
-- most 23 rows, well inside the most the API returns at once.

create view public.skill_progress
with (security_invoker = true)
as
select distinct on (sr.learner_id, sr.skill_code)
       sr.learner_id,
       sr.skill_code,
       sr.rating,
       r.lesson_starts_at as last_rated_at,
       (count(*) over (partition by sr.learner_id, sr.skill_code))::integer as times
  from public.skill_ratings sr
  join public.lesson_records r on r.id = sr.lesson_record_id
 order by sr.learner_id, sr.skill_code, r.lesson_starts_at desc, r.id desc;

comment on view public.skill_progress is
  'Each area a learner has been rated in, at its rating from the latest lesson that rated it (PRG-03). Made of the records the reader may read.';

grant select on public.skill_progress to authenticated;
