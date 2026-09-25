-- A lesson record with nothing compulsory in it (PRG-01, D-201).
--
-- The record asked for a line about the lesson and at least one skill before it would save. An
-- instructor standing on a pavement between lessons has about a minute, and a record that refuses
-- to save is a record that does not get written at all: the summary that was demanded arrives as
-- a full stop, and the skill that was demanded is whichever one was nearest the thumb.
--
-- Anything written is worth more than everything demanded, so all of it is optional now. What was
-- already required stays valid; only the floor moves.

alter table public.lesson_records
  alter column summary drop not null,
  drop constraint lesson_records_summary_check,
  add constraint lesson_records_summary_check
    check (summary is null or char_length(btrim(summary)) between 1 and 500);
