ALTER TABLE public.profile
  ADD COLUMN reported_age SMALLINT CHECK (reported_age BETWEEN 13 AND 120),
  ADD COLUMN age_recorded_at DATE,
  ADD COLUMN accepted_policy_version TEXT,
  ADD COLUMN policy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profile ADD CONSTRAINT profile_age_pair
  CHECK ((reported_age IS NULL) = (age_recorded_at IS NULL));

-- A direct profile update cannot forge age, recording time, or consent.
-- Preserve editable legacy columns while removing any column-level overrides.
DO $$
DECLARE column_name TEXT; editable TEXT;
BEGIN
  REVOKE INSERT, UPDATE, DELETE ON public.profile FROM PUBLIC, anon, authenticated;
  FOR column_name IN SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = 'public.profile'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.profile FROM PUBLIC, anon, authenticated', column_name, column_name);
  END LOOP;
  SELECT string_agg(quote_ident(a.attname), ', ') INTO editable FROM pg_attribute a
    WHERE a.attrelid = 'public.profile'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname NOT IN ('id', 'created_at', 'reported_age', 'age_recorded_at', 'accepted_policy_version', 'policy_accepted_at');
  EXECUTE format('GRANT UPDATE (%s) ON public.profile TO authenticated', editable);
END $$;
CREATE POLICY profile_private_read_guard ON public.profile AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (id = auth.uid());

CREATE FUNCTION public.viewer_age()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT p.reported_age + extract(year FROM age(current_date, p.age_recorded_at))::INTEGER
  FROM public.profile p WHERE p.id = auth.uid() AND p.age_recorded_at <= current_date $$;
CREATE FUNCTION public.can_use_app()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT NOT public.account_is_deleting() AND EXISTS (
  SELECT 1 FROM public.profile p WHERE p.id = auth.uid()
    AND p.reported_age >= 13 AND p.age_recorded_at <= current_date
    AND p.accepted_policy_version = '2026-09-15'
) $$;
REVOKE ALL ON FUNCTION public.viewer_age(), public.can_use_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_age(), public.can_use_app() TO anon, authenticated, service_role;

CREATE FUNCTION public.accept_account_standards(p_age INTEGER, p_version TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE existing_age INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.account_is_deleting() THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  IF p_age IS NULL OR p_age < 13 OR p_age > 120 THEN RAISE EXCEPTION 'Ages 13 and older only'; END IF;
  IF p_version IS DISTINCT FROM '2026-09-15' THEN RAISE EXCEPTION 'Accept the current standards'; END IF;
  -- Creates the missing OAuth profile, then locks it to serialize first reports.
  INSERT INTO public.profile(id) VALUES (auth.uid()) ON CONFLICT (id) DO NOTHING;
  SELECT reported_age INTO existing_age FROM public.profile WHERE id = auth.uid() FOR UPDATE;
  IF existing_age IS NOT NULL AND p_age <> existing_age THEN
    RAISE EXCEPTION 'Contact support to correct recorded age';
  END IF;
  UPDATE public.profile SET reported_age = p_age,
    age_recorded_at = COALESCE(age_recorded_at, current_date),
    accepted_policy_version = p_version, policy_accepted_at = now()
    WHERE id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.accept_account_standards(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_account_standards(INTEGER, TEXT) TO authenticated;

-- Email signup rejects a missing/invalid age on the server. OAuth identities
-- can authenticate first, but remain unable to create content until onboarding.
CREATE FUNCTION public.validate_signup_age() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.raw_app_meta_data->>'provider' = 'email' THEN
    IF COALESCE(NEW.raw_user_meta_data->>'reported_age', '') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'Current age is required';
    END IF;
    IF (NEW.raw_user_meta_data->>'reported_age')::INTEGER NOT BETWEEN 13 AND 120 THEN
      RAISE EXCEPTION 'Ages 13 and older only';
    END IF;
    IF NEW.raw_user_meta_data->>'accepted_policy_version' IS DISTINCT FROM '2026-09-15' THEN
      RAISE EXCEPTION 'Accept the current standards';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_signup_age BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_signup_age();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profile(id, first_name, last_name, email, username, reported_age, age_recorded_at, accepted_policy_version, policy_accepted_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''), NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), ''),
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN (NEW.raw_user_meta_data->>'reported_age')::INTEGER END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN current_date END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN '2026-09-15' END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN now() END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
-- Existing installations may already call handle_new_user; it is idempotent.
CREATE TRIGGER ensure_profile_account_age AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'items', 'showcase', 'showcase_items', 'posts', 'post_media', 'comments',
    'post_comments', 'likes', 'post_likes', 'bookmarks', 'post_bookmarks',
    'follows', 'showcase_members', 'showcase_follows', 'showcase_likes', 'shares'
  ] LOOP
    EXECUTE format('CREATE POLICY standards_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_use_app())', target);
    EXECUTE format('CREATE POLICY standards_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_use_app()) WITH CHECK (public.can_use_app())', target);
  END LOOP;
END $$;
CREATE POLICY standards_profile_update_guard ON public.profile AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_use_app()) WITH CHECK (public.can_use_app());
CREATE POLICY standards_storage_insert_guard ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.can_use_app());
CREATE POLICY standards_storage_update_guard ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_use_app()) WITH CHECK (public.can_use_app());
NOTIFY pgrst, 'reload schema';
