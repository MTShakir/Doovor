-- The founder is D000001 and the first report is R01, after the launch wipe as well (D-176, D-246).
--
-- Emptying the database for the launch (RUNBOOK 3.9) truncates every table with RESTART IDENTITY,
-- which puts back to its start every sequence owned by a column of a truncated table, and only
-- those. Two sequences were made on their own and handed to a column as its default, so nothing
-- owned them and the truncate went straight past them:
--
--   platform_number_seq     the D number everybody has. The new super admin would have been
--                           D0000 and whatever the demo accounts reached, not D000001.
--   feedback_reference_seq  the R number on a report. The first real one would have carried on
--                           from the last demo report, not been R01.
--
-- Owning them by their columns is what makes the truncate restart them. Nothing else changes:
-- in ordinary running nothing truncates either table, so D-176's promise that a number is never
-- given to anybody else still holds. A launch wipe is the one moment it is meant to start again,
-- because everybody it was promised to has gone with it.

alter sequence public.platform_number_seq owned by public.users.platform_number;
alter sequence public.feedback_reference_seq owned by public.feedback_submissions.reference;
