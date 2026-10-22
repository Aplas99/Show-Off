-- Multi-photo galleries are a Curator perk, but only the client enforced it.
-- Free (Collector) users may keep one photo per item; adding a second needs
-- an active Curator membership. Shrinking a gallery is always allowed so a
-- lapsed Curator can still remove photos.
CREATE OR REPLACE FUNCTION public.enforce_item_gallery_tier() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF cardinality(NEW.image_urls) <= 1
    OR (TG_OP = 'UPDATE' AND cardinality(NEW.image_urls) <= cardinality(OLD.image_urls))
    OR public.has_curator_membership(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Multiple photos per item require a Curator membership.';
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_item_gallery_tier ON public.items;
CREATE TRIGGER trigger_enforce_item_gallery_tier
  BEFORE INSERT OR UPDATE OF image_urls ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_gallery_tier();
