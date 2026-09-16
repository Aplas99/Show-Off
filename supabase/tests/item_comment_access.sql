-- Disposable policy fixtures without unrelated membership/notification triggers.
-- Requires captured item/showcase/comment policies and the comment migration.
BEGIN;
INSERT INTO auth.users (id) VALUES
  ('f0000000-0000-4000-8000-000000000031'),
  ('f0000000-0000-4000-8000-000000000032');
INSERT INTO public.profile (id, username) VALUES
  ('f0000000-0000-4000-8000-000000000031', 'comment_fixture_31'),
  ('f0000000-0000-4000-8000-000000000032', 'comment_fixture_32');
INSERT INTO public.showcase (id, profile_id, name, is_public) VALUES
  ('f0000000-0000-4000-8000-000000000131', 'f0000000-0000-4000-8000-000000000032', 'Private', FALSE),
  ('f0000000-0000-4000-8000-000000000132', 'f0000000-0000-4000-8000-000000000032', 'Public', TRUE);
INSERT INTO public.items (id, user_id, is_public) VALUES
  (2000000031, 'f0000000-0000-4000-8000-000000000031', FALSE),
  (2000000032, 'f0000000-0000-4000-8000-000000000032', TRUE),
  (2000000033, 'f0000000-0000-4000-8000-000000000032', FALSE);
INSERT INTO public.showcase_items (showcase_id, item_id) VALUES
  ('f0000000-0000-4000-8000-000000000131', 2000000032),
  ('f0000000-0000-4000-8000-000000000132', 2000000033);
INSERT INTO public.comments (id, item_id, user_id, content) VALUES
  ('f0000000-0000-4000-8000-000000000231', 2000000031, 'f0000000-0000-4000-8000-000000000031', 'Own item comment'),
  ('f0000000-0000-4000-8000-000000000232', 2000000032, 'f0000000-0000-4000-8000-000000000031', 'Previously visible comment'),
  ('f0000000-0000-4000-8000-000000000233', 2000000033, 'f0000000-0000-4000-8000-000000000032', 'Public item comment');

CREATE POLICY unexpected_comment_read ON public.comments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY unexpected_comment_insert ON public.comments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY unexpected_comment_update ON public.comments FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000031', true);
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.comments;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Only owned or accessible item comments should be readable'; END IF;
  IF EXISTS (SELECT 1 FROM public.comments WHERE item_id = 2000000032) THEN
    RAISE EXCEPTION 'A private parent must hide even a viewer-authored comment';
  END IF;
  BEGIN
    INSERT INTO public.comments (item_id, user_id, content) VALUES (2000000032, auth.uid(), 'Forbidden');
    RAISE EXCEPTION 'Private parent commenting must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.comments (item_id, user_id, content)
    VALUES (2000000033, 'f0000000-0000-4000-8000-000000000032', 'Forged author');
    RAISE EXCEPTION 'Author forgery must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.comments SET content = 'Own edit' WHERE id = 'f0000000-0000-4000-8000-000000000231';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Own content editing must work'; END IF;
  UPDATE public.comments SET content = 'Forbidden edit' WHERE id = 'f0000000-0000-4000-8000-000000000233';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Other authors comments must not be editable'; END IF;
  BEGIN
    UPDATE public.comments SET item_id = 2000000033 WHERE id = 'f0000000-0000-4000-8000-000000000231';
    RAISE EXCEPTION 'Comment parent reassignment must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
INSERT INTO public.comments (item_id, user_id, content) VALUES (2000000033, auth.uid(), 'Allowed public comment');

-- Access is evaluated on each request after a showcase changes visibility.
RESET ROLE;
UPDATE public.showcase SET is_public = FALSE WHERE id = 'f0000000-0000-4000-8000-000000000132';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.comments WHERE item_id = 2000000033) THEN
    RAISE EXCEPTION 'Publishing state changes must immediately hide comments';
  END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub', '', true);
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.comments) THEN RAISE EXCEPTION 'Anonymous direct reads must stay unavailable'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;
