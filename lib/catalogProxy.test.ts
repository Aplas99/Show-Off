import { riftboundCard } from "@/lib/riftboundCatalog.fixture";
import { createCatalogProxyHandler } from "@/supabase/functions/_shared/catalogProxy";

const pokemonCard = { id: "base1-4", name: "Charizard", supertype: "Pokemon", set: { id: "base1", name: "Base" }, number: "4", images: { small: "https://images.pokemontcg.io/base1/4.png", large: "https://images.pokemontcg.io/base1/4_hires.png" } };
function setup() {
  const dependencies = {
    authenticate: jest.fn().mockResolvedValue("user-1"),
    consumeRequest: jest.fn().mockResolvedValue(true),
    reserveMagicRequest: jest.fn().mockResolvedValue(true),
    persistMagicCards: jest.fn().mockResolvedValue(undefined),
    persistRiftboundCards: jest.fn().mockResolvedValue(undefined),
    persistPokemonCards: jest.fn().mockResolvedValue(undefined),
    persistPokemonRoster: jest.fn().mockResolvedValue(undefined),
    persistPokemonSets: jest.fn().mockResolvedValue(undefined),
    persistProducts: jest.fn().mockResolvedValue(undefined),
    persistTcgCards: jest.fn().mockResolvedValue(undefined),
    findTcgSets: jest.fn().mockResolvedValue([]),
    persistTcgSets: jest.fn().mockResolvedValue(undefined),
    persistTcgSetRoster: jest.fn().mockResolvedValue(undefined),
    findTodayPrice: jest.fn().mockResolvedValue(null),
    findTcgplayerSource: jest.fn().mockResolvedValue({ productId: 557921, resolved: false, pokemonPriceUrl: null }),
    saveTcgplayerProduct: jest.fn().mockResolvedValue(undefined),
    persistPriceSnapshot: jest.fn().mockResolvedValue(undefined),
    reserveUpcRequest: jest.fn().mockResolvedValue(true),
    deferUpcRequests: jest.fn().mockResolvedValue(undefined),
    getSecret: jest.fn().mockReturnValue("server-only-key"),
    fetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: pokemonCard }))),
  };
  return { dependencies, handler: createCatalogProxyHandler(dependencies) };
}

function request(body: unknown = { provider: "pokemon", path: "/cards/base1-4" }, authenticated = true) {
  return new Request("https://project.invalid/functions/v1/catalog-proxy", {
    method: "POST",
    headers: authenticated ? { Authorization: "Bearer user-token" } : {},
    body: JSON.stringify(body),
  });
}

