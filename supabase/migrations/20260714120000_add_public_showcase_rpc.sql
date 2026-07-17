-- Sharable public showcase links (Curator feature).
--
-- `showcase.is_public` already exists and its RLS policy
-- ("read_public_showcases") already grants both `authenticated` and
-- `anon` roles SELECT when is_public = true — reused as-is rather than
-- adding a redundant "share_enabled" column, and the showcase id (a
-- random UUID, not sequential) doubles as the unguessable share token.
--
-- What's still missing for an anonymous visitor: `items`,
-- `showcase_items`, `pokemon_tcg_cards`, and `profile` only grant SELECT
-- to `authenticated`. Rather than opening anon RLS across four more
-- tables (harder to audit exactly what a stranger on the internet can
-- see), this adds one SECURITY DEFINER RPC that returns everything the
-- public page needs in a single call, scoped strictly to showcases where
-- is_public = true.

CREATE OR REPLACE FUNCTION public.get_public_showcase(p_showcase_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'accent_color', s.accent_color,
    'banner_image_url', s.banner_image_url,
    'created_at', s.created_at,
    'owner', jsonb_build_object(
      'username', p.username,
      'avatar_url', p.avatar_url
    ),
    'items', COALESCE(items_agg.items, '[]'::jsonb)
  )
  FROM public.showcase s
  JOIN public.profile p ON p.id = s.profile_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'price', i.price,
        'currency_code', i.currency_code,
        'custom_title', i.custom_title,
        'image_url', i.image_url,
        'pokemon_tcg_card_id', i.pokemon_tcg_card_id,
        'card_name', c.name,
        'card_image_small', c.image_small,
        'card_image_large', c.image_large,
        'card_set_name', c.set_name,
        'card_number', c.number,
        'card_rarity', c.rarity
      )
      ORDER BY i.created_at DESC
    ) AS items
    FROM public.showcase_items si
    JOIN public.items i ON i.id = si.item_id
    LEFT JOIN public.pokemon_tcg_cards c ON c.id = i.pokemon_tcg_card_id
    WHERE si.showcase_id = s.id
  ) items_agg ON TRUE
  WHERE s.id = p_showcase_id
    AND s.is_public = TRUE;
$$;

-- Returns NULL (not an error) for a private/missing showcase, so the
-- client can treat null as "not found" without distinguishing "doesn't
-- exist" from "exists but is private" — deliberately, so a stranger
-- probing ids can't tell the two apart.
REVOKE ALL ON FUNCTION public.get_public_showcase(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_showcase(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_showcase(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
