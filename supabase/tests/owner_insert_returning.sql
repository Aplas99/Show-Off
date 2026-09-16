-- Run after the showcase_ratings_and_media.sql fixture in its transaction.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ DECLARE v_item integer; v_showcase uuid; v_post bigint; BEGIN
  INSERT INTO public.items(user_id) VALUES(auth.uid()) RETURNING id INTO v_item;
  IF v_item IS NULL THEN RAISE EXCEPTION 'Item RETURNING failed'; END IF;
  INSERT INTO public.showcase(profile_id,name,is_public) VALUES(auth.uid(),'New private',FALSE) RETURNING id INTO v_showcase;
  IF v_showcase IS NULL THEN RAISE EXCEPTION 'Showcase RETURNING failed'; END IF;
  INSERT INTO public.posts(user_id,caption) VALUES(auth.uid(),'New post') RETURNING id INTO v_post;
  IF v_post IS NULL THEN RAISE EXCEPTION 'Post RETURNING failed'; END IF;
END $$;
ROLLBACK;