describe("authenticated catalog proxy", () => {
  it("persists official Pokemon cards and rejects caller-written records", async () => {
    const { handler, dependencies } = setup();
    expect((await handler(request())).status).toBe(200);
    expect(dependencies.persistPokemonCards).toHaveBeenCalledWith([expect.objectContaining({ id: "base1-4", catalog_trusted: true })], expect.any(AbortSignal));
    expect((await handler(request({ provider: "pokemon", path: "/cards/base1-4", cards: [pokemonCard] }))).status).toBe(400);
  });
  it("does not return unsaved or forged vendor cards", async () => {
    const { handler, dependencies } = setup();
    dependencies.persistPokemonCards.mockRejectedValue(new Error("private details"));
    expect((await handler(request())).status).toBe(503);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...pokemonCard, id: "manual:forged" } })));
    expect((await handler(request())).status).toBe(502);
    expect(dependencies.persistPokemonCards).toHaveBeenCalledTimes(1);
  });
  it("uses server-only tracking requests without forwarding Pokemon secrets", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ set_id: 12, set_name: "Base", products: [{ id: 34, name: "Charizard", number: "4" }] })));
    expect((await handler(request({ provider: "tcgtracking", path: "/3/sets/12/cards" }))).status).toBe(200);
    expect(dependencies.fetch.mock.calls[0][0].toString()).toBe("https://openapi.tcgtracking.com/v1/3/sets/12/cards");
    expect(dependencies.getSecret).not.toHaveBeenCalled();
    expect(dependencies.persistPokemonCards).toHaveBeenCalledWith([expect.objectContaining({ id: "tcgtracking:34" })], expect.any(AbortSignal));
  });
  it("marks only fully validated rosters complete", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [pokemonCard], page: 1, pageSize: 250, count: 1, totalCount: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ ...pokemonCard, id: "base1-5", number: "5" }], page: 2, pageSize: 250, count: 1, totalCount: 2 })));
    const response = await handler(request({ provider: "pokemon", path: "/sets/base1/cards" }));
    expect(response.status).toBe(200);
    expect(dependencies.persistPokemonRoster).toHaveBeenCalledWith(expect.objectContaining({ set_id: "base1", cached_card_count: 2, is_complete: true }), expect.any(AbortSignal));
    expect(dependencies.consumeRequest).toHaveBeenCalledTimes(2);
  });
  it.each(["duplicate", "changed-count", "wrong-set"])("rejects an inconsistent %s roster", async (scenario) => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [pokemonCard], page: 1, pageSize: 250, count: 1, totalCount: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ ...pokemonCard, id: scenario === "duplicate" ? pokemonCard.id : "base1-5", set: scenario === "wrong-set" ? { id: "base2", name: "Other" } : pokemonCard.set }], page: 2, pageSize: 250, count: 1, totalCount: scenario === "changed-count" ? 3 : 2 })));
    expect((await handler(request({ provider: "pokemon", path: "/sets/base1/cards" }))).status).toBe(502);
    expect(dependencies.persistPokemonRoster).not.toHaveBeenCalled();
    expect(dependencies.persistPokemonCards).not.toHaveBeenCalled();
  });
  it("refreshes the shared set list with server-chosen parameters", async () => {
    const { handler, dependencies } = setup();
    const sets = [
      { id: "me5", name: "Future Set", series: "Mega", printedTotal: 120, total: 140, ptcgoCode: "FUT", releaseDate: "2026/11/07" },
      { id: "swshp", name: "SWSH Black Star Promos", ptcgoCode: "PR-SW" },
      { id: "bad id!", name: "Forged" },
    ];
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: sets, page: 1, pageSize: 250, count: 3, totalCount: 3 })));
    const response = await handler(request({ provider: "pokemon", path: "/sets" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 2 });
    expect(dependencies.fetch.mock.calls[0][0].toString())
      .toBe("https://api.pokemontcg.io/v2/sets?page=1&pageSize=250&orderBy=-releaseDate");
    expect(dependencies.persistPokemonSets).toHaveBeenCalledWith([
      expect.objectContaining({ id: "me5", ptcgo_code: "FUT", printed_total: 120, release_date: "2026-11-07" }),
      expect.objectContaining({ id: "swshp", ptcgo_code: "PR-SW", release_date: null }),
    ], expect.any(AbortSignal));
    expect(dependencies.persistPokemonCards).not.toHaveBeenCalled();
  });
  it("rejects a partial set list and does not report unsaved sets", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "me5", name: "Future Set" }], page: 1, pageSize: 250, count: 1, totalCount: 300 })));
    expect((await handler(request({ provider: "pokemon", path: "/sets" }))).status).toBe(502);
    expect(dependencies.persistPokemonSets).not.toHaveBeenCalled();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "me5", name: "Future Set" }], page: 1, pageSize: 250, count: 1, totalCount: 1 })));
    dependencies.persistPokemonSets.mockRejectedValueOnce(new Error("db down"));
    expect((await handler(request({ provider: "pokemon", path: "/sets" }))).status).toBe(503);
  });
  it("caches barcode provider records before returning them", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ products: [
      { title: "Book", barcode_number: "0012345678905" },
    ] })));
    expect((await handler(request({ provider: "barcode", query: "book" }))).status).toBe(200);
    expect(dependencies.persistProducts).toHaveBeenCalledWith([
      expect.objectContaining({ ean: "12345678905", searchableTitle: "Book", data: expect.objectContaining({ ean: "0012345678905" }) }),
    ], expect.any(AbortSignal));
  });

  it.each([
    ["12345678", "lookup", { upc: "12345678" }, false],
    ["book&url=other", "search", { q: "book&url=other" }, true],
  ])("uses the fixed UPC endpoint for %s without vendor credentials", async (query, endpoint, body, isSearch) => {
    const { handler, dependencies } = setup();
    dependencies.getSecret.mockReturnValue(undefined);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "OK", items: [{ title: "Book", ean: "12345678" }] })));
    expect((await handler(request({ provider: "upc", query }))).status).toBe(200);
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe(`https://api.upcitemdb.com/prod/trial/${endpoint}`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(body);
    expect(options.redirect).toBe("error");
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "upc");
    expect(dependencies.reserveUpcRequest).toHaveBeenCalledWith(isSearch);
    expect(dependencies.getSecret).not.toHaveBeenCalled();
    expect(dependencies.persistProducts).toHaveBeenCalledTimes(1);
  });

  it("rejects forged product payloads and invalid provider envelopes", async () => {
    const { handler, dependencies } = setup();
    expect((await handler(request({ provider: "barcode", query: "book", products: [] }))).status).toBe(400);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "EXCEED_LIMIT", items: [] })));
    expect((await handler(request({ provider: "upc", query: "book" }))).status).toBe(502);
    expect(dependencies.persistProducts).not.toHaveBeenCalled();
  });

  it("returns an actionable failure when product persistence fails", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ products: [{ title: "Book", barcode_number: "12345678" }] })));
    dependencies.persistProducts.mockRejectedValue(new Error("private SQL details"));
    const response = await handler(request({ provider: "barcode", query: "book" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private SQL details");
  });

  it("does not contact UPC when shared trial admission fails or is unavailable", async () => {
    const { handler, dependencies } = setup();
    dependencies.reserveUpcRequest.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("private"));
    expect((await handler(request({ provider: "upc", query: "book" }))).status).toBe(429);
    expect((await handler(request({ provider: "upc", query: "book" }))).status).toBe(503);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("shares provider-requested UPC cooldowns without retrying upstream", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response("private", { status: 429, headers: { "Retry-After": "120" } }));
    expect((await handler(request({ provider: "upc", query: "book" }))).status).toBe(429);
    expect(dependencies.deferUpcRequests).toHaveBeenCalledWith(120);
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
    expect(dependencies.persistProducts).not.toHaveBeenCalled();
  });

  const magicCard = {
    id: "b7bd7fed-1d0a-49d1-af01-875843c73e45", name: "Lightning Bolt",
    card_faces: [{ name: "Front", type_line: "Instant", image_uris: { normal: "https://cards.scryfall.io/front.jpg" } }],
    prices: { usd: "1.25", usd_foil: "invalid" },
  };

  it.each(["/cards/search?q=bolt", "/cards/named?fuzzy=bolt"])("persists validated server results before returning %s", async (path) => {
    const { handler, dependencies } = setup();
    dependencies.getSecret.mockReturnValue(undefined);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify(
      path.startsWith("/cards/search") ? { object: "list", data: [magicCard] } : magicCard,
    )));
    const response = await handler(request({ provider: "magic", path }));
    expect(response.status).toBe(200);
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "magic");
    expect(dependencies.reserveMagicRequest).toHaveBeenCalledTimes(1);
    expect(dependencies.getSecret).not.toHaveBeenCalled();
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.origin).toBe("https://api.scryfall.com");
    expect(options.headers).toEqual({ Accept: "application/json", "User-Agent": "Show-Off/1.0.0 (catalog-proxy)" });
    expect(options.redirect).toBe("error");
    expect(dependencies.persistMagicCards).toHaveBeenCalledWith([expect.objectContaining({
      id: magicCard.id, type_line: "Instant", image_normal: "https://cards.scryfall.io/front.jpg",
      price_usd: 1.25, price_usd_foil: null,
    })]);
  });

  it("rejects caller-supplied cards and malformed provider records without writing", async () => {
    const { handler, dependencies } = setup();
    const body = { provider: "magic", path: "/cards/search?q=bolt" };
    expect((await handler(request({ ...body, cards: [magicCard] }))).status).toBe(400);
    expect(dependencies.fetch).not.toHaveBeenCalled();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ object: "list", data: [magicCard, { id: "bad" }] })));
    expect((await handler(request(body))).status).toBe(502);
    expect(dependencies.persistMagicCards).not.toHaveBeenCalled();
  });

  it("fails safely when the shared cache cannot be saved", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify(magicCard)));
    dependencies.persistMagicCards.mockRejectedValue(new Error("private SQL details"));
    const response = await handler(request({ provider: "magic", path: "/cards/named?fuzzy=bolt" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private SQL details");
  });

  it("does not retry provider throttling or cache not-found responses", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response("private", { status: 429 }));
    expect((await handler(request({ provider: "magic", path: "/cards/named?fuzzy=bolt" }))).status).toBe(429);
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
    dependencies.fetch.mockResolvedValueOnce(new Response("private", { status: 404 }));
    expect((await handler(request({ provider: "magic", path: "/cards/named?fuzzy=bolt" }))).status).toBe(404);
    expect(dependencies.persistMagicCards).not.toHaveBeenCalled();
  });

  it("bounds waiting for shared admission and never contacts the vendor if busy", async () => {
    jest.useFakeTimers();
    try {
      const { handler, dependencies } = setup();
      dependencies.reserveMagicRequest.mockResolvedValue(false);
      const pending = handler(request({ provider: "magic", path: "/cards/named?fuzzy=bolt" }));
      await jest.advanceTimersByTimeAsync(1100);
      expect((await pending).status).toBe(429);
      expect(dependencies.reserveMagicRequest).toHaveBeenCalledTimes(11);
      expect(dependencies.fetch).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("fails closed if shared admission is unavailable", async () => {
    const { handler, dependencies } = setup();
    dependencies.reserveMagicRequest.mockRejectedValue(new Error("private SQL details"));
    expect((await handler(request({ provider: "magic", path: "/cards/named?fuzzy=bolt" }))).status).toBe(503);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("does not allow unauthenticated requests to spend vendor quota", async () => {
    const { handler, dependencies } = setup();
    expect((await handler(request(undefined, false))).status).toBe(401);
    dependencies.authenticate.mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    expect(dependencies.consumeRequest).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized and arbitrary-host requests before consuming quota", async () => {
    const { handler, dependencies } = setup();
    expect((await handler(request({ provider: "pokemon", path: "https://attacker.invalid" }))).status).toBe(400);
    expect((await handler(request({ provider: "barcode", query: "x".repeat(9000) }))).status).toBe(400);
    expect(dependencies.consumeRequest).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("fails closed for exhausted or unavailable request accounting", async () => {
    const { handler, dependencies } = setup();
    dependencies.consumeRequest.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(429);
    dependencies.consumeRequest.mockRejectedValue(new Error("private database details"));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("requires server configuration and never falls back to a public key", async () => {
    const { handler, dependencies } = setup();
    dependencies.getSecret.mockReturnValue(undefined);
    expect((await handler(request())).status).toBe(503);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("uses the verified user and sends credentials only to the fixed upstream", async () => {
    const { handler, dependencies } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "pokemon");
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.pokemontcg.io/v2/cards/base1-4");
    expect(options.headers).toEqual({ Accept: "application/json", "X-Api-Key": "server-only-key" });
    expect(options.redirect).toBe("error");
    expect(await response.text()).not.toContain("server-only-key");
  });

  it("encodes barcode query text and filters without permitting parameter injection", async () => {
    const { handler, dependencies } = setup();
    await handler(request({ provider: "barcode", query: "book&key=other", brand: "A&B", page: 2 }));
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.origin).toBe("https://api.barcodelookup.com");
    expect(url.searchParams.get("search")).toBe("book&key=other");
    expect(url.searchParams.get("brand")).toBe("A&B");
    expect(url.searchParams.get("key")).toBe("server-only-key");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("looks up BarcodeNest codes with a server-only header key and caches matches", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      barcode: "3017620422003", barcode_type: "EAN-13", canonical_gtin: "03017620422003", valid: true, found: true,
      product: { name: "Nutella", brand: "Ferrero", quantity: "400 g", image_url: "https://images.example/n.jpg", allergens: [] },
      source: { name: "Open Food Facts" }, error: null,
    })));
    expect((await handler(request({ provider: "barcodenest", code: "3017620422003" }))).status).toBe(200);
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.barcodenest.com/v1/products/3017620422003");
    expect(options.headers["X-API-Key"]).toBe("server-only-key");
    expect(dependencies.getSecret).toHaveBeenCalledWith("BARCODENEST_KEY");
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "barcode");
    expect(dependencies.persistProducts).toHaveBeenCalledWith([expect.objectContaining({
      ean: "3017620422003", data: expect.objectContaining({ title: "Nutella", brand: "Ferrero", images: ["https://images.example/n.jpg"] }),
    })], expect.any(AbortSignal));
  });

  it("falls back to an Open Library cover for imageless ISBN matches", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        barcode: "9781684058419", found: true, product: { name: "Teenage Mutant Ninja Turtles", image_url: null },
      })))
      .mockResolvedValueOnce(new Response(null, { status: 302 }));
    const response = await handler(request({ provider: "barcodenest", code: "9781684058419" }));
    const cover = "https://covers.openlibrary.org/b/isbn/9781684058419-L.jpg?default=false";
    expect((await response.json()).product.image_url).toBe(cover);
    expect(dependencies.fetch.mock.calls[1]).toEqual([cover, expect.objectContaining({ method: "HEAD" })]);
    expect(dependencies.persistProducts).toHaveBeenCalledWith([expect.objectContaining({
      data: expect.objectContaining({ images: [cover] }),
    })], expect.any(AbortSignal));
  });

  const upcLookup = (items: unknown[]) => new Response(JSON.stringify({ code: "OK", items }));

  it("keeps the product imageless and stamps the check when every backup misses", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ barcode: "9781684058419", found: true, product: { name: "Book" } })))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(upcLookup([]));
    const body = await (await handler(request({ provider: "barcodenest", code: "9781684058419" }))).json();
    expect(body.product.image_url).toBeUndefined();
    expect(body.image_checked_at).toEqual(expect.any(String));
    expect(dependencies.fetch).toHaveBeenCalledTimes(3);
    expect(dependencies.persistProducts).toHaveBeenCalledWith([expect.objectContaining({
      data: expect.objectContaining({ imageCheckedAt: body.image_checked_at }),
    })], expect.any(AbortSignal));
  });

  it("uses a UPCItemDB image for imageless non-ISBN matches on the shared trial budget", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ barcode: "036000291452", found: true, product: { name: "Tissue" } })))
      .mockResolvedValueOnce(upcLookup([{ title: "Kleenex Tissue", upc: "036000291452", images: ["http://img.example/t.jpg"] }]));
    const body = await (await handler(request({ provider: "barcodenest", code: "036000291452" }))).json();
    expect(body).toMatchObject({ product: { name: "Tissue", image_url: "https://img.example/t.jpg" }, image_source: "upcitemdb" });
    const [url, options] = dependencies.fetch.mock.calls[1];
    expect(url.toString()).toBe("https://api.upcitemdb.com/prod/trial/lookup");
    expect(JSON.parse(options.body)).toEqual({ upc: "036000291452" });
    expect(dependencies.reserveUpcRequest).toHaveBeenCalledWith(false);
    expect(dependencies.persistProducts).toHaveBeenCalledWith([expect.objectContaining({
      data: expect.objectContaining({ images: ["https://img.example/t.jpg"], imageSource: "upcitemdb" }),
    })], expect.any(AbortSignal));
  });

  it("falls back to a UPCItemDB product when BarcodeNest has not indexed the code", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(upcLookup([{ title: "Mug", brand: "Acme", ean: "0012345678905", images: ["https://img.example/m.jpg"] }]));
    const body = await (await handler(request({ provider: "barcodenest", code: "012345678905" }))).json();
    expect(body).toEqual({ barcode: "012345678905", found: true, product: { name: "Mug", brand: "Acme", image_url: "https://img.example/m.jpg" }, image_source: "upcitemdb" });
    expect(dependencies.persistProducts).toHaveBeenCalledTimes(1);
  });

  it("skips the UPCItemDB backup when its trial budget is exhausted", async () => {
    const { handler, dependencies } = setup();
    dependencies.reserveUpcRequest.mockResolvedValueOnce(false);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ barcode: "036000291452", found: true, product: { name: "Tissue" } })));
    expect((await handler(request({ provider: "barcodenest", code: "036000291452" }))).status).toBe(200);
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
  });

  const tcgApiCard = (id: number, extra: Record<string, unknown> = {}) => ({
    id, name: "Dark Magician", clean_name: "dark magician", number: "LOB-005", rarity: "Ultra Rare",
    image_url: `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`, tcgplayer_id: 20000 + id,
    product_type: "Cards", set_name: "Legend of Blue Eyes", game_name: "YuGiOh", game_slug: "yugioh",
    printing: "Unlimited", market_price: 12.5, ...extra,
  });
  const tcgApiPage = (data: unknown[], meta: Record<string, unknown> = {}) => new Response(JSON.stringify({
    data, meta: { total: data.length, page: 1, per_page: 100, has_more: false, ...meta },
  }));
  const freshSet = { game: "ygo", id: "2301", name: "Legend of Blue Eyes", abbreviation: "LOB", card_count: 126, release_date: "2002-03-08", cached_at: new Date().toISOString() };

  it("searches TCG API with a server key and returns saved cards with their CDN images", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgSets.mockResolvedValueOnce([freshSet]);
    dependencies.fetch.mockResolvedValueOnce(tcgApiPage([
      tcgApiCard(1),
      tcgApiCard(1, { printing: "1st Edition", market_price: 80 }),
      tcgApiCard(2, { product_type: "Sealed Products" }),
      { id: "../evil", name: "x" },
    ]));
    const response = await handler(request({ provider: "tcgapi", game: "ygo", query: "dark magician" }));
    expect(response.status).toBe(200);
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.tcgapi.dev/v1/search?q=dark+magician&game=yugioh&page=1&per_page=100");
    expect(options.headers["X-API-Key"]).toBe("server-only-key");
    expect(dependencies.getSecret).toHaveBeenCalledWith("TCG_API_KEY");
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "tcgapi");
    // Images are public CDN URLs: no image requests, nothing copied.
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "1", game: "ygo", set_id: "2301", set_code: "LOB", market_price: 12.5,
        image_url: "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg",
      }),
    ], expect.any(AbortSignal));
    const body = await response.json();
    expect(body.cards.map((card: { id: string }) => card.id)).toEqual(["1"]);
    expect(body.cards[0].raw_data).toBeUndefined();
  });

  it("refreshes a stale set list from TCG API's public endpoint to find set ids", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgSets.mockResolvedValueOnce([{ ...freshSet, name: "Other", cached_at: "2020-01-01T00:00:00Z" }]);
    dependencies.fetch
      .mockResolvedValueOnce(tcgApiPage([tcgApiCard(1)]))
      .mockResolvedValueOnce(tcgApiPage([{ id: 2301, name: "Legend of Blue Eyes", abbreviation: null, card_count: 126 }]));
    expect((await handler(request({ provider: "tcgapi", game: "ygo", query: "dark" }))).status).toBe(200);
    const [setsUrl, setsOptions] = dependencies.fetch.mock.calls[1];
    expect(setsUrl.toString()).toBe("https://api.tcgapi.dev/v1/games/yugioh/sets?page=1&per_page=100");
    expect(setsOptions.headers["X-API-Key"]).toBeUndefined();
    expect(dependencies.persistTcgSets).toHaveBeenCalledWith([expect.objectContaining({ game: "ygo", id: "2301" })], expect.any(AbortSignal));
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([expect.objectContaining({ set_id: "2301" })], expect.any(AbortSignal));
  });

  it("saves cards without a set id when the set list can't be refreshed", async () => {
    const { handler, dependencies } = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    dependencies.fetch
      .mockResolvedValueOnce(tcgApiPage([tcgApiCard(1)]))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    expect((await handler(request({ provider: "tcgapi", game: "ygo", query: "dark" }))).status).toBe(200);
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([expect.objectContaining({ set_id: null })], expect.any(AbortSignal));
    expect(dependencies.persistTcgSets).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not return TCG API cards it could not save, and hides vendor errors", async () => {
    const { handler, dependencies } = setup();
    const quiet = [jest.spyOn(console, "warn").mockImplementation(() => undefined), jest.spyOn(console, "error").mockImplementation(() => undefined)];
    dependencies.findTcgSets.mockResolvedValue([freshSet]);
    dependencies.fetch.mockResolvedValueOnce(tcgApiPage([tcgApiCard(1)]));
    dependencies.persistTcgCards.mockRejectedValueOnce(new Error("private"));
    expect((await handler(request({ provider: "tcgapi", game: "ygo", query: "luffy" }))).status).toBe(503);
    dependencies.fetch.mockResolvedValueOnce(new Response("key tcg_live_secret", { status: 500 }));
    const failed = await handler(request({ provider: "tcgapi", game: "ygo", query: "luffy" }));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("tcg_live");
    dependencies.fetch.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect((await handler(request({ provider: "tcgapi", game: "ygo", query: "luffy" }))).status).toBe(429);
    dependencies.fetch.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await (await handler(request({ provider: "tcgapi", game: "ygo", query: "luffy" }))).json()).toMatchObject({ cards: [] });
    quiet.forEach((spy) => spy.mockRestore());
  });

  it("logs TCG API steps and vendor errors without ever logging the key", async () => {
    const { handler, dependencies } = setup();
    (dependencies as { debug?: boolean }).debug = true;
    const logs: unknown[][] = [];
    const capture = (...args: unknown[]) => { logs.push(args); };
    const spies = [
      jest.spyOn(console, "log").mockImplementation(capture),
      jest.spyOn(console, "warn").mockImplementation(capture),
      jest.spyOn(console, "error").mockImplementation(capture),
    ];
    dependencies.getSecret.mockReturnValue("tcg_live_supersecretkey123");
    dependencies.fetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: "INVALID_API_KEY", message: "Key tcg_live_supersecretkey123 is not valid" } }),
      { status: 401, headers: { "X-RateLimit-Remaining": "0" } },
    ));
    expect((await handler(request({ provider: "tcgapi", game: "ygo", query: "dark" }))).status).toBe(502);
    spies.forEach((spy) => spy.mockRestore());

    const text = JSON.stringify(logs);
    expect(text).not.toContain("supersecretkey123");
    expect(logs.map((entry) => entry[0])).toEqual(expect.arrayContaining([
      "[catalog-proxy] request.received",
      "[catalog-proxy] tcgapi.search.started",
      "[catalog-proxy] tcgapi.search.upstream",
      "[catalog-proxy] tcgapi.search.upstream-failed",
    ]));
    const failure = logs.find((entry) => entry[0] === "[catalog-proxy] tcgapi.search.upstream-failed")?.[1];
    expect(failure).toMatchObject({ status: 401, vendorError: "INVALID_API_KEY: Key tcg_*** is not valid", remaining: "0" });
  });

  it("logs which field an invalid request failed on, and a missing secret", async () => {
    const { handler, dependencies } = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await handler(request({ provider: "tcgapi", game: "chess", query: "dark" }));
    expect(warn).toHaveBeenCalledWith("[catalog-proxy] request.invalid", expect.objectContaining({
      issues: expect.arrayContaining([expect.stringContaining("game")]),
    }));
    dependencies.getSecret.mockReturnValue(undefined);
    await handler(request({ provider: "tcgapi", game: "ygo", query: "dark" }));
    expect(error).toHaveBeenCalledWith("[catalog-proxy] request.missing-secret", { provider: "tcgapi", secret: "TCG_API_KEY" });
    warn.mockRestore();
    error.mockRestore();
  });

  it("reports an unreadable TCG API response instead of an unreachable provider", async () => {
    const { handler, dependencies } = setup();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true })));
    const response = await handler(request({ provider: "tcgapi", game: "ygo", query: "dark" }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/couldn't read/);
    expect(consoleError).toHaveBeenCalledWith("[catalog-proxy] tcgapi.failed", expect.objectContaining({ game: "ygo", name: "ZodError" }));
    consoleError.mockRestore();
  });

  it("caches a full TCG API set roster and drops rows from other sets", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgSets.mockResolvedValueOnce([freshSet]);
    dependencies.fetch
      .mockResolvedValueOnce(tcgApiPage([tcgApiCard(1), tcgApiCard(3, { set_id: 9999 })], { has_more: true }))
      .mockResolvedValueOnce(tcgApiPage([tcgApiCard(2), tcgApiCard(4, { product_type: "Sealed Products" })], { page: 2 }));
    const response = await handler(request({ provider: "tcgapi", game: "ygo", setId: "2301" }));
    expect(response.status).toBe(200);
    expect(dependencies.fetch.mock.calls.map(([url]) => url.toString())).toEqual([
      "https://api.tcgapi.dev/v1/sets/2301/cards?page=1&per_page=100",
      "https://api.tcgapi.dev/v1/sets/2301/cards?page=2&per_page=100",
    ]);
    // The second page spends another limiter request.
    expect(dependencies.consumeRequest).toHaveBeenCalledTimes(2);
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([
      expect.objectContaining({ id: "1", set_id: "2301", set_code: "LOB" }),
      expect.objectContaining({ id: "2", set_id: "2301" }),
    ], expect.any(AbortSignal));
    expect(dependencies.persistTcgSetRoster).toHaveBeenCalledWith(
      expect.objectContaining({ game: "ygo", set_id: "2301", set_name: "Legend of Blue Eyes", card_count: 2 }),
      expect.any(AbortSignal),
    );
    expect((await response.json()).cards).toHaveLength(2);
  });

  it("never marks a truncated TCG API set complete", async () => {
    const { handler, dependencies } = setup();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.fetch.mockImplementation(async (url: URL) => tcgApiPage(
      [tcgApiCard(Number(url.searchParams.get("page")))], { has_more: true },
    ));
    expect((await handler(request({ provider: "tcgapi", game: "fab", setId: "7" }))).status).toBe(502);
    expect(dependencies.fetch).toHaveBeenCalledTimes(10);
    expect(dependencies.consumeRequest).toHaveBeenCalledTimes(10);
    expect(dependencies.persistTcgSetRoster).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  const trackingProduct = (prices: { sub_type_name: string; market_price: string | null }[]) => new Response(JSON.stringify({
    success: true,
    product_id: 557921,
    product: { product_id: 557921, name: "Llanowar Elves" },
    prices: { tcgplayer: prices.map((price) => ({ product_id: 557921, low_price: "0.10", ...price })) },
  }));

  it("serves today's cached price without calling TCGTracking", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTodayPrice.mockResolvedValueOnce(0.36);
    const response = await handler(request({ provider: "price", game: "magic", cardId: "6a0b230b-d391-4998-a3f7-7b158a0ec2cd" }));
    expect(await response.json()).toEqual({ price: 0.36, source: "cache" });
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "price");
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("fetches TCGTracking once, prefers the Normal finish, and stores the daily snapshot", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(trackingProduct([
      { sub_type_name: "Foil", market_price: "0.81" },
      { sub_type_name: "Normal", market_price: "0.36" },
    ]));
    const cardId = "6a0b230b-d391-4998-a3f7-7b158a0ec2cd";
    const response = await handler(request({ provider: "price", game: "magic", cardId }));
    expect(await response.json()).toEqual({ price: 0.36, source: "api" });
    expect(dependencies.fetch.mock.calls[0][0].toString()).toBe("https://openapi.tcgtracking.com/v1/products/557921");
    expect(dependencies.findTcgplayerSource).toHaveBeenCalledWith("magic", cardId, expect.any(AbortSignal));
    expect(dependencies.persistPriceSnapshot).toHaveBeenCalledWith("magic", cardId, 0.36, expect.any(AbortSignal));
  });

  it("resolves Pokémon product ids through the pokemontcg.io price redirect once", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgplayerSource.mockResolvedValueOnce({
      productId: null, resolved: false, pokemonPriceUrl: "https://prices.pokemontcg.io/tcgplayer/base1-4",
    });
    dependencies.fetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://tcgplayer.pxf.io/scrydex?u=https://tcgplayer.com/product/42382" } }))
      .mockResolvedValueOnce(trackingProduct([{ sub_type_name: "Holofoil", market_price: "350.00" }]));
    const response = await handler(request({ provider: "price", game: "pokemon", cardId: "base1-4" }));
    expect((await response.json()).price).toBe(350);
    expect(dependencies.fetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(dependencies.saveTcgplayerProduct).toHaveBeenCalledWith("pokemon", "base1-4", 42382, expect.any(AbortSignal));
    expect(dependencies.fetch.mock.calls[1][0].toString()).toBe("https://openapi.tcgtracking.com/v1/products/42382");
  });

  it("returns no price for unmapped cards, 404 for uncached cards, and never follows other redirects", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgplayerSource.mockResolvedValueOnce({ productId: null, resolved: false, pokemonPriceUrl: "https://evil.example/tcgplayer/x" });
    expect(await (await handler(request({ provider: "price", game: "pokemon", cardId: "base1-4" }))).json()).toEqual({ price: null, source: "none" });
    expect(dependencies.fetch).not.toHaveBeenCalled();

    dependencies.findTcgplayerSource.mockResolvedValueOnce(null);
    expect((await handler(request({ provider: "price", game: "ygo", cardId: "512345" }))).status).toBe(404);
    expect(dependencies.persistPriceSnapshot).not.toHaveBeenCalled();
  });

  it("rejects price requests with ids that don't fit the game", async () => {
    const { handler, dependencies } = setup();
    for (const body of [
      { provider: "price", game: "magic", cardId: "base1-4" },
      { provider: "price", game: "riftbound", cardId: "../x" },
      { provider: "price", game: "chess", cardId: "x" },
    ]) {
      expect((await handler(request(body))).status).toBe(400);
    }
    expect(dependencies.findTcgplayerSource).not.toHaveBeenCalled();
  });

  it("rejects TCG API requests for unknown games, existing pipelines, or bad queries", async () => {
    for (const extra of [
      { provider: "tcgapi", game: "ygo", setId: "LOB" },
      { provider: "tcgapi", game: "op", setId: "1/../x" },
      { provider: "tcgapi", game: "ygo", query: "dark", setId: "1001" },
      { provider: "tcgapi", game: "ygo" },
      { provider: "pokewallet", game: "ygo", query: "dark" },
    ]) {
      expect((await setup().handler(request(extra))).status).toBe(400);
    }
    const { handler, dependencies } = setup();
    for (const body of [
      { provider: "tcgapi", game: "mtg", query: "bolt" },
      { provider: "tcgapi", game: "rft", query: "jinx" },
      { provider: "tcgapi", game: "ygo", query: "a" },
      { provider: "tcgapi", game: "ygo", query: "dark", path: "/admin" },
    ]) {
      expect((await handler(request(body))).status).toBe(400);
    }
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it.each([404, 400])("returns a BarcodeNest not-found body for vendor %s without vendor details", async (status) => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response("secret vendor detail", { status }));
    const response = await handler(request({ provider: "barcodenest", code: "12345678" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ barcode: "12345678", found: false, product: null });
    expect(dependencies.persistProducts).not.toHaveBeenCalled();
  });

  it("rejects BarcodeNest codes that are not GTIN lengths or contain path characters", async () => {
    const { handler, dependencies } = setup();
    for (const code of ["123456789", "12345678/../x", "abcdefgh"]) {
      expect((await handler(request({ provider: "barcodenest", code }))).status).toBe(400);
    }
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("persists Riftbound cards from the fixed Riftcodex host without a vendor key", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [riftboundCard], total: 1, page: 1, size: 50, pages: 1 })));
    expect((await handler(request({ provider: "riftbound", path: "/cards/name?fuzzy=wurm" }))).status).toBe(200);
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.riftcodex.com/cards/name?fuzzy=wurm&page=1&size=50");
    expect(options.headers["X-Api-Key"]).toBeUndefined();
    expect(dependencies.getSecret).not.toHaveBeenCalled();
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "riftbound");
    expect(dependencies.persistRiftboundCards).toHaveBeenCalledWith(
      [expect.objectContaining({ id: riftboundCard.id, riftbound_id: "ogn-011-298", set_code: "OGN" })], expect.any(AbortSignal));
  });

  it("does not return Riftbound cards it could not validate or save", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify([riftboundCard])));
    dependencies.persistRiftboundCards.mockRejectedValueOnce(new Error("private"));
    expect((await handler(request({ provider: "riftbound", path: "/cards/riftbound/ogn-011" }))).status).toBe(503);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify([{ ...riftboundCard, id: "forged" }])));
    expect((await handler(request({ provider: "riftbound", path: "/cards/riftbound/ogn-011" }))).status).toBe(502);
    expect((await handler(request({ provider: "riftbound", path: "/cards/riftbound/ogn-011", cards: [riftboundCard] }))).status).toBe(400);
  });

  it("preserves not-found behavior without exposing upstream error bodies", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response("secret vendor URL", { status: 404 }));
    const pokemon = await handler(request());
    expect(pokemon.status).toBe(404);
    expect(await pokemon.text()).not.toContain("secret vendor URL");
    dependencies.fetch.mockResolvedValueOnce(new Response("secret vendor URL", { status: 404 }));
    const barcode = await handler(request({ provider: "barcode", query: "missing" }));
    expect(barcode.status).toBe(200);
    expect(await barcode.json()).toEqual({ products: [] });
  });

  it("sanitizes upstream failures and invalid responses", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response("key=server-only-key", { status: 403 }));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("server-only-key");
    dependencies.fetch.mockResolvedValueOnce(new Response("not json"));
    expect((await handler(request())).status).toBe(502);
  });

  it("handles preflight without authentication and rejects unsupported methods", async () => {
    const { handler, dependencies } = setup();
    expect((await handler(new Request("https://project.invalid", { method: "OPTIONS" }))).status).toBe(204);
    expect((await handler(new Request("https://project.invalid"))).status).toBe(405);
    expect(dependencies.authenticate).not.toHaveBeenCalled();
  });

  it("rejects oversized upstream responses", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: "x".repeat(8 * 1024 * 1024) })));
    expect((await handler(request())).status).toBe(502);
  });

  it("aborts stalled upstream requests and returns a timeout", async () => {
    jest.useFakeTimers();
    try {
      const { handler, dependencies } = setup();
      dependencies.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const pending = handler(request());
      await jest.advanceTimersByTimeAsync(15_001);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.text()).toContain("timed out");
    } finally {
      jest.useRealTimers();
    }
  });
});
