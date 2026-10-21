-- Accounts made for a learner by hand, and not yet claimed, say so as every one made from now on
-- does (LRN-03, D-068, D-331). Confirming one by email then asks its owner for a password, which
-- signing up over it never kept.
--
-- An account somebody made for themselves carries the version of the terms its sign-up form
-- recorded (D-265), so a learner's account without it, never confirmed and never signed in to, is
-- one an instructor or a school made for them.
update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"made_for_them": true}'::jsonb
 where email_confirmed_at is null
   and last_sign_in_at is null
   and coalesce(raw_user_meta_data ->> 'intended_role', '') = 'learner'
   and not (coalesce(raw_user_meta_data, '{}'::jsonb) ? 'terms_version')
   and not (coalesce(raw_user_meta_data, '{}'::jsonb) ? 'made_for_them');
