-- Username onboarding: any signup method (email, Google, Discord) may create
-- a session before a username exists. profile.username becomes temporarily
-- nullable (instead of empty-string placeholders), uniqueness is enforced
-- case-insensitively, and reserve_username() validates + claims a name
-- atomically (the partial unique index makes concurrent claims race-safe).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profile'
      AND column_name = 'username' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profile ALTER COLUMN username DROP NOT NULL;
  END IF;
END $$;

-- Clean up any legacy empty-string placeholders so "missing username" has
-- exactly one representation.
UPDATE public.profile SET username = NULL WHERE BTRIM(COALESCE(username, '')) = '';

CREATE UNIQUE INDEX IF NOT EXISTS profile_username_lower_idx
  ON public.profile (LOWER(username))
  WHERE username IS NOT NULL;

-- Read-only availability probe for live feedback while typing.
CREATE OR REPLACE FUNCTION public.check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_normalized TEXT := BTRIM(p_username);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_normalized !~ '^[A-Za-z0-9_]{3,20}$' THEN
    RETURN FALSE;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profile
    WHERE LOWER(username) = LOWER(v_normalized) AND id <> v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO authenticated;

-- Atomically validate + claim a username for the calling user. Creates the
-- profile row when the signup method didn't (e.g. OAuth first login).
-- Raises 'username_invalid' or 'username_taken' on failure.
CREATE OR REPLACE FUNCTION public.reserve_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_normalized TEXT := BTRIM(p_username);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_normalized !~ '^[A-Za-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  -- Already owned by this user (case-insensitive) — idempotent success.
  IF EXISTS (
    SELECT 1 FROM public.profile
    WHERE id = v_user_id AND LOWER(username) = LOWER(v_normalized)
  ) THEN
    RETURN v_normalized;
  END IF;

  BEGIN
    UPDATE public.profile SET username = v_normalized WHERE id = v_user_id;
    IF NOT FOUND THEN
      INSERT INTO public.profile (id, username) VALUES (v_user_id, v_normalized);
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent claim lost the race on profile_username_lower_idx.
      RAISE EXCEPTION 'username_taken';
  END;

  RETURN v_normalized;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_username(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
