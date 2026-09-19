-- One default pickup point per learner, whoever sets it (COV-04, D-168).
--
-- The trigger that takes the default off a learner's other pickup points ran as whoever made the
-- new one the default. An instructor may change only the pickup points their Business added, so
-- when the learner's own was the default, the trigger could not take it off, and the one-default
-- rule refused the instructor's new default outright. Found writing the tests for keeping pickup
-- points from the learner's card.
--
-- It now runs as its owner. It still fires only on a pickup point the person was allowed to add
-- or change, and it still touches only that learner's other pickup points, and only their default.

alter function private.pickup_points_single_default() security definer;
