-- Moderation authority is service-managed, never a client-editable profile flag.
CREATE TABLE public.moderators (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_reverse_idx ON public.user_blocks(blocked_id,blocker_id);
CREATE TABLE public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('account','item','showcase','post','comment','post_comment')),
  target_id TEXT NOT NULL,
  target_owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK(reason IN ('harassment','hate','sexual','violence','child_safety','scam','privacy','other')),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details)<=2000),
  context JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  resolution TEXT CHECK(length(resolution)<=2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX reports_queue_idx ON public.content_reports(status,created_at);
CREATE INDEX reports_reporter_idx ON public.content_reports(reporter_id,created_at);
CREATE TABLE public.content_restrictions (
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(target_type,target_id)
);
CREATE TABLE public.moderation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.content_reports(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['moderators','user_blocks','content_reports','content_restrictions','moderation_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
END $$;
CREATE FUNCTION public.is_moderator() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.moderators WHERE user_id=auth.uid())
$$;
CREATE FUNCTION public.content_is_restricted(kind TEXT,target TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.content_restrictions WHERE target_type=kind AND target_id=target)
$$;
CREATE FUNCTION public.can_interact_with(owner_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT public.content_is_restricted('account',owner_id::TEXT)
    AND NOT public.content_is_restricted('account',auth.uid()::TEXT)
    AND NOT EXISTS(SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id=auth.uid() AND b.blocked_id=owner_id)
         OR (b.blocked_id=auth.uid() AND b.blocker_id=owner_id))
$$;
REVOKE ALL ON FUNCTION public.is_moderator(),public.content_is_restricted(TEXT,TEXT),public.can_interact_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator(),public.content_is_restricted(TEXT,TEXT),public.can_interact_with(UUID) TO anon,authenticated,service_role;
CREATE POLICY own_blocks ON public.user_blocks FOR SELECT TO authenticated USING(blocker_id=auth.uid());
CREATE POLICY moderator_reports ON public.content_reports FOR SELECT TO authenticated USING(public.is_moderator());
CREATE POLICY moderator_events ON public.moderation_events FOR SELECT TO authenticated USING(public.is_moderator());
GRANT SELECT ON public.user_blocks,public.content_reports,public.moderation_events TO authenticated;

-- Remove a legacy privilege-escalation path if an untracked is_admin column exists.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.profile'::regclass AND attname='is_admin' AND NOT attisdropped) THEN
    REVOKE UPDATE(is_admin) ON public.profile FROM PUBLIC,anon,authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_use_app() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT public.account_is_deleting() AND NOT public.content_is_restricted('account',auth.uid()::TEXT) AND EXISTS(SELECT 1 FROM public.profile p WHERE p.id=auth.uid() AND p.reported_age>=13 AND p.age_recorded_at<=current_date AND p.accepted_policy_version='2026-09-15')
$$;
GRANT EXECUTE ON FUNCTION public.can_use_app() TO anon,authenticated,service_role;
-- Cover legacy tables which were not all included in the earlier standards guard.
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['profile','items','showcase','showcase_items','posts','post_media','comments','post_comments','likes','bookmarks','post_likes','post_bookmarks','follows','showcase_follows','showcase_likes','showcase_members','shares'] LOOP
    EXECUTE format('CREATE POLICY active_account_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.content_is_restricted(''account'',auth.uid()::TEXT))',tab);
    EXECUTE format('CREATE POLICY active_account_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.content_is_restricted(''account'',auth.uid()::TEXT)) WITH CHECK (NOT public.content_is_restricted(''account'',auth.uid()::TEXT))',tab);
  END LOOP;
END $$;
CREATE POLICY active_account_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.can_use_app());
CREATE POLICY active_account_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.can_use_app()) WITH CHECK(public.can_use_app());

