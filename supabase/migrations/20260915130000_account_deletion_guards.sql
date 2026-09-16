-- Retain deletion intent on failure. Auth deletion cascades this row too.
CREATE TABLE public.account_deletion_requests (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

CREATE FUNCTION public.account_is_deleting()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.account_deletion_requests WHERE user_id = auth.uid()
) $$;
REVOKE ALL ON FUNCTION public.account_is_deleting() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_is_deleting() TO anon, authenticated, service_role;

DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'profile', 'items', 'showcase', 'showcase_items', 'posts', 'post_media',
    'comments', 'post_comments', 'likes', 'post_likes', 'bookmarks',
    'post_bookmarks', 'follows', 'showcase_members', 'showcase_follows',
    'showcase_likes', 'shares'
  ] LOOP
    EXECUTE format('CREATE POLICY deletion_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.account_is_deleting())', target);
    EXECUTE format('CREATE POLICY deletion_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.account_is_deleting()) WITH CHECK (NOT public.account_is_deleting())', target);
  END LOOP;
END $$;

CREATE POLICY deletion_storage_insert_guard ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT public.account_is_deleting());
CREATE POLICY deletion_storage_update_guard ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT public.account_is_deleting())
  WITH CHECK (NOT public.account_is_deleting());
NOTIFY pgrst, 'reload schema';
