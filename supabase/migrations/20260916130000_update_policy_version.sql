-- Update policy version requirement to 2026-09-16 across signup trigger, onboarding RPC, and app guard

CREATE OR REPLACE FUNCTION public.validate_signup_age() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.raw_app_meta_data->>'provider' = 'email' THEN
    IF COALESCE(NEW.raw_user_meta_data->>'reported_age', '') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'Current age is required';
    END IF;
    IF (NEW.raw_user_meta_data->>'reported_age')::INTEGER NOT BETWEEN 13 AND 120 THEN
      RAISE EXCEPTION 'Ages 13 and older only';
    END IF;
    IF NEW.raw_user_meta_data->>'accepted_policy_version' IS DISTINCT FROM '2026-09-16' THEN
      RAISE EXCEPTION 'Accept the current standards';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profile(id, first_name, last_name, email, username, reported_age, age_recorded_at, accepted_policy_version, policy_accepted_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''), NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), ''),
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN (NEW.raw_user_meta_data->>'reported_age')::INTEGER END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN current_date END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN '2026-09-16' END,
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN now() END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.accept_account_standards(p_age INTEGER, p_version TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE existing_age INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.account_is_deleting() THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  IF p_age IS NULL OR p_age < 13 OR p_age > 120 THEN RAISE EXCEPTION 'Ages 13 and older only'; END IF;
  IF p_version IS DISTINCT FROM '2026-09-16' THEN RAISE EXCEPTION 'Accept the current standards'; END IF;
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

CREATE OR REPLACE FUNCTION public.can_use_app()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT NOT public.account_is_deleting() AND EXISTS (
  SELECT 1 FROM public.profile p WHERE p.id = auth.uid()
    AND p.reported_age >= 13 AND p.age_recorded_at <= current_date
    AND p.accepted_policy_version = '2026-09-16'
) $$;

-- Existing accounts retain their prior acceptance until they accept the
-- updated standards in the in-app safety onboarding screen.
