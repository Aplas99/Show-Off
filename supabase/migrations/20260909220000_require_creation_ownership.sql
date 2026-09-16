-- Permissive policies are ORed together. The legacy TRUE policies defeated
-- the existing owner checks on both tables.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.showcase;

-- Restrictive guards retain the owner boundary even if another permissive
-- INSERT policy exists in a deployed schema. Service-role maintenance bypasses RLS.
CREATE POLICY items_insert_owner_guard ON public.items AS RESTRICTIVE
  FOR INSERT TO PUBLIC WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY showcase_insert_owner_guard ON public.showcase AS RESTRICTIVE
  FOR INSERT TO PUBLIC WITH CHECK (auth.uid() IS NOT NULL AND profile_id = auth.uid());

-- This privileged helper is for server-side signup provisioning, not arbitrary
-- client RPC calls. Definer functions/triggers retain their owner's privileges.
ALTER FUNCTION public.ensure_default_showcase(UUID) SET search_path = '';
REVOKE ALL ON FUNCTION public.ensure_default_showcase(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_showcase(UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
