-- Policy-focused disposable fixture database; run after creation-ownership migration.
-- Excludes unrelated membership quota triggers. All changes roll back.
BEGIN;
INSERT INTO auth.users (id) VALUES
  ('f0000000-0000-4000-8000-000000000011'),
  ('f0000000-0000-4000-8000-000000000012');
INSERT INTO public.profile (id, username) VALUES
  ('f0000000-0000-4000-8000-000000000011', 'ownership_fixture_11'),
  ('f0000000-0000-4000-8000-000000000012', 'ownership_fixture_12');

-- Emulate extra permissive policies left over from an out-of-band schema edit.
CREATE POLICY unexpected_item_insert ON public.items FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY unexpected_showcase_insert ON public.showcase FOR INSERT TO authenticated WITH CHECK (TRUE);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000011', true);
INSERT INTO public.items (user_id, custom_title) VALUES (auth.uid(), 'Owned item');
INSERT INTO public.showcase (profile_id, name, is_public) VALUES (auth.uid(), 'Owned showcase', FALSE);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.items (user_id) VALUES ('f0000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'Creating another user item must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.showcase (profile_id) VALUES ('f0000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'Creating another user showcase must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ensure_default_showcase('f0000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'Calling privileged provisioning from the client must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.items (user_id) VALUES ('f0000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'Missing user identity must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.showcase (profile_id) VALUES ('f0000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'Anonymous showcase creation must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ensure_default_showcase('f0000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'Anonymous provisioning must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.ensure_default_showcase('f0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.showcase WHERE profile_id = 'f0000000-0000-4000-8000-000000000012' AND is_default) THEN
    RAISE EXCEPTION 'Trusted signup provisioning must still work';
  END IF;
END; $$;
RESET ROLE;
ROLLBACK;
