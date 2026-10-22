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
    findTcgCardImages: jest.fn().mockResolvedValue({}),
    persistTcgSetRoster: jest.fn().mockResolvedValue(undefined),
    findTodayPrice: jest.fn().mockResolvedValue(null),
    findTcgplayerSource: jest.fn().mockResolvedValue({ productId: 557921, resolved: false, pokemonPriceUrl: null }),
    saveTcgplayerProduct: jest.fn().mockResolvedValue(undefined),
    persistPriceSnapshot: jest.fn().mockResolvedValue(undefined),
    storeTcgCardImage: jest.fn().mockImplementation(async (path: string) => `https://project.invalid/storage/v1/object/public/tcg-card-images/${path}`),
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

  it("keeps the product imageless when no cover exists or the code is not an ISBN", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ barcode: "9781684058419", found: true, product: { name: "Book" } })))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await (await handler(request({ provider: "barcodenest", code: "9781684058419" }))).json()).product.image_url).toBeUndefined();
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ barcode: "036000291452", found: true, product: { name: "Tissue" } })));
    await handler(request({ provider: "barcodenest", code: "036000291452" }));
    expect(dependencies.fetch).toHaveBeenCalledTimes(3);
  });

  const pokewalletCard = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    card_info: { name: "Dark Magician", set_name: "Legend of Blue Eyes", set_code: "LOB", set_id: 1001, card_number: "LOB-005", rarity: "Ultra Rare", product_type: "card", ...extra },
    images: { languages: ["en"] },
    tcgplayer: { prices: [{ sub_type_name: "Unlimited", market_price: 12.5 }, { sub_type_name: "1st Edition", market_price: 80 }], url: "https://www.tcgplayer.com/product/1" },
    cardmarket: null,
  });
  const pokewalletSearch = (results: unknown[]) => new Response(JSON.stringify({
    query: "dark magician", results, pagination: { page: 1, limit: 10, total: results.length, total_pages: 1 },
  }));

  it("searches PokéWallet with a server key, copies images once, and returns saved cards only", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgCardImages.mockResolvedValueOnce({ pk_bbbbbbbbbbbbbbbbbbbb: "https://project.invalid/old.jpg" });
    dependencies.fetch
      .mockResolvedValueOnce(pokewalletSearch([
        pokewalletCard("pk_aaaaaaaaaaaaaaaaaaaa"),
        pokewalletCard("pk_bbbbbbbbbbbbbbbbbbbb"),
        pokewalletCard("pk_cccccccccccccccccccc", { product_type: "sealed" }),
        { id: "../evil", card_info: { name: "x" } },
      ]))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }));
    const response = await handler(request({ provider: "pokewallet", game: "ygo", query: "dark magician" }));
    expect(response.status).toBe(200);
    const [url, options] = dependencies.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.pokewallet.io/ygo/search?q=dark+magician&page=1&limit=10");
    expect(options.headers["X-API-Key"]).toBe("server-only-key");
    expect(dependencies.getSecret).toHaveBeenCalledWith("POKEWALLET_API_KEY");
    expect(dependencies.consumeRequest).toHaveBeenCalledWith("user-1", "pokewallet");
    // Only the card without a stored image costs an image request.
    expect(dependencies.fetch).toHaveBeenCalledTimes(2);
    expect(dependencies.fetch.mock.calls[1][0].toString()).toBe("https://api.pokewallet.io/ygo/images/pk_aaaaaaaaaaaaaaaaaaaa");
    expect(dependencies.storeTcgCardImage).toHaveBeenCalledWith("ygo/pk_aaaaaaaaaaaaaaaaaaaa.jpg", expect.any(Uint8Array), "image/jpeg", expect.any(AbortSignal));
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([
      expect.objectContaining({ id: "pk_aaaaaaaaaaaaaaaaaaaa", game: "ygo", set_id: "1001", market_price: 12.5,
        image_url: "https://project.invalid/storage/v1/object/public/tcg-card-images/ygo/pk_aaaaaaaaaaaaaaaaaaaa.jpg" }),
      expect.objectContaining({ id: "pk_bbbbbbbbbbbbbbbbbbbb", image_url: "https://project.invalid/old.jpg" }),
    ], expect.any(AbortSignal));
    const body = await response.json();
    expect(body.cards.map((card: { id: string }) => card.id)).toEqual(["pk_aaaaaaaaaaaaaaaaaaaa", "pk_bbbbbbbbbbbbbbbbbbbb"]);
    expect(body.cards[0].raw_data).toBeUndefined();
  });

  it("saves PokéWallet cards without an image when the image copy fails", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(pokewalletSearch([pokewalletCard("pk_aaaaaaaaaaaaaaaaaaaa")]))
      .mockResolvedValueOnce(new Response("nope", { status: 502 }));
    expect((await handler(request({ provider: "pokewallet", game: "lor", query: "elsa" }))).status).toBe(200);
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([expect.objectContaining({ image_url: null })], expect.any(AbortSignal));
    expect(dependencies.storeTcgCardImage).not.toHaveBeenCalled();
  });

  it("does not return PokéWallet cards it could not save, and hides vendor errors", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgCardImages.mockResolvedValueOnce({ pk_aaaaaaaaaaaaaaaaaaaa: "https://project.invalid/a.jpg" });
    dependencies.fetch.mockResolvedValueOnce(pokewalletSearch([pokewalletCard("pk_aaaaaaaaaaaaaaaaaaaa")]));
    dependencies.persistTcgCards.mockRejectedValueOnce(new Error("private"));
    expect((await handler(request({ provider: "pokewallet", game: "ygo", query: "luffy" }))).status).toBe(503);
    dependencies.fetch.mockResolvedValueOnce(new Response("key pk_live_secret", { status: 500 }));
    const failed = await handler(request({ provider: "pokewallet", game: "ygo", query: "luffy" }));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("pk_live");
  });

  it("reads One Piece's own search shape and fetches its images by card number", async () => {
    const { handler, dependencies } = setup();
    dependencies.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: [{
          id: "op_3f8a12c4e9b7d02f3f8a12c4e9b7d02f", card_number: "OP15-092", name: "Nami", sub_type_name: "Normal",
          rarity: "R", card_type: "Character", tcgplayer: { url: "https://www.tcgplayer.com/product/600001", prices: { market_price: 1.76 } },
          cardmarket: null,
        }],
        total: 1, page: 1, limit: 10,
      })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/jpeg" } }));
    const response = await handler(request({ provider: "pokewallet", game: "op", query: "OP15-092" }));
    expect(response.status).toBe(200);
    expect(dependencies.fetch.mock.calls[0][0].toString()).toBe("https://api.pokewallet.io/op/search?q=OP15-092&page=1&limit=10");
    expect(dependencies.fetch.mock.calls[1][0].toString()).toBe("https://api.pokewallet.io/images/OP15-092");
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([expect.objectContaining({
      id: "op_3f8a12c4e9b7d02f3f8a12c4e9b7d02f", game: "op", set_code: "OP15", set_id: "OP15", market_price: 1.76,
    })], expect.any(AbortSignal));
    expect((await response.json()).cards[0]).toMatchObject({ name: "Nami", card_number: "OP15-092" });
  });

  it("logs PokéWallet steps and vendor errors without ever logging the key", async () => {
    const { handler, dependencies } = setup();
    (dependencies as { debug?: boolean }).debug = true;
    const logs: unknown[][] = [];
    const capture = (...args: unknown[]) => { logs.push(args); };
    const spies = [
      jest.spyOn(console, "log").mockImplementation(capture),
      jest.spyOn(console, "warn").mockImplementation(capture),
      jest.spyOn(console, "error").mockImplementation(capture),
    ];
    dependencies.getSecret.mockReturnValue("pk_live_supersecretkey123");
    dependencies.fetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Invalid API key", message: "Key pk_live_supersecretkey123 is not valid" }),
      { status: 401, headers: { "X-RateLimit-Remaining-Hour": "0" } },
    ));
    expect((await handler(request({ provider: "pokewallet", game: "ygo", query: "dark" }))).status).toBe(502);
    spies.forEach((spy) => spy.mockRestore());

    const text = JSON.stringify(logs);
    expect(text).not.toContain("supersecretkey123");
    expect(logs.map((entry) => entry[0])).toEqual(expect.arrayContaining([
      "[catalog-proxy] request.received",
      "[catalog-proxy] pokewallet.search.started",
      "[catalog-proxy] pokewallet.search.upstream",
      "[catalog-proxy] pokewallet.search.upstream-failed",
    ]));
    const failure = logs.find((entry) => entry[0] === "[catalog-proxy] pokewallet.search.upstream-failed")?.[1];
    expect(failure).toMatchObject({ status: 401, vendorError: "Invalid API key: Key pk_*** is not valid", remainingHour: "0" });
  });

  it("logs which field an invalid request failed on, and a missing secret", async () => {
    const { handler, dependencies } = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await handler(request({ provider: "pokewallet", game: "chess", query: "dark" }));
    expect(warn).toHaveBeenCalledWith("[catalog-proxy] request.invalid", expect.objectContaining({
      issues: expect.arrayContaining([expect.stringContaining("game")]),
    }));
    dependencies.getSecret.mockReturnValue(undefined);
    await handler(request({ provider: "pokewallet", game: "ygo", query: "dark" }));
    expect(error).toHaveBeenCalledWith("[catalog-proxy] request.missing-secret", { provider: "pokewallet", secret: "POKEWALLET_API_KEY" });
    warn.mockRestore();
    error.mockRestore();
  });

  it("reports an unreadable PokéWallet response instead of an unreachable provider", async () => {
    const { handler, dependencies } = setup();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true })));
    const response = await handler(request({ provider: "pokewallet", game: "ygo", query: "dark" }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/couldn't read/);
    expect(consoleError).toHaveBeenCalledWith("[catalog-proxy] pokewallet.failed", expect.objectContaining({ game: "ygo", name: "ZodError" }));
    consoleError.mockRestore();
  });

  it("caches a full PokéWallet set roster without copying images", async () => {
    const { handler, dependencies } = setup();
    dependencies.findTcgCardImages.mockResolvedValueOnce({ pk_aaaaaaaaaaaaaaaaaaaa: "https://project.invalid/a.jpg" });
    dependencies.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      set: { name: "Legend of Blue Eyes", set_code: "LOB", set_id: "1001", total_cards: 3 },
      cards: [
        pokewalletCard("pk_aaaaaaaaaaaaaaaaaaaa"),
        pokewalletCard("pk_bbbbbbbbbbbbbbbbbbbb"),
        pokewalletCard("pk_cccccccccccccccccccc", { product_type: "sealed" }),
      ],
    })));
    const response = await handler(request({ provider: "pokewallet", game: "ygo", setId: "1001" }));
    expect(response.status).toBe(200);
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
    expect(dependencies.fetch.mock.calls[0][0].toString()).toBe("https://api.pokewallet.io/ygo/sets/1001?page=1&limit=200");
    expect(dependencies.storeTcgCardImage).not.toHaveBeenCalled();
    expect(dependencies.persistTcgCards).toHaveBeenCalledWith([
      expect.objectContaining({ id: "pk_aaaaaaaaaaaaaaaaaaaa", image_url: "https://project.invalid/a.jpg" }),
      expect.objectContaining({ id: "pk_bbbbbbbbbbbbbbbbbbbb", image_url: null }),
    ], expect.any(AbortSignal));
    expect(dependencies.persistTcgSetRoster).toHaveBeenCalledWith(
      expect.objectContaining({ game: "ygo", set_id: "1001", set_name: "Legend of Blue Eyes", card_count: 2 }),
      expect.any(AbortSignal),
    );
    expect((await response.json()).cards).toHaveLength(2);
  });

  it("pages large PokéWallet sets against the limiter and never marks a truncated set complete", async () => {
    const { handler, dependencies } = setup();
    const fullPage = (offset: number) => new Response(JSON.stringify({
      success: true,
      set: { name: "Huge", set_id: "7" },
      cards: Array.from({ length: 200 }, (_, index) =>
        pokewalletCard(`pk_${(offset + index).toString(16).padStart(20, "0")}`)),
    }));
    dependencies.fetch.mockImplementation(async (url: URL) => fullPage(Number(url.searchParams.get("page")) * 1000));
    expect((await handler(request({ provider: "pokewallet", game: "fab", setId: "7" }))).status).toBe(502);
    expect(dependencies.fetch).toHaveBeenCalledTimes(5);
    expect(dependencies.consumeRequest).toHaveBeenCalledTimes(5);
    expect(dependencies.persistTcgSetRoster).not.toHaveBeenCalled();
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
    expect((await handler(request({ provider: "price", game: "ygo", cardId: "pk_aaaaaaaaaaaaaaaaaaaa" }))).status).toBe(404);
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

  it("rejects PokéWallet requests for unknown games, existing pipelines, or bad queries", async () => {
    for (const extra of [
      { provider: "pokewallet", game: "ygo", setId: "LOB" },
      { provider: "pokewallet", game: "op", setId: "OP01/../x" },
      { provider: "pokewallet", game: "ygo", query: "dark", setId: "1001" },
      { provider: "pokewallet", game: "ygo" },
    ]) {
      expect((await setup().handler(request(extra))).status).toBe(400);
    }
    const { handler, dependencies } = setup();
    for (const body of [
      { provider: "pokewallet", game: "mtg", query: "bolt" },
      { provider: "pokewallet", game: "rft", query: "jinx" },
      { provider: "pokewallet", game: "ygo", query: "a" },
      { provider: "pokewallet", game: "ygo", query: "dark", path: "/admin" },
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
