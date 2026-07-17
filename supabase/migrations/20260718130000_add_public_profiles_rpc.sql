-- Column-limited public profile lookup for social surfaces (Discover feed,
-- comments). The profile table predates tracked migrations and its RLS may
-- not allow cross-user reads; rather than opening the whole table (which
-- could expose private columns), this SECURITY DEFINER RPC returns only the
-- five fields social UIs need.

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids UUID[])
RETURNS TABLE(
  id UUID,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Explicit ::TEXT casts: the untracked profile table may use VARCHAR,
  -- which would otherwise fail the RETURNS TABLE row-type check.
  SELECT
    p.id,
    p.username::TEXT,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.avatar_url::TEXT
  FROM public.profile AS p
  WHERE p.id = ANY(p_user_ids)
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