CREATE FUNCTION public.set_user_block(p_user_id UUID,p_blocked BOOLEAN) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.can_use_app() OR p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  IF p_blocked THEN
    INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(auth.uid(),p_user_id) ON CONFLICT DO NOTHING;
    DELETE FROM public.follows WHERE (follower_id=auth.uid() AND following_id=p_user_id) OR (follower_id=p_user_id AND following_id=auth.uid());
  ELSE DELETE FROM public.user_blocks WHERE blocker_id=auth.uid() AND blocked_id=p_user_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_user_block(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_block(UUID,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_showcase(p_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.showcase s WHERE s.id = p_id AND public.can_interact_with(s.profile_id) AND NOT public.content_is_restricted('showcase',s.id::TEXT) AND (
    s.profile_id = auth.uid() OR (s.is_public AND (
      s.audience_rating = 'general' OR (s.audience_rating = '18_plus' AND public.viewer_age() >= 18)
    ))
  ))
$$;

CREATE OR REPLACE FUNCTION public.can_view_item(p_id INTEGER) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.items i WHERE i.id = p_id AND public.can_interact_with(i.user_id) AND NOT public.content_is_restricted('item',i.id::TEXT) AND (
    i.user_id = auth.uid() OR (
      EXISTS (SELECT 1 FROM public.showcase_items si JOIN public.showcase s ON s.id=si.showcase_id
        WHERE si.item_id=i.id AND s.profile_id=i.user_id AND s.is_public AND public.can_view_showcase(s.id))
      AND (public.viewer_age() >= 18 OR NOT EXISTS (
        SELECT 1 FROM public.showcase_items si JOIN public.showcase s ON s.id=si.showcase_id
        WHERE si.item_id=i.id AND s.profile_id=i.user_id AND s.is_public AND s.audience_rating='18_plus'
      ))
    )
  ))
$$;

CREATE OR REPLACE FUNCTION public.can_read_upload(p_bucket TEXT, p_name TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id UUID;
BEGIN
  IF p_bucket NOT IN ('item-images', 'post-media') OR split_part(p_name, '/', 1) !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN FALSE; END IF;
  owner_id := split_part(p_name, '/', 1)::UUID;
  IF NOT public.can_interact_with(owner_id) THEN RETURN FALSE; END IF;
  IF owner_id=auth.uid() THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.items i WHERE i.user_id=owner_id AND public.content_is_restricted('item',i.id::TEXT)
    AND (public.upload_url_matches(i.image_url,p_bucket,p_name) OR EXISTS(SELECT 1 FROM unnest(i.image_urls) u WHERE public.upload_url_matches(u,p_bucket,p_name))))
    OR EXISTS(SELECT 1 FROM public.post_media pm JOIN public.posts p ON p.id=pm.post_id WHERE p.user_id=owner_id
      AND public.content_is_restricted('post',p.id::TEXT) AND public.upload_url_matches(pm.url,p_bucket,p_name))
    OR EXISTS(SELECT 1 FROM public.showcase s WHERE s.profile_id=owner_id AND public.content_is_restricted('showcase',s.id::TEXT)
      AND public.upload_url_matches(s.banner_image_url,p_bucket,p_name)) THEN RETURN FALSE; END IF;
  -- The strictest public rating wins even when the same file is reused in an
  -- avatar, post, banner, or another general showcase.
  IF COALESCE(public.viewer_age(), 0) < 18 AND EXISTS (
    SELECT 1 FROM public.showcase s WHERE s.profile_id=owner_id AND s.is_public AND s.audience_rating='18_plus'
    AND (public.upload_url_matches(s.banner_image_url,p_bucket,p_name) OR EXISTS (
      SELECT 1 FROM public.showcase_items si JOIN public.items i ON i.id=si.item_id
      WHERE si.showcase_id=s.id AND i.user_id=owner_id AND (
        public.upload_url_matches(i.image_url,p_bucket,p_name) OR EXISTS (
          SELECT 1 FROM unnest(i.image_urls) u WHERE public.upload_url_matches(u,p_bucket,p_name)
        )
      )
    ))
  ) THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.items i WHERE i.user_id=owner_id AND public.can_view_item(i.id)
      AND (public.upload_url_matches(i.image_url,p_bucket,p_name) OR EXISTS (
        SELECT 1 FROM unnest(i.image_urls) u WHERE public.upload_url_matches(u,p_bucket,p_name))))
    OR EXISTS (SELECT 1 FROM public.showcase s WHERE s.profile_id=owner_id AND s.is_public
      AND public.can_view_showcase(s.id) AND public.upload_url_matches(s.banner_image_url,p_bucket,p_name))
    OR EXISTS (SELECT 1 FROM public.profile p WHERE p.id=owner_id
      AND public.upload_url_matches(p.avatar_url,p_bucket,p_name))
    OR (public.can_use_app() AND EXISTS (SELECT 1 FROM public.post_media pm JOIN public.posts p ON p.id=pm.post_id
      WHERE p.user_id=owner_id AND NOT public.content_is_restricted('post',p.id::TEXT) AND (p.item_id IS NULL OR public.can_view_item(p.item_id::INTEGER))
      AND public.upload_url_matches(pm.url,p_bucket,p_name)));
