-- showcase_members was captured by the baseline migration without RLS, so the
-- default Supabase grants left it readable and writable by anon and
-- authenticated through PostgREST. The client never touches it; lock it down
-- to service_role until a collaborative-showcase feature defines policies.
ALTER TABLE public.showcase_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.showcase_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.showcase_members TO service_role;
