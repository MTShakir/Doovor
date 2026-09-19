-- A skill set by hand is dated when it is set (PRG-02, D-169).
--
-- skill_assessments dated each rating with now(), which is when the transaction began, so two
-- ratings set in one transaction had the same date and the map chose between them at random
-- rather than taking the second. clock_timestamp() is the moment the rating is written, so the
-- one set last is the one the map shows.

alter table public.skill_assessments alter column assessed_at set default clock_timestamp();