END $$;

CREATE OR REPLACE FUNCTION public.can_view_post(p_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id=p_id AND public.can_interact_with(p.user_id) AND NOT public.content_is_restricted('post',p.id::TEXT) AND (
    p.user_id=auth.uid() OR (public.can_use_app()
      AND (p.item_id IS NULL OR public.can_view_item(p.item_id::INTEGER))
      AND NOT EXISTS (
        SELECT 1 FROM public.post_media pm,
          LATERAL regexp_match(pm.url, '/storage/v1/object/public/(item-images|post-media)/(.*)$') m
        WHERE pm.post_id=p.id AND NOT public.can_read_upload(m[1],m[2])
      )
    )
  ))
$$;

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids UUID[])
RETURNS TABLE(id UUID,username TEXT,first_name TEXT,last_name TEXT,avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,p.username::TEXT,p.first_name::TEXT,p.last_name::TEXT,p.avatar_url::TEXT
  FROM public.profile p WHERE p.id=ANY(p_user_ids[1:100]) AND auth.uid() IS NOT NULL AND public.can_interact_with(p.id)
$$;
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['comments','post_comments'] LOOP
    EXECUTE format('CREATE POLICY comment_author_safety ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (public.can_interact_with(user_id) AND NOT public.content_is_restricted(%L,id::TEXT))',tab,CASE WHEN tab='comments' THEN 'comment' ELSE 'post_comment' END);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['likes','bookmarks','shares'] LOOP
    EXECUTE format('CREATE POLICY item_visibility_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND public.can_view_item(item_id::INTEGER))',tab);
    EXECUTE format('CREATE POLICY item_visibility_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_view_item(item_id::INTEGER))',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['showcase_follows','showcase_likes','showcase_members'] LOOP
    EXECUTE format('CREATE POLICY showcase_safety_read ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (public.can_view_showcase(showcase_id))',tab);
    EXECUTE format('CREATE POLICY showcase_safety_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_view_showcase(showcase_id))',tab);
  END LOOP;
END $$;
CREATE POLICY follow_safety_insert ON public.follows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(follower_id=auth.uid() AND public.can_interact_with(following_id));
CREATE POLICY follow_safety_read ON public.follows AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.can_interact_with(follower_id) AND public.can_interact_with(following_id));
CREATE POLICY notification_safety_read ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
  USING(user_id=auth.uid() AND public.can_interact_with(actor_id));

CREATE FUNCTION public.report_content(p_type TEXT,p_id TEXT,p_reason TEXT,p_details TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_owner UUID; snapshot JSONB; report_id UUID;
BEGIN
  IF NOT public.can_use_app() THEN RAISE EXCEPTION 'Sign in to report content'; END IF;
  IF p_type='account' THEN
    SELECT id,jsonb_build_object('username',username,'bio',left(bio,2000)) INTO target_owner,snapshot FROM public.profile
      WHERE id=p_id::UUID AND public.can_interact_with(id);
  ELSIF p_type='item' THEN
    SELECT user_id,jsonb_build_object('title',custom_title,'description',left(user_description,2000),'image_url',image_url)
      INTO target_owner,snapshot FROM public.items WHERE id=p_id::INTEGER AND public.can_view_item(id);
  ELSIF p_type='showcase' THEN
    SELECT profile_id,jsonb_build_object('name',name,'description',description,'rating',audience_rating)
      INTO target_owner,snapshot FROM public.showcase WHERE id=p_id::UUID AND public.can_view_showcase(id);
  ELSIF p_type='post' THEN
    SELECT user_id,jsonb_build_object('caption',left(caption,2000),'media',(SELECT jsonb_agg(jsonb_build_object('url',url,'type',media_type)) FROM public.post_media WHERE post_id=p.id))
      INTO target_owner,snapshot FROM public.posts p WHERE id=p_id::BIGINT AND public.can_view_post(id);
  ELSIF p_type='comment' THEN
    SELECT user_id,jsonb_build_object('content',left(content,2000),'item_id',item_id) INTO target_owner,snapshot
      FROM public.comments WHERE id=p_id::UUID AND public.can_view_item(item_id) AND public.can_interact_with(user_id);
  ELSIF p_type='post_comment' THEN
    SELECT user_id,jsonb_build_object('content',left(content,2000),'post_id',post_id) INTO target_owner,snapshot
      FROM public.post_comments WHERE id=p_id::BIGINT AND public.can_view_post(post_id) AND public.can_interact_with(user_id);
  ELSE RAISE EXCEPTION 'Unsupported report target'; END IF;
  IF target_owner IS NULL THEN RAISE EXCEPTION 'Content unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT,42));
  IF (SELECT count(*) FROM public.content_reports WHERE reporter_id=auth.uid() AND created_at>now()-interval '1 day') >=20 THEN
    RAISE EXCEPTION 'Daily report limit reached. Contact support for urgent concerns';
  END IF;
  INSERT INTO public.content_reports(reporter_id,target_type,target_id,target_owner,reason,details,context)
    VALUES(auth.uid(),p_type,p_id,target_owner,p_reason,coalesce(p_details,''),snapshot) RETURNING id INTO report_id;
  RETURN report_id;
END $$;
REVOKE ALL ON FUNCTION public.report_content(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.resolve_content_report(p_report_id UUID,p_action TEXT,p_note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE report public.content_reports;
BEGIN
  IF NOT public.is_moderator() THEN RAISE EXCEPTION 'Moderator access required'; END IF;
  IF p_note IS NULL OR length(btrim(p_note))<3 OR length(p_note)>2000 THEN RAISE EXCEPTION 'A resolution note is required'; END IF;
  SELECT * INTO report FROM public.content_reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF p_action='restrict' THEN
    INSERT INTO public.content_restrictions(target_type,target_id,reason,moderator_id)
      VALUES(report.target_type,report.target_id,p_note,auth.uid()) ON CONFLICT(target_type,target_id)
      DO UPDATE SET reason=excluded.reason,moderator_id=excluded.moderator_id,created_at=now();
  ELSIF p_action='suspend' THEN
    IF report.target_owner IS NULL THEN RAISE EXCEPTION 'Account no longer exists'; END IF;
    INSERT INTO public.content_restrictions(target_type,target_id,reason,moderator_id)
      VALUES('account',report.target_owner::TEXT,p_note,auth.uid()) ON CONFLICT(target_type,target_id)
      DO UPDATE SET reason=excluded.reason,moderator_id=excluded.moderator_id,created_at=now();
  ELSIF p_action='restore' THEN
    DELETE FROM public.content_restrictions WHERE target_type=report.target_type AND target_id=report.target_id;
  ELSIF p_action='unsuspend' THEN
    DELETE FROM public.content_restrictions WHERE target_type='account' AND target_id=report.target_owner::TEXT;
  ELSIF p_action='rate_18' AND report.target_type='showcase' THEN
    UPDATE public.showcase SET audience_rating='18_plus' WHERE id=report.target_id::UUID AND is_public;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only public showcases can be rated'; END IF;
  ELSIF p_action<>'dismiss' THEN RAISE EXCEPTION 'Unsupported moderation action'; END IF;
  UPDATE public.content_reports SET status=CASE WHEN p_action='dismiss' THEN 'dismissed' ELSE 'resolved' END,
    resolution=p_note,resolved_at=now(),resolved_by=auth.uid() WHERE id=p_report_id;
  INSERT INTO public.moderation_events(moderator_id,report_id,action,note) VALUES(auth.uid(),p_report_id,p_action,p_note);
END $$;
REVOKE ALL ON FUNCTION public.resolve_content_report(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_content_report(UUID,TEXT,TEXT) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.get_public_showcase(p_showcase_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'audience_rating', s.audience_rating,
    'accent_color', s.accent_color, 'banner_image_url', s.banner_image_url, 'created_at', s.created_at,
    'owner', jsonb_build_object('id',p.id,'username', p.username, 'avatar_url', p.avatar_url),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'price', i.price, 'currency_code', i.currency_code,
      'custom_title', i.custom_title, 'image_url', i.image_url,
      'pokemon_tcg_card_id', i.pokemon_tcg_card_id, 'card_name', c.name,
      'card_image_small', c.image_small, 'card_image_large', c.image_large,
      'card_set_name', c.set_name, 'card_number', c.number, 'card_rarity', c.rarity
    ) ORDER BY i.created_at DESC, i.id DESC)
      FROM public.showcase_items si JOIN public.items i ON i.id=si.item_id
      LEFT JOIN public.pokemon_tcg_cards c ON c.id=i.pokemon_tcg_card_id
      WHERE si.showcase_id=s.id AND i.user_id=s.profile_id AND public.can_view_item(i.id)), '[]'::JSONB)
  ) FROM public.showcase s JOIN public.profile p ON p.id=s.profile_id
  WHERE s.id=p_showcase_id AND s.is_public AND public.can_view_showcase(s.id)
$$;

CREATE OR REPLACE FUNCTION public.normalize_showcase_publication() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT NEW.is_public THEN
    NEW.audience_rating := NULL;
    NEW.visibility := 'private';
  ELSE
    IF NEW.audience_rating IS NULL THEN RAISE EXCEPTION 'Choose a public showcase audience'; END IF;
    IF NEW.audience_rating = '18_plus' AND auth.uid() IS NOT NULL AND NOT public.is_moderator() AND COALESCE(public.viewer_age(), 0) < 18 THEN
      RAISE EXCEPTION 'Only adults may publish an 18+ showcase';
    END IF;
    NEW.visibility := 'public';
  END IF;
  RETURN NEW;
END $$;

-- Configurable text filter. Image/video review remains an operator task.
CREATE TABLE public.prohibited_content_patterns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pattern TEXT NOT NULL CHECK(length(pattern)<=500),
  reason TEXT NOT NULL
);
ALTER TABLE public.prohibited_content_patterns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prohibited_content_patterns FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.prohibited_content_patterns TO service_role;
INSERT INTO public.prohibited_content_patterns(pattern,reason) VALUES
  ('(?i)\m(child|minor)[ -]*(porn|pornography|sexual exploitation)\M','Child sexual exploitation'),
  ('(?i)\m(kill|murder)[[:space:]]+(yourself|all[[:space:]]+(women|men|jews|muslims|christians|blacks|whites))\M','Threats or hateful incitement');
