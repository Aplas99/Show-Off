import { validateCatalogRequest } from "@/lib/catalogValidation";
import { magicCardSchema, magicCardToCacheRow, scryfallSearchResponseSchema } from "@/lib/magicCatalog";
import { barcodeNestNeedsImage, openLibraryCoverUrl, parseBarcodeNestProducts, parseBarcodeProducts, parseUpcProducts, productsToCacheRows, upcRetryDelay, withBarcodeNestImage } from "@/lib/productCatalog";

import {
  POKEWALLET_PAGE_SIZE,
  POKEWALLET_SET_MAX_PAGES,
  POKEWALLET_SET_PAGE_SIZE,
  cacheRowToTcgCard,
  parsePokewalletSearch,
  parsePokewalletSetPage,
  pokewalletImagePath,
  tcgCardImagePath,
  tcgCardToCacheRow,
  type PokewalletCard,
} from "@/lib/pokewalletCatalog";
import { isPokemonPriceRedirect, pickTcgTrackingMarketPrice, tcgplayerIdFromUrl } from "@/lib/cardPricing";
import { parseRiftboundCards, riftboundCardToCacheRow } from "@/lib/riftboundCatalog";
import { parsePokemonSetList, pokemonCardResponseSchema, pokemonSearchResponseSchema, pokemonCardToCacheRow, pokemonSetToCacheRow, type PokemonTcgCard } from "@/lib/pokemonCatalog";
import { parseTrackingCards, setSearchSchema } from "@/lib/tcgTrackingCatalog";

