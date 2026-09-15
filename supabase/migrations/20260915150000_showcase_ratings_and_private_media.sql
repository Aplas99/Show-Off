ALTER TABLE public.showcase ADD COLUMN audience_rating TEXT
  CHECK (audience_rating IN ('general', '18_plus'));
ALTER TABLE public.showcase ADD COLUMN description TEXT CHECK (length(description) <= 2000);
CREATE POLICY keep_default_showcase ON public.showcase AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT is_default);
-- Existing showcases have no classification. Owners must explicitly republish.
UPDATE public.showcase SET is_public = FALSE, visibility = 'private' WHERE is_public;
ALTER TABLE public.showcase ALTER COLUMN is_public SET DEFAULT FALSE;
ALTER TABLE public.showcase ALTER COLUMN visibility SET DEFAULT 'private';
ALTER TABLE public.showcase ADD CONSTRAINT public_showcase_requires_rating
  CHECK (NOT is_public OR audience_rating IS NOT NULL);

CREATE FUNCTION public.normalize_showcase_publication() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT NEW.is_public THEN
    NEW.audience_rating := NULL;
    NEW.visibility := 'private';
  ELSE
    IF NEW.audience_rating IS NULL THEN RAISE EXCEPTION 'Choose a public showcase audience'; END IF;
    IF NEW.audience_rating = '18_plus' AND auth.uid() IS NOT NULL AND COALESCE(public.viewer_age(), 0) < 18 THEN
      RAISE EXCEPTION 'Only adults may publish an 18+ showcase';
    END IF;
    NEW.visibility := 'public';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER normalize_showcase_publication BEFORE INSERT OR UPDATE ON public.showcase
  FOR EACH ROW EXECUTE FUNCTION public.normalize_showcase_publication();

CREATE FUNCTION public.can_view_showcase(p_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.showcase s WHERE s.id = p_id AND (
    s.profile_id = auth.uid() OR (s.is_public AND (
      s.audience_rating = 'general' OR (s.audience_rating = '18_plus' AND public.viewer_age() >= 18)
    ))
  ))
$$;
CREATE FUNCTION public.can_view_item(p_id INTEGER) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.items i WHERE i.id = p_id AND (
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
REVOKE ALL ON FUNCTION public.can_view_showcase(UUID), public.can_view_item(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_showcase(UUID), public.can_view_item(INTEGER) TO anon, authenticated, service_role;

CREATE POLICY showcase_audience_read_guard ON public.showcase AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (public.can_view_showcase(id));
CREATE POLICY item_audience_read_guard ON public.items AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (public.can_view_item(id));
CREATE POLICY link_audience_read_guard ON public.showcase_items AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (public.can_view_showcase(showcase_id) AND public.can_view_item(item_id));
ALTER VIEW public.feed_items SET (security_invoker = TRUE);

-- Replaces the old definer RPC, which bypassed every new table policy.
CREATE OR REPLACE FUNCTION public.get_public_showcase(p_showcase_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'audience_rating', s.audience_rating,
    'accent_color', s.accent_color, 'banner_image_url', s.banner_image_url, 'created_at', s.created_at,
    'owner', jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url),
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
REVOKE ALL ON FUNCTION public.get_public_showcase(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_showcase(UUID) TO anon, authenticated;

CREATE FUNCTION public.upload_url_matches(p_url TEXT, p_bucket TEXT, p_name TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(right(p_url, length('/storage/v1/object/public/' || p_bucket || '/' || p_name))
    = '/storage/v1/object/public/' || p_bucket || '/' || p_name, FALSE)
$$;
CREATE FUNCTION public.can_read_upload(p_bucket TEXT, p_name TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id UUID;
BEGIN
  IF p_bucket NOT IN ('item-images', 'post-media') OR split_part(p_name, '/', 1) !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN FALSE; END IF;
  owner_id := split_part(p_name, '/', 1)::UUID;
  IF owner_id=auth.uid() THEN RETURN TRUE; END IF;
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
      WHERE p.user_id=owner_id AND (p.item_id IS NULL OR public.can_view_item(p.item_id::INTEGER))
      AND public.upload_url_matches(pm.url,p_bucket,p_name)));
END $$;
REVOKE ALL ON FUNCTION public.upload_url_matches(TEXT,TEXT,TEXT), public.can_read_upload(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_upload(TEXT,TEXT) TO anon, authenticated, service_role;

CREATE FUNCTION public.can_view_post(p_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id=p_id AND (
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
REVOKE ALL ON FUNCTION public.can_view_post(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_post(BIGINT) TO anon, authenticated, service_role;
CREATE POLICY post_audience_read_guard ON public.posts AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (public.can_view_post(id));
DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['post_media','post_comments','post_likes','post_bookmarks'] LOOP
    EXECUTE format('CREATE POLICY post_audience_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (public.can_view_post(post_id))',target);
    EXECUTE format('CREATE POLICY post_audience_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (public.can_view_post(post_id))',target);
  END LOOP;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES
  ('item-images','item-images',FALSE,104857600,ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif']),
  ('post-media','post-media',FALSE,104857600,ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/x-m4v','video/webm'])
ON CONFLICT(id) DO UPDATE SET public=FALSE,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY upload_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (bucket_id NOT IN ('item-images','post-media') OR (
    public.can_read_upload(bucket_id,name) AND COALESCE(current_setting('storage.operation',true) IN (
      'storage.object.get_authenticated', 'storage.object.info_authenticated',
      'object.get_authenticated_info', 'object.head_authenticated_info',
      'storage.object.list', 'storage.object.list_v2',
      'storage.object.upload', 'storage.object.upload_update',
      'storage.object.delete', 'storage.object.delete_many'
    ), FALSE)
  ));
-- Signing operations are deliberately excluded: clients cannot mint a bearer
-- URL that would keep working after the viewer loses access.
CREATE POLICY permitted_upload_reads ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('item-images','post-media') AND public.can_read_upload(bucket_id,name));
CREATE POLICY upload_owner_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id NOT IN ('item-images','post-media') OR split_part(name,'/',1)=auth.uid()::TEXT);
CREATE POLICY upload_owner_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id NOT IN ('item-images','post-media') OR split_part(name,'/',1)=auth.uid()::TEXT)
  WITH CHECK (bucket_id NOT IN ('item-images','post-media') OR split_part(name,'/',1)=auth.uid()::TEXT);
CREATE POLICY upload_owner_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id NOT IN ('item-images','post-media') OR split_part(name,'/',1)=auth.uid()::TEXT);
NOTIFY pgrst, 'reload schema';
