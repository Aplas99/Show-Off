BEGIN;
SELECT set_config('storage.operation','storage.object.get_authenticated',true);
INSERT INTO auth.users(id,raw_app_meta_data,raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111','{"provider":"email"}','{"reported_age":30,"accepted_policy_version":"2026-09-15"}'),
  ('22222222-2222-2222-2222-222222222222','{"provider":"email"}','{"reported_age":17,"accepted_policy_version":"2026-09-15"}'),
  ('33333333-3333-3333-3333-333333333333','{"provider":"email"}','{"reported_age":18,"accepted_policy_version":"2026-09-15"}'),
  ('44444444-4444-4444-4444-444444444444','{"provider":"google"}','{}');
INSERT INTO public.showcase(id,profile_id,name,is_public,audience_rating) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Mature',true,'18_plus'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','General',true,'general'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','Private',false,'18_plus');
INSERT INTO public.items(id,user_id,image_url) VALUES
  (101,'11111111-1111-1111-1111-111111111111','https://test.supabase.co/storage/v1/object/public/item-images/11111111-1111-1111-1111-111111111111/mature.jpg'),
  (102,'11111111-1111-1111-1111-111111111111','https://test.supabase.co/storage/v1/object/public/item-images/11111111-1111-1111-1111-111111111111/general.jpg'),
  (103,'11111111-1111-1111-1111-111111111111','https://test.supabase.co/storage/v1/object/public/item-images/11111111-1111-1111-1111-111111111111/private.jpg');
INSERT INTO public.showcase_items(showcase_id,item_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',101), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',101),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',102), ('cccccccc-cccc-cccc-cccc-cccccccccccc',103);
-- Reusing a restricted file as an avatar must not bypass its media restriction.
UPDATE public.profile SET avatar_url='https://test.supabase.co/storage/v1/object/public/item-images/11111111-1111-1111-1111-111111111111/mature.jpg'
  WHERE id='11111111-1111-1111-1111-111111111111';
INSERT INTO storage.objects(bucket_id,name) VALUES
  ('item-images','11111111-1111-1111-1111-111111111111/mature.jpg'),
  ('item-images','11111111-1111-1111-1111-111111111111/general.jpg'),
  ('item-images','11111111-1111-1111-1111-111111111111/private.jpg');
INSERT INTO public.posts(user_id,item_id,caption) VALUES
  ('11111111-1111-1111-1111-111111111111',101,'Mature item'),
  ('11111111-1111-1111-1111-111111111111',102,'General item');
DO $$ BEGIN
  IF (SELECT audience_rating FROM public.showcase WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc') IS NOT NULL THEN
    RAISE EXCEPTION 'private showcase kept a rating'; END IF;
  BEGIN
    INSERT INTO public.showcase(profile_id,is_public) VALUES ('11111111-1111-1111-1111-111111111111',true);
    RAISE EXCEPTION 'public showcase lacked classification';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Choose a public showcase audience' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.items) <> 1 THEN RAISE EXCEPTION 'teen item restriction bypass'; END IF;
  IF (SELECT count(*) FROM public.posts) <> 1 THEN RAISE EXCEPTION 'restricted post preview leaked'; END IF;
  IF (SELECT count(*) FROM public.showcase) <> 1 THEN RAISE EXCEPTION 'teen showcase restriction bypass'; END IF;
  IF (SELECT count(*) FROM public.feed_items) <> 1 THEN RAISE EXCEPTION 'feed view bypassed item RLS'; END IF;
  IF public.get_public_showcase('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') IS NOT NULL THEN RAISE EXCEPTION 'public RPC leaked restricted details'; END IF;
  IF jsonb_array_length(public.get_public_showcase('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->'items') <> 1 THEN RAISE EXCEPTION 'reused restricted item leaked'; END IF;
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'teen media restriction bypass'; END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name) VALUES ('item-images','11111111-1111-1111-1111-111111111111/forged.jpg');
    RAISE EXCEPTION 'foreign upload admitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.items) <> 2 OR (SELECT count(*) FROM storage.objects) <> 2 THEN RAISE EXCEPTION 'adult access incorrect'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.items) <> 1 OR (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'unknown-age access incorrect'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.items) <> 3 OR (SELECT count(*) FROM storage.objects) <> 3 THEN RAISE EXCEPTION 'owner access incorrect'; END IF;
END $$;
SELECT set_config('storage.operation','storage.object.sign',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'client signed URL bypass'; END IF;
END $$;
SELECT set_config('storage.operation','storage.object.get_authenticated',true);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.showcase) <> 1 OR (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'anonymous restriction bypass'; END IF;
END $$;
ROLLBACK;
