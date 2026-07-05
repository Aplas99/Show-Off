# Pokémon TCG integration

## Environment

The Expo client currently reads the Pokémon TCG API key from:

```text
EXPO_PUBLIC_POKE_KEY
```

`EXPO_PUBLIC_*` values are bundled into the application. This is acceptable for
the initial provider spike, but cache writes and external API requests should be
moved to a Supabase Edge Function before production release.

## Database

The schema is defined in:

```text
supabase/migrations/20260704120000_create_pokemon_tcg_cache.sql
```

It creates:

- `pokemon_tcg_cards`, the shared provider cache.
- `items.pokemon_tcg_card_id`, the ownership link to an exact printing.
- `search_pokemon_tcg_cards`, the cache-first full-text search function.
- Authenticated read and cache-write RLS policies.

If the migration was applied manually in the Supabase SQL editor, link the CLI
and mark that migration version as applied before the next `db push`:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration repair 20260704120000 --status applied --linked
npx supabase migration list --linked
```

Do not run `db push` until the local and remote migration histories agree.

## Current application flow

1. Open Create and choose Search.
2. Set the category filter to `TCG`.
3. Search by Pokémon card name.
4. The app calls `search_pokemon_tcg_cards` first.
5. A cache miss calls `GET https://api.pokemontcg.io/v2/cards` and upserts the
   returned cards into `pokemon_tcg_cards`.
6. Creating the selected card stores its provider ID in
   `items.pokemon_tcg_card_id` and links the item to the selected showcase.

The API module also exposes an exact cache-first lookup for card IDs such as
`xy1-1` for the scanner integration.

## Multi-card scan flow

The dedicated flow is available from Create → **Scan a card stack**. It asks for
one destination showcase, keeps a queue of recognized cards, requests review
only when recognition is ambiguous, and inserts the confirmed queue as one
database transaction.

Apply the batch migration after the cache migration:

```text
supabase/migrations/20260704143000_create_pokemon_tcg_batch_rpc.sql
```

The batch RPC defaults ownership condition to `Excellent`. Condition editing is
intentionally deferred to the optional review/detail workflow so scanning does
not stop between cards.

### Image recognition

The mobile app crops each camera capture locally and uses ML Kit text
recognition to extract the card name, collector number, printed set total, and
set code. It then performs a structured cache-first lookup against the Pokémon
TCG catalog. A card is accepted only when the normalized name and collector
number match; the printed total or set code further disambiguates the printing.
No image is submitted to TCGTracking for visual matching.

If OCR or the primary provider does not find the card, the scanner exposes a
manual search for card name, collection/set, and collector number. A collection
allows the app to search TCGTracking's public Pokémon set catalog using the
non-deprecated `https://openapi.tcgtracking.com/v1` endpoint. Results from both
providers are normalized, deduplicated, and cached. If neither provider has the
card, the user can add the entered name and collection as an unpriced manual
record and continue the same scan session.

Image normalization uses `expo-image-manipulator`. OCR uses
`@infinitered/react-native-mlkit-text-recognition`, which is a custom native
module and therefore does not run in Expo Go. Build and install the native app
on a physical device after adding or updating the module:

```bash
npm run ios -- --device
# or
npm run android -- --device
```

### Scanner debugging

Development builds log structured scanner events with the `[CardScan]` prefix.
Logs include capture and crop dimensions, raw OCR text, parsed identifiers,
exact catalog results, manual selections, and batch-save status. Image contents
and authentication values are never logged.

Set the following value to silence scanner logs during development:

```text
EXPO_PUBLIC_CARD_SCAN_DEBUG=false
```
