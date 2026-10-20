-- A Business can be paused: its owner teaches under a school for now (M9-23, D-292). Its own
-- migration, because a value added to an enum cannot be used in the same transaction.
alter type public.business_status add value if not exists 'paused';
