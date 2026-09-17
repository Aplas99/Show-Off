-- A showcase owner follows each of their own showcases from creation onward.
-- Existing owners are backfilled once when this migration is deployed.
INSERT INTO public.showcase_follows (user_id, showcase_id)
SELECT profile_id, id FROM public.showcase
ON CONFLICT (user_id, showcase_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.follow_new_own_showcase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.showcase_follows (user_id, showcase_id)
  VALUES (NEW.profile_id, NEW.id)
  ON CONFLICT (user_id, showcase_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_new_own_showcase ON public.showcase;
CREATE TRIGGER follow_new_own_showcase
AFTER INSERT ON public.showcase
FOR EACH ROW EXECUTE FUNCTION public.follow_new_own_showcase();

DROP POLICY IF EXISTS keep_own_showcase_follow ON public.showcase_follows;
CREATE POLICY keep_own_showcase_follow ON public.showcase_follows
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  NOT EXISTS (
    SELECT 1 FROM public.showcase s
    WHERE s.id = showcase_follows.showcase_id AND s.profile_id = auth.uid()
  )
);
