import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { createCatalogProxyHandler } from "../_shared/catalogProxy.ts";

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
  persistPokemonCards: async (rows, signal) => {
    const { error } = await admin.from("pokemon_tcg_cards").upsert(rows, { onConflict: "id" }).abortSignal(signal);
    if (error) throw error;
  },
  persistPokemonRoster: async (row, signal) => {
    const { error } = await admin.from("pokemon_tcg_set_rosters").upsert(row, { onConflict: "set_id" }).abortSignal(signal);
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
  fetch: globalThis.fetch,
}));
