-- Isolated guard fixture: content tables have id/user_id columns and broad
-- baseline policies. This is not a script for a deployed application database.
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.account_deletion_requests(user_id)
  VALUES ('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
DO $$
DECLARE target TEXT;
BEGIN
  IF NOT public.account_is_deleting() THEN RAISE EXCEPTION 'missing deletion intent'; END IF;
  BEGIN
    DELETE FROM public.account_deletion_requests;
    RAISE EXCEPTION 'client can clear deletion intent';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOREACH target IN ARRAY ARRAY[
    'public.profile', 'public.items', 'public.showcase', 'public.showcase_items',
    'public.posts', 'public.post_media', 'public.comments', 'public.post_comments',
    'public.likes', 'public.post_likes', 'public.bookmarks', 'public.post_bookmarks',
    'public.follows', 'public.showcase_members', 'public.showcase_follows',
    'public.showcase_likes', 'public.shares', 'storage.objects'
  ] LOOP
    BEGIN
      EXECUTE format('INSERT INTO %s(id,user_id) VALUES (1, auth.uid())', target);
      RAISE EXCEPTION 'write allowed while deleting: %', target;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
DO $$ BEGIN
  IF public.account_is_deleting() THEN RAISE EXCEPTION 'deletion leaks between users'; END IF;
END $$;
INSERT INTO public.items(id,user_id) VALUES (2, auth.uid());
RESET ROLE;
DELETE FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.account_deletion_requests) THEN
    RAISE EXCEPTION 'deletion intent did not cascade';
  END IF;
END $$;
ROLLBACK;
