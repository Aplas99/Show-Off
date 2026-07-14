-- Item images are now uploaded to `<user_id>/<filename>` (see api/storage).
-- These policies scope writes to the uploader's own folder.
--
-- NOTE: RLS policies are permissive (OR'd together). If the item-images
-- bucket has an older blanket INSERT policy from the dashboard, remove it
-- for these to actually restrict anything.

DROP POLICY IF EXISTS "Users can upload own item images" ON storage.objects;
CREATE POLICY "Users can upload own item images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'item-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::TEXT)
  );

DROP POLICY IF EXISTS "Users can delete own item images" ON storage.objects;
CREATE POLICY "Users can delete own item images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'item-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::TEXT)
  );
