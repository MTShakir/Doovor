-- Structural security guarantees (NFR-SEC-01, CLAUDE.md database rules). These fail the
-- build as soon as someone adds a table, view or function that breaks the model.
begin;
select plan(6);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every public table has row-level security enabled'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'every public table has at least one policy'
);

select is_empty(
  $$ select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%') $$,
  'every security definer function pins its search_path'
);

select is_empty(
  $$ select table_name || ':' || privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') $$,
  'anon cannot write to any public table'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and coalesce((select o.option_value from pg_options_to_table(c.reloptions) o
                       where o.option_name = 'security_invoker'), 'false') <> 'true' $$,
  'every public view runs as the caller (security_invoker)'
);

-- Public RPCs are granted one by one. Add a function here only with a reason.
--   covers_postcode: a learner asks "do you teach where I live?" before they have an account,
--   and the answer is a yes or no about an area that is public on the instructor's profile
--   anyway (COV-01, COV-02).
--   invitation_details: the page an invitation link opens, read before there is an account.
--   It answers only for a token someone was actually sent, and says a name (AUTH-07).
--   slot_problem: the public booking page asks whether a slot can be taken before anybody
--   signs in, and the answer is about hours the instructor publishes anyway (BOK-02, R-04).
--   booking_page, open_slots: the booking link itself. An instructor shares it to be booked
--   from, and it answers only for one who has been verified (BOK-02, INS-02).
select is_empty(
  $$ select distinct routine_name from information_schema.routine_privileges
      where routine_schema = 'public' and grantee in ('PUBLIC', 'anon')
        and routine_name not in ('covers_postcode', 'invitation_details', 'slot_problem',
                                 'booking_page', 'open_slots') $$,
  'no public function is executable by anon unless allowlisted'
);

select * from finish();
rollback;