CREATE FUNCTION public.filter_content_text() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE text_value TEXT; rule RECORD;
BEGIN
  text_value := CASE TG_TABLE_NAME
    WHEN 'profile' THEN concat_ws(' ',to_jsonb(NEW)->>'username',to_jsonb(NEW)->>'bio',to_jsonb(NEW)->>'first_name',to_jsonb(NEW)->>'last_name')
    WHEN 'items' THEN concat_ws(' ',to_jsonb(NEW)->>'custom_title',to_jsonb(NEW)->>'user_description',to_jsonb(NEW)->>'custom_brand')
    WHEN 'showcase' THEN concat_ws(' ',to_jsonb(NEW)->>'name',to_jsonb(NEW)->>'description')
    WHEN 'posts' THEN to_jsonb(NEW)->>'caption'
    ELSE to_jsonb(NEW)->>'content' END;
  FOR rule IN SELECT pattern,reason FROM public.prohibited_content_patterns LOOP
    IF text_value ~ rule.pattern THEN
      RAISE EXCEPTION 'This text needs revision under the Community Standards. Contact support if this is a mistake';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['profile','items','showcase','posts','comments','post_comments'] LOOP
    EXECUTE format('CREATE TRIGGER filter_content_text BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.filter_content_text()',tab);
  END LOOP;
END $$;
