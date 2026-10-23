import { validateCatalogRequest } from "@/lib/catalogValidation";
import { magicCardSchema, magicCardToCacheRow, scryfallSearchResponseSchema } from "@/lib/magicCatalog";
import { barcodeNestMissing, barcodeNestNeedsImage, openLibraryCoverUrl, parseBarcodeNestProducts, parseBarcodeProducts, parseUpcProducts, productMatchesCode, productsToCacheRows, safeImageUrl, upcRetryDelay, withBarcodeNestImage, withBarcodeNestImageChecked, withBarcodeNestProduct, type CatalogProduct } from "@/lib/productCatalog";

import { getTcgGameSlug, type TcgGameCode } from "@/constants/tcgGames";
import {
  TCG_API_PAGE_SIZE,
  TCG_API_SET_LIST_MAX_PAGES,
  TCG_API_SET_MAX_PAGES,
  TCG_API_SET_PAGE_SIZE,
  cacheRowToTcgCard,
  parseTcgApiSearch,
  parseTcgApiSetList,
  parseTcgApiSetPage,
  tcgCardToCacheRow,
  type TcgApiCardPrintings,
  type TcgSetRow,
} from "@/lib/tcgApiCatalog";
import { isPokemonPriceRedirect, pickTcgTrackingMarketPrice, tcgplayerIdFromUrl } from "@/lib/cardPricing";
import { parseRiftboundCards, riftboundCardToCacheRow } from "@/lib/riftboundCatalog";
import { parsePokemonSetList, pokemonCardResponseSchema, pokemonSearchResponseSchema, pokemonCardToCacheRow, pokemonSetToCacheRow, type PokemonTcgCard } from "@/lib/pokemonCatalog";
import { parseTrackingCards, setSearchSchema } from "@/lib/tcgTrackingCatalog";

