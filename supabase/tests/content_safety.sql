-- Run after showcase_ratings_and_media.sql fixture without its final rollback.
RESET ROLE;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.posts(user_id,caption) VALUES('11111111-1111-1111-1111-111111111111','kill yourself');
    RAISE EXCEPTION 'Configured text filter was bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'This text needs revision under the Community Standards. Contact support if this is a mistake' THEN RAISE; END IF;
  END;
END $$;
INSERT INTO public.moderators(user_id) VALUES('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
SELECT public.report_content('item','102','privacy','Contains personal information');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.content_reports) THEN RAISE EXCEPTION 'Reporter can read protected queue'; END IF;
  BEGIN
    INSERT INTO public.moderators VALUES(auth.uid());
    RAISE EXCEPTION 'Client self-appointed moderator';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.resolve_content_report(gen_random_uuid(),'dismiss','not allowed');
    RAISE EXCEPTION 'Non-moderator resolved report';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Moderator access required' THEN RAISE; END IF; END;
END $$;
SELECT public.set_user_block('11111111-1111-1111-1111-111111111111',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.items) OR EXISTS(SELECT 1 FROM public.posts)
    OR EXISTS(SELECT 1 FROM public.showcase) OR EXISTS(SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Blocked content/media leaked'; END IF;
  IF public.get_public_showcase('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS NOT NULL THEN
    RAISE EXCEPTION 'Public RPC bypassed block'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ BEGIN
  IF public.can_interact_with('22222222-2222-2222-2222-222222222222') THEN RAISE EXCEPTION 'Block not reciprocal'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
SELECT public.set_user_block('11111111-1111-1111-1111-111111111111',false);
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
DO $$ DECLARE report UUID; BEGIN
  SELECT id INTO report FROM public.content_reports LIMIT 1;
  PERFORM public.resolve_content_report(report,'restrict','Privacy violation confirmed');
  IF public.can_view_item(102) OR public.can_read_upload('item-images','11111111-1111-1111-1111-111111111111/general.jpg') THEN
    RAISE EXCEPTION 'Restricted item/media accessible'; END IF;
  PERFORM public.resolve_content_report(report,'restore','Appeal accepted');
  IF NOT public.can_view_item(102) THEN RAISE EXCEPTION 'Restoration failed'; END IF;
  PERFORM public.resolve_content_report(report,'suspend','Repeated safety violations');
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ BEGIN
  IF public.can_use_app() OR EXISTS(SELECT 1 FROM public.items) THEN RAISE EXCEPTION 'Suspended account still active'; END IF;
  BEGIN
    INSERT INTO public.posts(user_id,caption) VALUES(auth.uid(),'Should fail');
    RAISE EXCEPTION 'Suspended account created content';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
