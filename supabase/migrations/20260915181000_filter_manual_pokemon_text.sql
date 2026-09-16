-- Manual catalog titles are user content, even when an item has no custom title.
CREATE FUNCTION public.filter_manual_pokemon_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  IF NEW.owner_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.prohibited_content_patterns p
    WHERE concat_ws(' ',NEW.name,NEW.set_name,NEW.number) ~ p.pattern
  ) THEN RAISE EXCEPTION 'This text needs revision under the Community Standards. Contact support if this is a mistake'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.filter_manual_pokemon_text() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER filter_manual_pokemon_text BEFORE INSERT OR UPDATE OF name,set_name,number,owner_id
ON public.pokemon_tcg_cards FOR EACH ROW EXECUTE FUNCTION public.filter_manual_pokemon_text();
