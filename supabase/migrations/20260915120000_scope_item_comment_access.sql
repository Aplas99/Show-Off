-- Comment visibility follows the parent item's RLS, including showcase privacy.
-- The item is_public flag alone does not establish that a viewer can read it.
DROP POLICY IF EXISTS "Authenticated users can read comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments on public items" ON public.comments;
CREATE POLICY comments_read_accessible_items ON public.comments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id)
  );
CREATE POLICY comments_parent_read_guard ON public.comments AS RESTRICTIVE
  FOR SELECT TO PUBLIC USING (
    EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id)
  );

DROP POLICY IF EXISTS "Authenticated users can comment on accessible items" ON public.comments;
CREATE POLICY comments_insert_accessible_items ON public.comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id)
  );
CREATE POLICY comments_insert_author_guard ON public.comments AS RESTRICTIVE
  FOR INSERT TO PUBLIC WITH CHECK (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id)
  );
CREATE POLICY comments_update_author_guard ON public.comments AS RESTRICTIVE
  FOR UPDATE TO PUBLIC
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id))
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = comments.item_id));

-- Editing content must not reassign the author/parent or rewrite timestamps.
REVOKE UPDATE ON public.comments FROM PUBLIC, anon, authenticated;
DO $$
DECLARE v_columns TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO v_columns
  FROM pg_attribute WHERE attrelid = 'public.comments'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE UPDATE (%s) ON public.comments FROM PUBLIC, anon, authenticated', v_columns);
END;
$$;
GRANT UPDATE (content) ON public.comments TO authenticated;
NOTIFY pgrst, 'reload schema';
