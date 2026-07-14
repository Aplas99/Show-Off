-- Enforces the free "Collector" plan's limits (50 items, 1 showcase) at
-- the database level — the authoritative check, since a client-side-only
-- check is trivially bypassed. Curator subscribers (any price point) are
-- exempt via has_curator_membership(), already defined in
-- 20260714090000_add_membership_tiers.sql.
--
-- ensure_default_showcase() (called for every new signup) still works
-- fine under this trigger: a user's very first showcase always passes
-- the "< 1 existing showcase" check regardless of tier.

CREATE OR REPLACE FUNCTION public.enforce_free_tier_item_limit() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_count INTEGER;
BEGIN
  IF public.has_curator_membership(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO item_count FROM public.items WHERE user_id = NEW.user_id;
  IF item_count >= 50 THEN
    RAISE EXCEPTION 'Free plan is limited to 50 items. Upgrade to Curator for unlimited items.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_free_tier_item_limit ON public.items;
CREATE TRIGGER trigger_enforce_free_tier_item_limit
  BEFORE INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_item_limit();

CREATE OR REPLACE FUNCTION public.enforce_free_tier_showcase_limit() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  showcase_count INTEGER;
BEGIN
  IF public.has_curator_membership(NEW.profile_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO showcase_count FROM public.showcase WHERE profile_id = NEW.profile_id;
  IF showcase_count >= 1 THEN
    RAISE EXCEPTION 'Free plan is limited to 1 showcase. Upgrade to Curator for unlimited showcases.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_free_tier_showcase_limit ON public.showcase;
CREATE TRIGGER trigger_enforce_free_tier_showcase_limit
  BEFORE INSERT ON public.showcase
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_showcase_limit();

NOTIFY pgrst, 'reload schema';