const REQUEST_LIMIT_BYTES = 8 * 1024;
const RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const TCG_API_BASE = "https://api.tcgapi.dev/v1";
const TCG_API_TIMEOUT_MS = 30_000;
/** How long a game's cached set list is trusted before an unknown set name refreshes it. */
const TCG_SET_LIST_REFRESH_MS = 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export interface CatalogProxyDependencies {
  authenticate: (token: string) => Promise<string | null>;
  consumeRequest: (userId: string, provider: "pokemon" | "barcode" | "magic" | "upc" | "riftbound" | "tcgapi" | "price") => Promise<boolean>;
  reserveMagicRequest: () => Promise<boolean>;
  persistMagicCards: (rows: ReturnType<typeof magicCardToCacheRow>[]) => Promise<void>;
  persistRiftboundCards: (rows: ReturnType<typeof riftboundCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistPokemonCards: (rows: ReturnType<typeof pokemonCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistPokemonRoster: (row: Record<string, unknown>, signal: AbortSignal) => Promise<void>;
  persistPokemonSets: (rows: ReturnType<typeof pokemonSetToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistProducts: (rows: ReturnType<typeof productsToCacheRows>, signal: AbortSignal) => Promise<void>;
  persistTcgCards: (rows: ReturnType<typeof tcgCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  /** The game's cached TCG API set list (tcg_sets). */
  findTcgSets: (game: TcgGameCode, signal: AbortSignal) => Promise<TcgSetRow[]>;
  persistTcgSets: (rows: TcgSetRow[], signal: AbortSignal) => Promise<void>;
  /** Today's cached price_history price for a card, or null if none yet. */
  findTodayPrice: (game: string, cardId: string, signal: AbortSignal) => Promise<number | null>;
  /**
   * How to find a cached card's TCGplayer product: a known product id (from
   * card_tcgplayer_products or the card cache), or Pokémon's price-redirect
   * URL. Null when the card isn't in our caches.
   */
  findTcgplayerSource: (game: string, cardId: string, signal: AbortSignal) => Promise<{
    productId: number | null;
    /** True when card_tcgplayer_products already settled it (even as "none"). */
    resolved: boolean;
    pokemonPriceUrl: string | null;
  } | null>;
  saveTcgplayerProduct: (game: string, cardId: string, productId: number | null, signal: AbortSignal) => Promise<void>;
  persistPriceSnapshot: (game: string, cardId: string, price: number, signal: AbortSignal) => Promise<void>;
  /** Marks a TCG API set as fully cached in tcg_cards (tcg_set_rosters). */
  persistTcgSetRoster: (row: { game: string; set_id: string; set_name: string | null; card_count: number; cached_at: string }, signal: AbortSignal) => Promise<void>;
  reserveUpcRequest: (isSearch: boolean) => Promise<boolean>;
  deferUpcRequests: (seconds: number) => Promise<void>;
  getSecret: (name: "POKEMON_TCG_API_KEY" | "BARCODE_LOOKUP_API_KEY" | "BARCODENEST_KEY" | "TCG_API_KEY") => string | undefined;
  /** Step-by-step `[catalog-proxy]` logs (CATALOG_PROXY_DEBUG); warnings and errors always log. */
  debug?: boolean;
  fetch: typeof fetch;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readBoundedJson(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error("Body exceeds limit");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readBoundedBytes(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error("Body exceeds limit");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Function logs (Supabase dashboard → Edge Functions → catalog-proxy → Logs).
// Never log keys, tokens or whole vendor bodies: details are ids, counts,
// statuses and the vendor's own short error text with any key stripped.

function debugLog(dependencies: CatalogProxyDependencies, event: string, details: Record<string, unknown> = {}) {
  if (dependencies.debug) console.log(`[catalog-proxy] ${event}`, details);
}

function warnLog(event: string, details: Record<string, unknown> = {}) {
  console.warn(`[catalog-proxy] ${event}`, details);
}

function errorSummary(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: redact(error.message).slice(0, 300) }
    : { name: "UnknownError", message: redact(String(error)).slice(0, 300) };
}

/** Strips anything shaped like a TCG API key from vendor text. */
function redact(text: string) {
  return text.replace(/tcg_(?:live|test)_[A-Za-z0-9]+/g, "tcg_***");
}

/** TCG API's daily quota headers, so logs show how close the shared plan is to its limit. */
function rateLimitDetails(response: Response) {
  return {
    limit: response.headers.get("X-RateLimit-Limit"),
    remaining: response.headers.get("X-RateLimit-Remaining"),
    reset: response.headers.get("X-RateLimit-Reset"),
  };
}

/**
 * Status and the vendor's short error text for a failed response. TCG API
 * errors are `{ error: { message, code } }`; other vendors send
 * `{ error, message }` strings. Reads at most 4 KB and consumes the body.
 */
async function vendorFailureDetails(response: Response) {
  let vendorError: string | null = null;
  try {
    const text = new TextDecoder().decode(await readBoundedBytes(response.body, 4096));
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    const nested = body.error && typeof body.error === "object" ? body.error as { code?: unknown; message?: unknown } : null;
    const parts = (nested ? [nested.code, nested.message] : [body.error, body.message])
      .filter((part): part is string => typeof part === "string");
    vendorError = parts.length > 0 ? redact(parts.join(": ")).slice(0, 200) : null;
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
  return { status: response.status, vendorError, ...rateLimitDetails(response) };
}

/**
 * A TCG API call failed after it was sent. Logs the cause to the function
 * logs (error name and message only; never the key or a vendor body) and
 * tells the user whether the provider was unreachable or answered with data
 * we couldn't read.
 */
function tcgApiFailure(game: string, error: unknown, timedOut: boolean) {
  if (timedOut) return json({ error: "Catalog search timed out. Please try again." }, 504);
  const { name, message } = errorSummary(error);
  console.error("[catalog-proxy] tcgapi.failed", { game, name, message });
  const unreadable = name === "ZodError" || name === "SyntaxError";
  return json({ error: unreadable
    ? "The card catalog sent a response the app couldn't read. Please try again later."
    : "The catalog provider could not be reached. Please try again." }, 502);
}

/** Logs a failed TCG API response and turns it into the error the app shows. */
async function tcgApiUpstreamFailure(event: string, details: Record<string, unknown>, response: Response, notFound: Response) {
  warnLog(event, { ...details, ...await vendorFailureDetails(response) });
  if (response.status === 404) return notFound;
  if (response.status === 429) return json({ error: "The card catalog is busy. Please try again later." }, 429);
  // Vendor responses can echo the key in examples. Never forward them.
  return json({ error: "The catalog provider is temporarily unavailable. Please try again." }, 502);
}

/**
 * The game's sets from tcg_sets, refreshed from TCG API's public set list
 * (no key, no quota) when `wanted` names a set we don't know and the list is
 * over a day old. Search results carry only a set name, so this is how cards
 * get the set id that set completion needs. Failures leave cards without one.
 */
async function loadTcgSets(game: TcgGameCode, wanted: string[], dependencies: CatalogProxyDependencies, signal: AbortSignal) {
  let sets: TcgSetRow[] = [];
  try {
    sets = await dependencies.findTcgSets(game, signal);
  } catch (error) {
    warnLog("tcgapi.sets.lookup-failed", { game, ...errorSummary(error) });
    return sets;
  }
  const known = new Set(sets.map((set) => set.name));
  const newest = Math.max(0, ...sets.map((set) => new Date(set.cached_at).getTime()));
  if (wanted.every((name) => known.has(name)) || Date.now() - newest < TCG_SET_LIST_REFRESH_MS) return sets;

  try {
    const refreshed: TcgSetRow[] = [];
    for (let page = 1; page <= TCG_API_SET_LIST_MAX_PAGES; page += 1) {
      const url = new URL(`${TCG_API_BASE}/games/${getTcgGameSlug(game)}/sets`);
      url.search = new URLSearchParams({ page: String(page), per_page: "100" }).toString();
      const response = await dependencies.fetch(url, { headers: { Accept: "application/json" }, signal, redirect: "error" });
      if (!response.ok) {
        warnLog("tcgapi.sets.upstream-failed", { game, page, ...await vendorFailureDetails(response) });
        return sets;
      }
      const parsed = parseTcgApiSetList(game, await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
      refreshed.push(...parsed.sets);
      if (!parsed.hasMore) break;
    }
    if (refreshed.length === 0) return sets;
    await dependencies.persistTcgSets(refreshed, signal);
    debugLog(dependencies, "tcgapi.sets.refreshed", { game, setCount: refreshed.length });
    return refreshed;
  } catch (error) {
    warnLog("tcgapi.sets.refresh-failed", { game, ...errorSummary(error) });
    return sets;
  }
}

/**
 * Full roster of one TCG API set for set completion, 100 cards a page; each
 * page after the first spends another limiter request. A set that fills
 * every page may be truncated and is not marked complete.
 */
async function handleTcgApiSet(request: TcgApiRequest, setId: string, key: string, dependencies: CatalogProxyDependencies, userId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TCG_API_TIMEOUT_MS);
  const headers = { Accept: "application/json", "X-API-Key": key };
  const slug = getTcgGameSlug(request.game);
  const startedAt = Date.now();
  debugLog(dependencies, "tcgapi.set.started", { game: request.game, setId });
  try {
    const cards: TcgApiCardPrintings[] = [];
    for (let page = 1; ; page += 1) {
      if (page > TCG_API_SET_MAX_PAGES) throw new Error("Set roster too large");
      if (page > 1 && !await dependencies.consumeRequest(userId, "tcgapi")) {
        return json({ error: "Catalog request limit reached. Please try again later." }, 429);
      }
      const url = new URL(`${TCG_API_BASE}/sets/${setId}/cards`);
      url.search = new URLSearchParams({ page: String(page), per_page: String(TCG_API_SET_PAGE_SIZE) }).toString();
      const pageStartedAt = Date.now();
      const response = await dependencies.fetch(url, { headers, signal: controller.signal, redirect: "error" });
      debugLog(dependencies, "tcgapi.set.upstream", {
        game: request.game, setId, page, status: response.status, durationMs: Date.now() - pageStartedAt, ...rateLimitDetails(response),
      });
      if (!response.ok) {
        return tcgApiUpstreamFailure("tcgapi.set.upstream-failed", { game: request.game, setId, page }, response,
          json({ error: "That set was not found." }, 404));
      }
      const parsed = parseTcgApiSetPage(slug, await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
      // Rows that name another set are not part of this roster.
      cards.push(...parsed.cards.filter(({ card }) => !card.set_id || card.set_id === setId));
      debugLog(dependencies, "tcgapi.set.page-parsed", {
        game: request.game, setId, page, rawCount: parsed.rawCount, cardCount: parsed.cards.length,
      });
      if (!parsed.hasMore) break;
    }

    const known = (await loadTcgSets(request.game, [], dependencies, controller.signal)).find((set) => set.id === setId);
    const setName = known?.name ?? cards.find(({ card }) => card.set_name)?.card.set_name ?? null;
    const set = { id: setId, name: setName, abbreviation: known?.abbreviation ?? null };
    const unique = [...new Map(cards.map((entry) => [entry.card.id, entry])).values()];
    const rows = unique.map((entry) => tcgCardToCacheRow(request.game, entry, set));
    try {
      if (rows.length > 0) await dependencies.persistTcgCards(rows, controller.signal);
      await dependencies.persistTcgSetRoster({
        game: request.game,
        set_id: setId,
        set_name: setName,
        card_count: rows.length,
        cached_at: new Date().toISOString(),
      }, controller.signal);
    } catch (error) {
      console.error("[catalog-proxy] tcgapi.set.save-failed", { game: request.game, setId, rows: rows.length, ...errorSummary(error) });
      return json({ error: "Could not save catalog results. Please try again." }, 503);
    }
    debugLog(dependencies, "tcgapi.set.completed", {
      game: request.game, setId, setName, cardCount: rows.length, durationMs: Date.now() - startedAt,
    });
    return json({ setName, cards: rows.map(cacheRowToTcgCard) });
  } catch (error) {
    return tcgApiFailure(request.game, error, controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
}

type PriceRequest = Extract<ReturnType<typeof validateCatalogRequest>, { provider: "price" }>;

/**
 * Today's TCGplayer price for one card from TCGTracking, cached as that
 * day's price_history row. TCGTracking refreshes once a day and has no
 * history endpoint, so the first view each day fetches and every later view
 * (any user) reads the stored snapshot. Only cards already in our caches are
 * priced; the product id comes from server data, never the client.
 */
async function handlePrice(request: PriceRequest, dependencies: CatalogProxyDependencies) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();
  const card = { game: request.game, cardId: request.cardId };
  try {
    const today = await dependencies.findTodayPrice(request.game, request.cardId, controller.signal);
    if (today != null) {
      debugLog(dependencies, "price.cache-hit", { ...card, price: today });
      return json({ price: today, source: "cache" });
    }

    const source = await dependencies.findTcgplayerSource(request.game, request.cardId, controller.signal);
    if (!source) {
      warnLog("price.card-not-cached", card);
      return json({ error: "That card is not in the catalog." }, 404);
    }
    debugLog(dependencies, "price.source", { ...card, productId: source.productId, resolved: source.resolved, hasPokemonRedirect: !!source.pokemonPriceUrl });

    let productId = source.productId;
    if (!productId && !source.resolved && isPokemonPriceRedirect(source.pokemonPriceUrl)) {
      // pokemontcg.io redirects its price link to the TCGplayer product page.
      const redirect = await dependencies.fetch(new URL(source.pokemonPriceUrl!), {
        signal: controller.signal,
        redirect: "manual",
      });
      await redirect.body?.cancel().catch(() => undefined);
      productId = tcgplayerIdFromUrl(redirect.headers.get("Location"));
      debugLog(dependencies, "price.pokemon-redirect", { ...card, status: redirect.status, productId });
      await dependencies.saveTcgplayerProduct(request.game, request.cardId, productId, controller.signal);
    }
    if (!productId) {
      debugLog(dependencies, "price.no-product", card);
      return json({ price: null, source: "none" });
    }

    const response = await dependencies.fetch(new URL(`https://openapi.tcgtracking.com/v1/products/${productId}`), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    debugLog(dependencies, "price.upstream", { ...card, productId, status: response.status, durationMs: Date.now() - startedAt });
    if (!response.ok) {
      warnLog("price.upstream-failed", { ...card, productId, ...await vendorFailureDetails(response) });
      if (response.status === 404) return json({ price: null, source: "none" });
      return json({ error: "Prices are temporarily unavailable. Please try again." }, 502);
    }
    const price = pickTcgTrackingMarketPrice(await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
    if (price != null) {
      try {
        await dependencies.persistPriceSnapshot(request.game, request.cardId, price, controller.signal);
      } catch (error) {
        console.error("[catalog-proxy] price.save-failed", { ...card, price, ...errorSummary(error) });
        return json({ error: "Could not save the price. Please try again." }, 503);
      }
    }
    debugLog(dependencies, "price.completed", { ...card, productId, price, durationMs: Date.now() - startedAt });
    return json({ price, source: "api" });
  } catch (error) {
    if (!controller.signal.aborted) console.error("[catalog-proxy] price.failed", { ...card, ...errorSummary(error) });
    return json({ error: controller.signal.aborted
      ? "Price lookup timed out. Please try again."
      : "Prices are temporarily unavailable. Please try again." },
    controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

type TcgApiRequest = Extract<ReturnType<typeof validateCatalogRequest>, { provider: "tcgapi" }>;

/**
 * TCG API search for the shared TCG pipeline. Cards are saved before they
 * are returned; their images are public TCGplayer CDN URLs, so nothing is
 * copied. TCG API matches card names only, never printed card numbers.
 */
async function handleTcgApi(request: TcgApiRequest, key: string, dependencies: CatalogProxyDependencies, userId: string) {
  if (request.setId) return handleTcgApiSet(request, request.setId, key, dependencies, userId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TCG_API_TIMEOUT_MS);
  const headers = { Accept: "application/json", "X-API-Key": key };
  const slug = getTcgGameSlug(request.game);
  try {
    const url = new URL(`${TCG_API_BASE}/search`);
    url.search = new URLSearchParams({
      // validateCatalogRequest guarantees a query when there is no setId.
      q: request.query ?? "",
      game: slug,
      page: String(request.page),
      per_page: String(TCG_API_PAGE_SIZE),
    }).toString();
    const startedAt = Date.now();
    debugLog(dependencies, "tcgapi.search.started", { game: request.game, query: request.query, page: request.page });
    const response = await dependencies.fetch(url, { headers, signal: controller.signal, redirect: "error" });
    debugLog(dependencies, "tcgapi.search.upstream", {
      game: request.game, status: response.status, durationMs: Date.now() - startedAt, ...rateLimitDetails(response),
    });
    if (!response.ok) {
      return tcgApiUpstreamFailure("tcgapi.search.upstream-failed", { game: request.game, query: request.query }, response,
        json({ cards: [], page: request.page, total: 0, totalPages: 0 }));
    }
    const search = parseTcgApiSearch(slug, await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
    debugLog(dependencies, "tcgapi.search.parsed", {
      game: request.game, cardCount: search.cards.length, total: search.total, page: search.page, totalPages: search.totalPages,
    });

    const unmatched = [...new Set(search.cards.flatMap(({ card }) => (!card.set_id && card.set_name ? [card.set_name] : [])))];
    const sets = unmatched.length > 0 ? await loadTcgSets(request.game, unmatched, dependencies, controller.signal) : [];
    const setsByName = new Map(sets.map((set) => [set.name, set]));
    const rows = search.cards.map((entry) =>
      tcgCardToCacheRow(request.game, entry, entry.card.set_name ? setsByName.get(entry.card.set_name) ?? null : null));
    if (rows.length > 0) {
      try {
        await dependencies.persistTcgCards(rows, controller.signal);
      } catch (error) {
        console.error("[catalog-proxy] tcgapi.search.save-failed", { game: request.game, rows: rows.length, ...errorSummary(error) });
        return json({ error: "Could not save catalog results. Please try again." }, 503);
      }
    }
    debugLog(dependencies, "tcgapi.search.completed", {
      game: request.game, saved: rows.length, withImage: rows.filter((row) => row.image_url).length,
      withSet: rows.filter((row) => row.set_id).length, durationMs: Date.now() - startedAt,
    });
    return json({ cards: rows.map(cacheRowToTcgCard), page: search.page, total: search.total, totalPages: search.totalPages });
  } catch (error) {
    return tcgApiFailure(request.game, error, controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
}

/** UPCItemDB code lookup on the shared trial budget; any failure means no backup. */
async function lookupUpcBackup(code: string, dependencies: CatalogProxyDependencies, signal: AbortSignal): Promise<CatalogProduct | undefined> {
  if (!await dependencies.reserveUpcRequest(false)) {
    debugLog(dependencies, "barcode-backup.upc-budget-exhausted", { code });
    return undefined;
  }
  const response = await dependencies.fetch(new URL("https://api.upcitemdb.com/prod/trial/lookup"), {
    method: "POST", body: JSON.stringify({ upc: code }),
    headers: { Accept: "application/json", "Content-Type": "application/json" }, signal, redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429) await dependencies.deferUpcRequests(upcRetryDelay(response.headers));
    debugLog(dependencies, "barcode-backup.upc-unavailable", { code, status: response.status });
    return undefined;
  }
  return parseUpcProducts(await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES))
    .find((product) => productMatchesCode(product, code));
}

/**
 * Backups for a BarcodeNest result, best-effort in order: a UPCItemDB product
 * when BarcodeNest has none, then for a missing image an Open Library cover
 * (ISBNs) and UPCItemDB's images. Exhausted backups are stamped so the
 * client doesn't re-spend lookups on every scan of an imageless product.
 */
async function withBarcodeBackups(code: string, raw: unknown, dependencies: CatalogProxyDependencies, signal: AbortSignal) {
  let data = raw;
  let upc: CatalogProduct | undefined;
  let upcTried = false;
  const tryUpc = async () => {
    if (upcTried) return upc;
    upcTried = true;
    try {
      upc = await lookupUpcBackup(code, dependencies, signal);
    } catch (error) {
      debugLog(dependencies, "barcode-backup.upc-failed", { code, ...errorSummary(error) });
    }
    return upc;
  };

  if (barcodeNestMissing(data)) {
    const backup = await tryUpc();
    if (!backup) return data;
    data = withBarcodeNestProduct(code, backup, "upcitemdb");
    debugLog(dependencies, "barcode-backup.product-found", { code, source: "upcitemdb" });
  }
  if (!barcodeNestNeedsImage(data)) return data;

  const cover = openLibraryCoverUrl(code);
  if (cover) {
    try {
      const coverResponse = await dependencies.fetch(cover, { method: "HEAD", signal, redirect: "manual" });
      await coverResponse.body?.cancel().catch(() => undefined);
      // Open Library answers an existing cover with a redirect to its CDN.
      if (coverResponse.ok || (coverResponse.status >= 300 && coverResponse.status < 400)) {
        debugLog(dependencies, "barcode-backup.image-found", { code, source: "openlibrary" });
        return withBarcodeNestImage(data, cover, "openlibrary");
      }
    } catch {
      // Cover lookup is best-effort.
    }
  }

  const image = (await tryUpc())?.images?.map(safeImageUrl).find(Boolean);
  if (image) {
    debugLog(dependencies, "barcode-backup.image-found", { code, source: "upcitemdb" });
    return withBarcodeNestImage(data, image, "upcitemdb");
  }
  debugLog(dependencies, "barcode-backup.image-missing", { code });
  return withBarcodeNestImageChecked(data, new Date().toISOString());
}

export function createCatalogProxyHandler(dependencies: CatalogProxyDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: "Please sign in to search the catalog." }, 401);

    let userId: string | null;
    try {
      userId = await dependencies.authenticate(token);
    } catch {
      return json({ error: "Sign-in verification is unavailable. Please try again." }, 503);
    }
    if (!userId) return json({ error: "Please sign in again to search the catalog." }, 401);

    let request: ReturnType<typeof validateCatalogRequest>;
    try {
      const body = await readBoundedJson(req.body, REQUEST_LIMIT_BYTES);
      request = validateCatalogRequest(body);
    } catch (error) {
      // Issue paths only (not values): enough to see which field was rejected.
      const issues = (error as { issues?: { path?: unknown[]; message?: string }[] })?.issues
        ?.slice(0, 5).map((issue) => `${(issue.path ?? []).join(".") || "(root)"}: ${issue.message ?? ""}`);
      warnLog("request.invalid", { userId, ...(issues ? { issues } : errorSummary(error)) });
      return json({ error: "Invalid catalog request. Check your search and try again." }, 400);
    }
    debugLog(dependencies, "request.received", { userId, provider: request.provider });

    const secretName = request.provider === "pokemon"
      ? "POKEMON_TCG_API_KEY"
      : request.provider === "barcodenest" ? "BARCODENEST_KEY"
      : request.provider === "tcgapi" ? "TCG_API_KEY" : "BARCODE_LOOKUP_API_KEY";
    const needsKey = request.provider === "pokemon" || request.provider === "barcode" || request.provider === "barcodenest"
      || request.provider === "tcgapi";
    const key = needsKey ? dependencies.getSecret(secretName) : undefined;
    if (needsKey && !key) {
      console.error("[catalog-proxy] request.missing-secret", { provider: request.provider, secret: secretName });
      return json({ error: "Catalog search is not configured. Please try again later." }, 503);
    }

    try {
      if (!await dependencies.consumeRequest(userId, request.provider === "tcgtracking" ? "pokemon"
        // Barcode-code lookups share the product bucket; no limiter migration needed.
        : request.provider === "barcodenest" ? "barcode" : request.provider)) {
        warnLog("request.user-limit-reached", { userId, provider: request.provider });
        return json({ error: "Catalog request limit reached. Please try again later." }, 429);
      }
      if (request.provider === "upc" && !await dependencies.reserveUpcRequest(!/^\d+$/.test(request.query))) {
        return json({ error: "The free product catalog is busy. Please try again later." }, 429);
      }
      if (request.provider === "magic") {
        // Admission is shared across Edge instances, since Scryfall now sees
        // the combined traffic of all users. Bound waiting to one second.
        let reserved = false;
        for (let attempt = 0; attempt < 11; attempt += 1) {
          if (await dependencies.reserveMagicRequest()) {
            reserved = true;
            break;
          }
          if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!reserved) return json({ error: "The card catalog is busy. Please try again shortly." }, 429);
      }
    } catch (error) {
      // Do not spend vendor quota if the authoritative limiter is unavailable.
      console.error("[catalog-proxy] request.limiter-unavailable", { provider: request.provider, ...errorSummary(error) });
      return json({ error: "Catalog search is temporarily unavailable. Please try again." }, 503);
    }

    if (request.provider === "tcgapi") return handleTcgApi(request, key!, dependencies, userId);
    if (request.provider === "price") return handlePrice(request, dependencies);

    let url: URL;
    let body: string | undefined;
    const headers: Record<string, string> = { Accept: "application/json" };
    const rosterId = request.provider === "pokemon" ? request.path.match(/^\/sets\/([a-zA-Z0-9_-]+)\/cards$/)?.[1] : undefined;
    const isSetList = request.provider === "pokemon" && request.path === "/sets";
    if (request.provider === "tcgtracking") {
      url = new URL(`https://openapi.tcgtracking.com/v1${request.path}`);
    } else if (request.provider === "pokemon") {
      url = new URL(`https://api.pokemontcg.io/v2${request.path}`);
      if (rosterId) {
        url = new URL("https://api.pokemontcg.io/v2/cards");
        url.search = new URLSearchParams({ q: `set.id:"${rosterId}"`, page: "1", pageSize: "250", orderBy: "number" }).toString();
      }
      if (isSetList) {
        url = new URL("https://api.pokemontcg.io/v2/sets");
        url.search = new URLSearchParams({ page: "1", pageSize: "250", orderBy: "-releaseDate" }).toString();
      }
      headers["X-Api-Key"] = key!;
    } else if (request.provider === "riftbound") {
      url = new URL(`https://api.riftcodex.com${request.path}`);
      headers["User-Agent"] = "Show-Off/1.0.0 (catalog-proxy)";
    } else if (request.provider === "magic") {
      url = new URL(`https://api.scryfall.com${request.path}`);
      headers["User-Agent"] = "Show-Off/1.0.0 (catalog-proxy)";
    } else if (request.provider === "barcodenest") {
      url = new URL(`https://api.barcodenest.com/v1/products/${encodeURIComponent(request.code)}`);
      headers["X-API-Key"] = key!;
    } else if (request.provider === "upc") {
      const isCode = /^\d+$/.test(request.query);
      url = new URL(`https://api.upcitemdb.com/prod/trial/${isCode ? "lookup" : "search"}`);
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(isCode ? { upc: request.query } : { q: request.query });
    } else {
      url = new URL("https://api.barcodelookup.com/v3/products");
      url.search = new URLSearchParams({
        search: request.query,
        formatted: "y",
        key: key!,
        page: String(request.page),
        ...(request.brand ? { brand: request.brand } : {}),
        ...(request.manufacturer ? { manufacturer: request.manufacturer } : {}),
        ...(request.category ? { category: request.category } : {}),
      }).toString();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), rosterId ? 30_000 : UPSTREAM_TIMEOUT_MS);
    try {
      const response = await dependencies.fetch(url, {
        ...(body ? { method: "POST", body } : {}),
        headers,
        signal: controller.signal,
        redirect: "error",
      });
      // BarcodeNest 404 is an unindexed code: the backups below may know it.
      const barcodeNestUnindexed = request.provider === "barcodenest" && response.status === 404;
      if (!response.ok && !barcodeNestUnindexed) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) {
          if (request.provider === "upc") await dependencies.deferUpcRequests(upcRetryDelay(response.headers));
          return json({ error: "The catalog provider is busy. Please try again later." }, 429);
        }
        // BarcodeNest 400 is a failed check digit: "no product", so item
        // creation can continue without one.
        if (request.provider === "barcodenest" && response.status === 400) {
          return json({ barcode: request.code, found: false, product: null });
        }
        if (response.status === 404) {
          return request.provider === "barcode"
            ? json({ products: [] })
            : json({ error: "No matching card was found." }, 404);
        }
        // Vendor responses and URLs can contain credentials. Never forward them.
        return json({ error: "The catalog provider is temporarily unavailable. Please try again." }, 502);
      }
      let data: unknown;
      if (request.provider === "barcodenest" && barcodeNestUnindexed) {
        await response.body?.cancel().catch(() => undefined);
        data = { barcode: request.code, found: false, product: null };
      } else {
        data = await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES);
      }
      if (isSetList) {
        const sets = parsePokemonSetList(data);
        if (sets.length === 0) throw new Error("Empty set list");
        try {
          await dependencies.persistPokemonSets(sets.map(pokemonSetToCacheRow), controller.signal);
        } catch {
          return json({ error: "Could not save catalog results. Please try again." }, 503);
        }
        // Clients re-read the table; never echo vendor payloads they don't need.
        return json({ count: sets.length });
      }
      if (request.provider === "pokemon" || request.provider === "tcgtracking") {
        let cards: PokemonTcgCard[];
        if (request.provider === "tcgtracking") {
          if (request.path.startsWith("/3/search?")) {
            setSearchSchema.parse(data);
            return json(data);
          }
          cards = parseTrackingCards(data);
        } else if (rosterId) {
          const first = pokemonSearchResponseSchema.parse(data);
          const total = first.totalCount;
          if (!Number.isInteger(total) || total < 1 || total > 1000 || first.page !== 1) throw new Error("Invalid roster");
          cards = [...first.data];
          for (let page = 2; cards.length < total && page <= 4; page += 1) {
            if (!await dependencies.consumeRequest(userId, "pokemon")) return json({ error: "Catalog request limit reached. Please try again later." }, 429);
            url.searchParams.set("page", String(page));
            const nextResponse = await dependencies.fetch(url, { headers, signal: controller.signal, redirect: "error" });
            if (!nextResponse.ok) { await nextResponse.body?.cancel(); throw new Error("Roster page unavailable"); }
            const next = pokemonSearchResponseSchema.parse(await readBoundedJson(nextResponse.body, RESPONSE_LIMIT_BYTES));
            if (next.totalCount !== total || next.page !== page || next.data.length === 0) throw new Error("Inconsistent roster");
            cards.push(...next.data);
          }
          if (cards.length !== total || new Set(cards.map(card => card.id)).size !== total || cards.some(card => card.set.id !== rosterId)) throw new Error("Incomplete roster");
          data = { data: cards, page: 1, pageSize: total, count: total, totalCount: total };
        } else {
          cards = request.path.startsWith("/cards?") ? pokemonSearchResponseSchema.parse(data).data : [pokemonCardResponseSchema.parse(data).data];
        }
        // Keep manual/private IDs out of the shared vendor namespace.
        for (const card of cards) {
          const validId = request.provider === "pokemon" ? /^[a-zA-Z0-9_-]{1,100}$/ : /^tcgtracking:[1-9][0-9]{0,15}$/;
          if (!validId.test(card.id) || !validId.test(card.set.id)) throw new Error("Invalid catalog ID");
          for (const image of [card.images.small, card.images.large]) {
            if (image && (new URL(image).protocol !== "https:" || new URL(image).username || new URL(image).password)) throw new Error("Invalid catalog image");
          }
        }
        try {
          if (cards.length) await dependencies.persistPokemonCards(cards.map(pokemonCardToCacheRow), controller.signal);
          if (rosterId) {
            const set = cards[0].set;
            await dependencies.persistPokemonRoster({ set_id: rosterId, set_name: set.name, set_series: set.series ?? null, printed_total: set.printedTotal ?? null, total: set.total ?? null, cached_card_count: cards.length, is_complete: true, cached_at: new Date().toISOString(), updated_at: new Date().toISOString() }, controller.signal);
          }
        } catch {
          return json({ error: "Could not save catalog results. Please try again." }, 503);
        }
      }
      // BarcodeNest rarely has images for books or store brands, and misses
      // some codes entirely; fill both from backups before persisting.
      if (request.provider === "barcodenest") data = await withBarcodeBackups(request.code, data, dependencies, controller.signal);
      if (request.provider === "barcode" || request.provider === "upc" || request.provider === "barcodenest") {
        const products = request.provider === "barcode" ? parseBarcodeProducts(data)
          : request.provider === "barcodenest" ? parseBarcodeNestProducts(data) : parseUpcProducts(data);
        const rows = productsToCacheRows(products);
        if (rows.length > 0) {
          try {
            await dependencies.persistProducts(rows, controller.signal);
          } catch {
            return json({ error: "Could not save product results. Please try again." }, 503);
          }
        }
      }
      if (request.provider === "riftbound") {
        const cards = parseRiftboundCards(request.path, data);
        // Same trusted-write boundary as Magic: only saved cards are returned.
        if (cards.length > 0) {
          try {
            await dependencies.persistRiftboundCards(cards.map(riftboundCardToCacheRow), controller.signal);
          } catch {
            return json({ error: "Could not save catalog results. Please try again." }, 503);
          }
        }
      }
      if (request.provider === "magic") {
        const cards = request.path.startsWith("/cards/search?")
          ? scryfallSearchResponseSchema.parse(data).data
          : [magicCardSchema.parse(data)];
        // A failed write must not return cards that the batch-save RPC cannot
        // reference. No caller-supplied card records reach this write boundary.
        if (cards.length > 0) {
          try {
            await dependencies.persistMagicCards(cards.map(magicCardToCacheRow));
          } catch {
            return json({ error: "Could not save catalog results. Please try again." }, 503);
          }
        }
      }
      return json(data);
    } catch {
      return json({ error: controller.signal.aborted
        ? "Catalog search timed out. Please try again."
        : "The catalog provider could not be reached. Please try again." },
      controller.signal.aborted ? 504 : 502);
    } finally {
      clearTimeout(timeout);
    }
  };
}
