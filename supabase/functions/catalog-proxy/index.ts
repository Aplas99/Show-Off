import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { createCatalogProxyHandler } from "../_shared/catalogProxy.ts";
import { tcgplayerIdFromUrl } from "@/lib/cardPricing";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createCatalogProxyHandler({
  authenticate: async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  },
  consumeRequest: async (userId, provider) => {
    const { data, error } = await admin.rpc("consume_catalog_proxy_request", {
      p_user_id: userId,
      p_provider: provider,
    });
    if (error) throw error;
    return data === true;
  },
  reserveMagicRequest: async () => {
    const { data, error } = await admin.rpc("reserve_magic_catalog_request");
    if (error) throw error;
    return data === true;
  },
  persistMagicCards: async (rows) => {
    const { error } = await admin.from("magic_cards").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  },
  persistRiftboundCards: async (rows, signal) => {
    const { error } = await admin.from("riftbound_cards").upsert(rows, { onConflict: "id" }).abortSignal(signal);
    if (error) throw error;
  },
  persistPokemonCards: async (rows, signal) => {
    const { error } = await admin.from("pokemon_tcg_cards").upsert(rows, { onConflict: "id" }).abortSignal(signal);
    if (error) throw error;
  },
  persistPokemonRoster: async (row, signal) => {
    const { error } = await admin.from("pokemon_tcg_set_rosters").upsert(row, { onConflict: "set_id" }).abortSignal(signal);
    if (error) throw error;
  },
  persistPokemonSets: async (rows, signal) => {
    const { error } = await admin.from("pokemon_tcg_sets").upsert(rows, { onConflict: "id" }).abortSignal(signal);
    if (error) throw error;
  },
  persistProducts: async (rows, signal) => {
    const { error } = await admin.from("products").upsert(rows, { onConflict: "ean" }).abortSignal(signal);
    if (!error) return;
    // Older deployed schemas generated these searchable columns from data.
    if (error.code !== "428C9") throw error;
    const { error: retryError } = await admin.from("products")
      .upsert(rows.map(({ ean, data }) => ({ ean, data })), { onConflict: "ean" }).abortSignal(signal);
    if (retryError) throw retryError;
  },
  persistTcgCards: async (rows, signal) => {
    const { error } = await admin.from("tcg_cards").upsert(rows, { onConflict: "id" }).abortSignal(signal);
    if (error) throw error;
  },
  findTcgCardImages: async (ids, signal) => {
    if (ids.length === 0) return {};
    const { data, error } = await admin.from("tcg_cards").select("id, image_url").in("id", ids).abortSignal(signal);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((row) => [row.id as string, (row.image_url as string | null) ?? null]));
  },
  findTodayPrice: async (game, cardId, signal) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await admin.from("price_history").select("price")
      .eq("game", game).eq("card_id", cardId).eq("captured_on", today).abortSignal(signal).maybeSingle();
    if (error) throw error;
    return data ? Number(data.price) : null;
  },
  findTcgplayerSource: async (game, cardId, signal) => {
    const { data: mapping, error: mappingError } = await admin.from("card_tcgplayer_products")
      .select("product_id, resolved_at").eq("game", game).eq("card_id", cardId).abortSignal(signal).maybeSingle();
    if (mappingError) throw mappingError;
    // A "no product" answer is retried after 30 days.
    const settled = mapping && (mapping.product_id != null
      || Date.now() - new Date(mapping.resolved_at as string).getTime() < 30 * 24 * 60 * 60 * 1000);
    if (settled) return { productId: (mapping.product_id as number | null) ?? null, resolved: true, pokemonPriceUrl: null };

    const lookup = async (table: string, columns: string) => {
      const { data, error } = await admin.from(table).select(columns).eq("id", cardId).abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    };
    if (game === "pokemon") {
      const card = await lookup("pokemon_tcg_cards", "id, tcgplayer");
      if (!card) return null;
      const trackingId = cardId.match(/^tcgtracking:(\d+)$/)?.[1];
      const url = ((card.tcgplayer as { url?: string } | null)?.url) ?? null;
      return { productId: trackingId ? Number(trackingId) : tcgplayerIdFromUrl(url), resolved: false, pokemonPriceUrl: url };
    }
    if (game === "magic") {
      const card = await lookup("magic_cards", "id, raw_data");
      if (!card) return null;
      const id = Number((card.raw_data as { tcgplayer_id?: unknown } | null)?.tcgplayer_id);
      return { productId: Number.isSafeInteger(id) && id > 0 ? id : null, resolved: false, pokemonPriceUrl: null };
    }
    if (game === "riftbound") {
      const card = await lookup("riftbound_cards", "id, tcgplayer_id");
      if (!card) return null;
      const id = Number(card.tcgplayer_id);
      return { productId: Number.isSafeInteger(id) && id > 0 ? id : null, resolved: false, pokemonPriceUrl: null };
    }
    const card = await lookup("tcg_cards", "id, game, raw_data");
    if (!card || card.game !== game) return null;
    const url = (card.raw_data as { tcgplayer?: { url?: string } | null } | null)?.tcgplayer?.url;
    return { productId: tcgplayerIdFromUrl(url), resolved: false, pokemonPriceUrl: null };
  },
  saveTcgplayerProduct: async (game, cardId, productId, signal) => {
    const { error } = await admin.from("card_tcgplayer_products")
      .upsert({ game, card_id: cardId, product_id: productId, resolved_at: new Date().toISOString() }, { onConflict: "game,card_id" })
      .abortSignal(signal);
    if (error) throw error;
  },
  persistPriceSnapshot: async (game, cardId, price, signal) => {
    const { error } = await admin.from("price_history")
      .upsert({ game, card_id: cardId, price, captured_on: new Date().toISOString().slice(0, 10) }, { onConflict: "game,card_id,captured_on" })
      .abortSignal(signal);
    if (error) throw error;
  },
  persistTcgSetRoster: async (row, signal) => {
    const { error } = await admin.from("tcg_set_rosters").upsert(row, { onConflict: "game,set_id" }).abortSignal(signal);
    if (error) throw error;
  },
  storeTcgCardImage: async (path, bytes, contentType) => {
    const bucket = admin.storage.from("tcg-card-images");
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw error;
    return bucket.getPublicUrl(path).data.publicUrl;
  },
  reserveUpcRequest: async (isSearch) => {
    const { data, error } = await admin.rpc("reserve_upc_catalog_request", { p_is_search: isSearch });
    if (error) throw error;
    return data === true;
  },
  deferUpcRequests: async (seconds) => {
    const { error } = await admin.rpc("defer_upc_catalog_requests", { p_seconds: seconds });
    if (error) throw error;
  },
  getSecret: (name) => Deno.env.get(name),
  // Set the CATALOG_PROXY_DEBUG secret to "false" to keep only warnings and errors.
  debug: Deno.env.get("CATALOG_PROXY_DEBUG") !== "false",
  fetch: globalThis.fetch,
}));