const REQUEST_LIMIT_BYTES = 8 * 1024;
const RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const POKEWALLET_TIMEOUT_MS = 30_000;
const CARD_IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export interface CatalogProxyDependencies {
  authenticate: (token: string) => Promise<string | null>;
  consumeRequest: (userId: string, provider: "pokemon" | "barcode" | "magic" | "upc" | "riftbound" | "pokewallet" | "price") => Promise<boolean>;
  reserveMagicRequest: () => Promise<boolean>;
  persistMagicCards: (rows: ReturnType<typeof magicCardToCacheRow>[]) => Promise<void>;
  persistRiftboundCards: (rows: ReturnType<typeof riftboundCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistPokemonCards: (rows: ReturnType<typeof pokemonCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistPokemonRoster: (row: Record<string, unknown>, signal: AbortSignal) => Promise<void>;
  persistPokemonSets: (rows: ReturnType<typeof pokemonSetToCacheRow>[], signal: AbortSignal) => Promise<void>;
  persistProducts: (rows: ReturnType<typeof productsToCacheRows>, signal: AbortSignal) => Promise<void>;
  persistTcgCards: (rows: ReturnType<typeof tcgCardToCacheRow>[], signal: AbortSignal) => Promise<void>;
  /** Already-copied image URLs for cached cards, keyed by card id. */
  findTcgCardImages: (ids: string[], signal: AbortSignal) => Promise<Record<string, string | null>>;
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
  /** Marks a PokéWallet set as fully cached in tcg_cards (tcg_set_rosters). */
  persistTcgSetRoster: (row: { game: string; set_id: string; set_name: string | null; card_count: number; cached_at: string }, signal: AbortSignal) => Promise<void>;
  /** Uploads a card image to the public tcg-card-images bucket; returns its public URL. */
  storeTcgCardImage: (path: string, bytes: Uint8Array, contentType: string, signal: AbortSignal) => Promise<string>;
  reserveUpcRequest: (isSearch: boolean) => Promise<boolean>;
  deferUpcRequests: (seconds: number) => Promise<void>;
  getSecret: (name: "POKEMON_TCG_API_KEY" | "BARCODE_LOOKUP_API_KEY" | "BARCODENEST_KEY" | "POKEWALLET_API_KEY") => string | undefined;
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

/** Strips anything shaped like a PokéWallet key from vendor text. */
function redact(text: string) {
  return text.replace(/pk_(?:live|test)_[A-Za-z0-9]+/g, "pk_***");
}

/** PokéWallet's quota headers, so logs show how close the shared plan is to its limit. */
function rateLimitDetails(response: Response) {
  return {
    remainingHour: response.headers.get("X-RateLimit-Remaining-Hour"),
    remainingDay: response.headers.get("X-RateLimit-Remaining-Day"),
  };
}

/**
 * Status and the vendor's short `error`/`message` text for a failed
 * response. Reads at most 4 KB and consumes the body.
 */
async function vendorFailureDetails(response: Response) {
  let vendorError: string | null = null;
  try {
    const text = new TextDecoder().decode(await readBoundedBytes(response.body, 4096));
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    const parts = [body.error, body.message].filter((part): part is string => typeof part === "string");
    vendorError = parts.length > 0 ? redact(parts.join(": ")).slice(0, 200) : null;
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
  return { status: response.status, vendorError, ...rateLimitDetails(response) };
}

/**
 * A PokéWallet call failed after it was sent. Logs the cause to the function
 * logs (error name and message only; never the key or a vendor body) and
 * tells the user whether the provider was unreachable or answered with data
 * we couldn't read.
 */
function pokewalletFailure(game: string, error: unknown, timedOut: boolean) {
  if (timedOut) return json({ error: "Catalog search timed out. Please try again." }, 504);
  const { name, message } = errorSummary(error);
  console.error("[catalog-proxy] pokewallet.failed", { game, name, message });
  const unreadable = name === "ZodError" || name === "SyntaxError";
  return json({ error: unreadable
    ? "The card catalog sent a response the app couldn't read. Please try again later."
    : "The catalog provider could not be reached. Please try again." }, 502);
}

/**
 * Full roster of one PokéWallet set for set completion. Up to five pages of
 * 200 cards; each page after the first spends another limiter request.
 * Images are not copied here (that would cost one request per card): cards
 * keep any image already stored, and search copies the rest later.
 */
async function handlePokewalletSet(request: PokewalletRequest, setId: string, key: string, dependencies: CatalogProxyDependencies, userId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POKEWALLET_TIMEOUT_MS);
  const headers = { Accept: "application/json", "X-API-Key": key };
  const startedAt = Date.now();
  debugLog(dependencies, "pokewallet.set.started", { game: request.game, setId });
  try {
    const cards: PokewalletCard[] = [];
    let setName: string | null = null;
    for (let page = 1; page <= POKEWALLET_SET_MAX_PAGES; page += 1) {
      if (page > 1 && !await dependencies.consumeRequest(userId, "pokewallet")) {
        return json({ error: "Catalog request limit reached. Please try again later." }, 429);
      }
      const url = new URL(`https://api.pokewallet.io/${request.game}/sets/${setId}`);
      url.search = new URLSearchParams({ page: String(page), limit: String(POKEWALLET_SET_PAGE_SIZE) }).toString();
      const pageStartedAt = Date.now();
      const response = await dependencies.fetch(url, { headers, signal: controller.signal, redirect: "error" });
      debugLog(dependencies, "pokewallet.set.upstream", {
        game: request.game, setId, page, status: response.status, durationMs: Date.now() - pageStartedAt, ...rateLimitDetails(response),
      });
      if (!response.ok) {
        warnLog("pokewallet.set.upstream-failed", { game: request.game, setId, page, ...await vendorFailureDetails(response) });
        if (response.status === 404) return json({ error: "That set was not found." }, 404);
        if (response.status === 429) return json({ error: "The card catalog is busy. Please try again later." }, 429);
        return json({ error: "The catalog provider is temporarily unavailable. Please try again." }, 502);
      }
      const parsed = parsePokewalletSetPage(request.game, await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
      setName ??= parsed.setName;
      cards.push(...parsed.cards);
      debugLog(dependencies, "pokewallet.set.page-parsed", {
        game: request.game, setId, page, rawCount: parsed.rawCount, cardCount: parsed.cards.length,
      });
      if (parsed.rawCount < POKEWALLET_SET_PAGE_SIZE) break;
      // A set that fills every page may be truncated; don't mark it complete.
      if (page === POKEWALLET_SET_MAX_PAGES) throw new Error("Set roster too large");
    }

    const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
    let stored: Record<string, string | null> = {};
    try {
      stored = await dependencies.findTcgCardImages(unique.map((card) => card.id), controller.signal);
    } catch (error) {
      // Without the lookup, rows are written without images; search re-copies them.
      warnLog("pokewallet.set.image-lookup-failed", { game: request.game, setId, ...errorSummary(error) });
    }
    const rows = unique.map((card) => tcgCardToCacheRow(request.game, card, stored[card.id] ?? null));
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
      console.error("[catalog-proxy] pokewallet.set.save-failed", { game: request.game, setId, rows: rows.length, ...errorSummary(error) });
      return json({ error: "Could not save catalog results. Please try again." }, 503);
    }
    debugLog(dependencies, "pokewallet.set.completed", {
      game: request.game, setId, setName, cardCount: rows.length, durationMs: Date.now() - startedAt,
    });
    return json({ setName, cards: rows.map(cacheRowToTcgCard) });
  } catch (error) {
    return pokewalletFailure(request.game, error, controller.signal.aborted);
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

type PokewalletRequest = Extract<ReturnType<typeof validateCatalogRequest>, { provider: "pokewallet" }>;

/**
 * PokéWallet search for the shared TCG pipeline. Cards are saved before they
 * are returned, and each card image is copied once into Storage, because
 * PokéWallet images need the API key and can't be loaded by the app.
 */
async function handlePokewallet(request: PokewalletRequest, key: string, dependencies: CatalogProxyDependencies, userId: string) {
  if (request.setId) return handlePokewalletSet(request, request.setId, key, dependencies, userId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POKEWALLET_TIMEOUT_MS);
  const headers = { Accept: "application/json", "X-API-Key": key };
  try {
    const url = new URL(`https://api.pokewallet.io/${request.game}/search`);
    url.search = new URLSearchParams({
      // validateCatalogRequest guarantees a query when there is no setId.
      q: request.query ?? "",
      page: String(request.page),
      limit: String(POKEWALLET_PAGE_SIZE),
    }).toString();
    const startedAt = Date.now();
    debugLog(dependencies, "pokewallet.search.started", { game: request.game, query: request.query, page: request.page });
    const response = await dependencies.fetch(url, { headers, signal: controller.signal, redirect: "error" });
    debugLog(dependencies, "pokewallet.search.upstream", {
      game: request.game, status: response.status, durationMs: Date.now() - startedAt, ...rateLimitDetails(response),
    });
    if (!response.ok) {
      warnLog("pokewallet.search.upstream-failed", { game: request.game, query: request.query, ...await vendorFailureDetails(response) });
      if (response.status === 404) return json({ cards: [], page: request.page, total: 0, totalPages: 0 });
      if (response.status === 429) return json({ error: "The card catalog is busy. Please try again later." }, 429);
      // Vendor responses can echo the key in examples. Never forward them.
      return json({ error: "The catalog provider is temporarily unavailable. Please try again." }, 502);
    }
    const search = parsePokewalletSearch(request.game, await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES));
    debugLog(dependencies, "pokewallet.search.parsed", {
      game: request.game, cardCount: search.cards.length, total: search.total, page: search.page, totalPages: search.totalPages,
    });

    let stored: Record<string, string | null> = {};
    try {
      stored = await dependencies.findTcgCardImages(search.cards.map((card) => card.id), controller.signal);
    } catch (error) {
      // Without the lookup, images are copied again; the upload overwrites.
      warnLog("pokewallet.search.image-lookup-failed", { game: request.game, ...errorSummary(error) });
    }
    const imageStats = { reused: 0, copied: 0, skipped: 0, failed: 0 };
    const images = await Promise.all(search.cards.map(async (card) => {
      const existing = stored[card.id];
      if (existing) {
        imageStats.reused += 1;
        return existing;
      }
      const imagePath = pokewalletImagePath(request.game, card);
      if (!imagePath) {
        imageStats.skipped += 1;
        return null;
      }
      try {
        const imageResponse = await dependencies.fetch(
          new URL(`https://api.pokewallet.io${imagePath}`),
          { headers: { "X-API-Key": key }, signal: controller.signal, redirect: "error" },
        );
        const contentType = imageResponse.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
        if (!imageResponse.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
          imageStats.failed += 1;
          let failure: Record<string, unknown> = { status: imageResponse.status };
          if (imageResponse.ok) {
            await imageResponse.body?.cancel().catch(() => undefined);
          } else {
            failure = await vendorFailureDetails(imageResponse);
          }
          warnLog("pokewallet.image.upstream-failed", {
            game: request.game, cardId: card.id, path: imagePath, contentType, ...failure,
          });
          return null;
        }
        const bytes = await readBoundedBytes(imageResponse.body, CARD_IMAGE_LIMIT_BYTES);
        const publicUrl = await dependencies.storeTcgCardImage(tcgCardImagePath(request.game, card.id), bytes, contentType, controller.signal);
        imageStats.copied += 1;
        return publicUrl;
      } catch (error) {
        // A card without an image is still saved; the app shows a placeholder.
        imageStats.failed += 1;
        warnLog("pokewallet.image.copy-failed", { game: request.game, cardId: card.id, path: imagePath, ...errorSummary(error) });
        return null;
      }
    }));

    const rows = search.cards.map((card, index) => tcgCardToCacheRow(request.game, card, images[index]));
    if (rows.length > 0) {
      try {
        await dependencies.persistTcgCards(rows, controller.signal);
      } catch (error) {
        console.error("[catalog-proxy] pokewallet.search.save-failed", { game: request.game, rows: rows.length, ...errorSummary(error) });
        return json({ error: "Could not save catalog results. Please try again." }, 503);
      }
    }
    debugLog(dependencies, "pokewallet.search.completed", {
      game: request.game, saved: rows.length, images: imageStats, durationMs: Date.now() - startedAt,
    });
    return json({ cards: rows.map(cacheRowToTcgCard), page: search.page, total: search.total, totalPages: search.totalPages });
  } catch (error) {
    return pokewalletFailure(request.game, error, controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
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
      : request.provider === "pokewallet" ? "POKEWALLET_API_KEY" : "BARCODE_LOOKUP_API_KEY";
    const needsKey = request.provider === "pokemon" || request.provider === "barcode" || request.provider === "barcodenest"
      || request.provider === "pokewallet";
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

    if (request.provider === "pokewallet") return handlePokewallet(request, key!, dependencies, userId);
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
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) {
          if (request.provider === "upc") await dependencies.deferUpcRequests(upcRetryDelay(response.headers));
          return json({ error: "The catalog provider is busy. Please try again later." }, 429);
        }
        // BarcodeNest: 404 is an unindexed code and 400 a failed check digit.
        // Both mean "no product" so item creation can continue without one.
        if (request.provider === "barcodenest" && (response.status === 404 || response.status === 400)) {
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
      let data = await readBoundedJson(response.body, RESPONSE_LIMIT_BYTES);
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
      // BarcodeNest rarely has images for books; use the Open Library cover
      // when one exists. A failed check just leaves the product imageless.
      if (request.provider === "barcodenest" && barcodeNestNeedsImage(data)) {
        const cover = openLibraryCoverUrl(request.code);
        if (cover) {
          try {
            const coverResponse = await dependencies.fetch(cover, { method: "HEAD", signal: controller.signal, redirect: "manual" });
            await coverResponse.body?.cancel().catch(() => undefined);
            // Open Library answers an existing cover with a redirect to its CDN.
            if (coverResponse.ok || (coverResponse.status >= 300 && coverResponse.status < 400)) {
              data = withBarcodeNestImage(data, cover);
            }
          } catch {
            // Cover lookup is best-effort.
          }
        }
      }
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
