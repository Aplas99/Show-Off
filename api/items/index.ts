import { uploadImageToSupabase } from "@/api/storage";
import {
  searchPokemonCardsCacheFirst,
  type PokemonTcgCard,
} from "@/api/pokemon";
import { extractMarketPrice } from "@/api/pokemon/ocrPostprocessing";
import { createActionLogger } from "@/lib/actionDebug";
import {
  CreateItemPayload,
  validateCreateItem,
} from "@/lib/createItemValidation";
import { supabase } from "@/lib/supabase";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";

// --- Types ---
export interface Product {
  title: string;
  brand?: string;
  description?: string;
  images?: string[];
  ean?: string;
  upc?: string;
  isbn?: string;
  category?: string;
  model?: string;
  color?: string;
  manufacturer?: string;
  price?: number;
  pokemonTcgId?: string;
  pokemonSetId?: string;
  pokemonSetName?: string;
  pokemonCardNumber?: string;
}

export const searchParamsSchema = z.object({
  query: z.string(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

/**
 * Represents the restricted product data structure when joined with an item.
 * This is a subset of the full Product table, focusing on searchable fields.
 */
export interface ShowcaseItemProduct {
  ean?: string | null;
  pokemonTcgId?: string | null;
  searchableTitle: string;
  searchableDescription?: string | null;
  searchableBrand: string;
  data: any;
}

/**
 * Represents a user's item within a showcase, including its related product data.
 * This combines the `items` table data with the `products` table data.
 */
export interface ItemWithProduct {
  id: number;
  user_id: string;
  showcase_id: string | null;
  product_ean: string | null;
  pokemon_tcg_card_id?: string | null;
  magic_card_id?: string | null;
  created_at: string;
  image_url: string;
  /** Full ordered photo gallery (Curator multi-image); `image_url` is the cover. */
  image_urls?: string[];
  condition: string | null;
  user_description: string | null;
  for_sale: boolean;
  price: number | null;
  currency_code?: string;
  products: ShowcaseItemProduct | null;
  custom_title?: string | null;
  custom_brand?: string | null;
  custom_publisher?: string | null;
  custom_category?: string | null;
  /** Populated only for Pokémon TCG items, from the pokemon_tcg_cards cache. */
  pokemonTypes?: string[];
  pokemonSetId?: string | null;
  pokemonSetSeries?: string | null;
  pokemonSetPrintedTotal?: number | null;
  /** Current cached market price (distinct from `price`, which is the snapshot saved at item-creation time). */
  pokemonMarketPrice?: number | null;
  /** Populated only for Magic: The Gathering items, from the magic_cards cache. */
  magicSetCode?: string | null;
  magicSetName?: string | null;
  magicMarketPrice?: number | null;
  /** Scryfall color codes (W/U/B/R/G); empty for colorless cards. */
  magicColors?: string[];
}

const BarcodeLookupAPIKey =
  process.env.EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY || "";

const searchDebug = createActionLogger("Search");
const createItemDebug = createActionLogger("CreateItem");

export function useUpdateItemCondition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: number; condition: string | null }) => {
      const { error } = await supabase
        .from("items")
        .update({ condition: input.condition })
        .eq("id", input.itemId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Remove showcase links first in case the FK doesn't cascade.
      const { error: linkError } = await supabase
        .from("showcase_items")
        .delete()
        .eq("item_id", itemId);
      if (linkError) throw new Error(linkError.message);

      const { error } = await supabase
        .from("items")
        .delete()
        .eq("id", itemId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["showcase:items"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
      queryClient.invalidateQueries({ queryKey: ["social", "feed"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

function getPokemonMarketPrice(card: PokemonTcgCard) {
  const prices = card.tcgplayer?.prices;
  if (!prices) return undefined;

  const preferredVariants = ["normal", "holofoil", "reverseHolofoil"];
  for (const variant of preferredVariants) {
    const market = prices[variant]?.market;
    if (typeof market === "number") return market;
  }

  return Object.values(prices).find(
    (price) => typeof price.market === "number",
  )?.market ?? undefined;
}

export function pokemonCardToProduct(card: PokemonTcgCard): Product {
  const details = [
    card.set.name,
    `#${card.number}`,
    card.rarity,
  ].filter(Boolean);

  return {
    title: card.name,
    brand: "Pokémon",
    manufacturer: "The Pokémon Company",
    description: details.join(" • "),
    images: [card.images.large, card.images.small],
    category: "TCG",
    price: getPokemonMarketPrice(card),
    pokemonTcgId: card.id,
    pokemonSetId: card.set.id,
    pokemonSetName: card.set.name,
    pokemonCardNumber: card.number,
  };
}

// --- Helpers ---
function normalizeCodes(searchQuery: string) {
  const sanitized = searchQuery.replace(/[\s-]/g, "").trim();
  const isNumeric = /^\d+$/.test(sanitized);
  return {
    ean: isNumeric && sanitized.length === 13 ? sanitized : undefined,
    upc: isNumeric && sanitized.length === 12 ? sanitized : undefined,
    isbn:
      isNumeric && (sanitized.length === 10 || sanitized.length === 13)
        ? sanitized
        : undefined,
  };
}

function normalizeProductCode(code?: string | null) {
  const sanitized = code?.replace(/[\s-]/g, "").trim();
  return sanitized || null;
}

function getProductCode(
  productData?: Product | null,
  fallbackCode?: string | null,
) {
  return (
    normalizeProductCode(productData?.ean) ||
    normalizeProductCode(productData?.upc) ||
    normalizeProductCode(productData?.isbn) ||
    normalizeProductCode(fallbackCode)
  );
}

function buildProductRow(productData: Product, productEan: string) {
  return {
    ean: productEan,
    searchableTitle: productData.title.trim(),
    searchableDescription: productData.description || "",
    searchableBrand: productData.brand || productData.manufacturer || "",
    data: {
      ...productData,
      ean: normalizeProductCode(productData.ean) || productEan,
      upc: normalizeProductCode(productData.upc) || undefined,
      isbn: normalizeProductCode(productData.isbn) || undefined,
    },
  };
}

async function upsertProduct(productData: Product, productEan: string) {
  if (!productData.title.trim()) return null;

  const productRow = buildProductRow(productData, productEan);
  const { error } = await supabase
    .from("products")
    .upsert(productRow, {
      onConflict: "ean",
    });

  if (error) {
    const isGeneratedColumnError =
      error.code === "428C9" || error.message.includes("generated column");

    if (!isGeneratedColumnError) throw error;

    const { error: minimalError } = await supabase
      .from("products")
      .upsert(
        {
          ean: productRow.ean,
          data: productRow.data,
        },
        {
          onConflict: "ean",
        },
      );

    if (minimalError) throw minimalError;
  }

  return productEan;
}

async function findExistingProductEan(productEan: string) {
  const { data, error } = await supabase
    .from("products")
    .select("ean")
    .eq("ean", productEan)
    .maybeSingle();

  if (error) throw error;

  return data?.ean ?? null;
}

// Fetch from Barcode Lookup API
async function fetchFromBarcodeLookup(
  query: string,
  page = 1,
  filters?: Partial<SearchParams>,
): Promise<Product[]> {
  if (!BarcodeLookupAPIKey) {
    console.warn(
      "[API] ⚠️ Barcode Lookup API key is missing. Skipping request.",
    );
    return [];
  }

  // if (filters) {
  // We only validate the partial structure here
  // Use .partial() if you want to validate strict partials, or just trust TS for internal calls
  // But since this is 'filters', let's just proceed. 
  // Actually, let's validate the whole object if we constructed it from user input elsewhere.
  // For now, no runtime check needed inside this helper unless we want to catch bugs.
  // }

  const sanitized = query.replace(/\s+/g, " ").trim();

  const urlParams = new URLSearchParams();
  urlParams.append("search", sanitized);
  urlParams.append("formatted", "y");
  // NOTE: In production, verify this key is available in process.env
  urlParams.append("key", BarcodeLookupAPIKey);
  urlParams.append("page", String(page));

  if (filters?.brand?.trim()) urlParams.append("brand", filters.brand.trim());
  if (filters?.manufacturer?.trim())
    urlParams.append("manufacturer", filters.manufacturer.trim());
  if (filters?.category?.trim())
    urlParams.append("category", filters.category.trim());

  searchDebug.log("barcode-lookup.requested", { query: sanitized, page });

  const response = await fetch(
    `https://api.barcodelookup.com/v3/products?${urlParams.toString()}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      searchDebug.log("barcode-lookup.not-found", { query: sanitized, page });
      return [];
    }
    searchDebug.error(
      "barcode-lookup.failed",
      new Error(`Barcode Lookup API error: ${response.status}`),
    );
    throw new Error(`Barcode Lookup API error: ${response.status}`);
  }

  const raw = await response.json();
  const rawItems: any[] = Array.isArray(raw?.products) ? raw.products : [];

  const results = rawItems
    .map((item: any) => ({
      title: item.title || "",
      upc: item.barcode_number,
      ean: item.barcode_number,
      images: Array.isArray(item.images) ? item.images : undefined,
      description: item.description,
      brand: item.brand,
      category: item.category,
      price: item.stores?.[0]?.price
        ? parseFloat(item.stores[0].price)
        : undefined,
    }))
    .filter((p) => p.title && p.ean);

  searchDebug.log("barcode-lookup.completed", {
    query: sanitized,
    page,
    resultCount: results.length,
  });
  return results;
}

// Fetch from UPCItemDB (Trial)
async function fetchFromUPCItemDB(query: string): Promise<Product[]> {
  const sanitized = query.replace(/\s+/g, " ").trim();
  const isCode = /^\d+$/.test(sanitized);

  searchDebug.log("upcitemdb.requested", { query: sanitized, isCode });

  const endpoint = isCode ? "lookup" : "search";
  const body = isCode ? { upc: sanitized } : { q: sanitized };

  const response = await fetch(
    `https://api.upcitemdb.com/prod/trial/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const error = new Error(`UPC API error: ${response.status}`);
    searchDebug.error("upcitemdb.failed", error);
    throw error;
  }

  const raw = await response.json();
  const rawItems: any[] = Array.isArray(raw?.items) ? raw.items : [];

  const results = rawItems.map((item: any) => ({
    title: item.title || "",
    ean: item.ean,
    upc: item.upc,
    isbn: item.isbn,
    images: Array.isArray(item.images) ? item.images : undefined,
    description: item.description,
    brand: item.brand,
    price: item.lowest_recorded_price,
  }));

  searchDebug.log("upcitemdb.completed", {
    query: sanitized,
    resultCount: results.length,
  });
  return results;
}

// --- Hooks ---

// Main Product Search Hook (Infinite)
export function useProductSearch(params: SearchParams) {
  return useInfiniteQuery({
    queryKey: [
      "product-search",
      params.query,
      params.brand,
      params.manufacturer,
      params.category,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      if (!params.query) return { items: [], hasMore: false };

      searchDebug.log("product-search.started", {
        query: params.query,
        category: params.category ?? null,
        page: pageParam,
      });

      if (params.category?.trim().toLowerCase() === "tcg") {
        const result = await searchPokemonCardsCacheFirst({
          query: params.query,
          page: pageParam as number,
          pageSize: 20,
        });

        searchDebug.log("product-search.completed", {
          query: params.query,
          category: "tcg",
          source: result.source,
          resultCount: result.cards.length,
        });

        return {
          items: result.cards.map(pokemonCardToProduct),
          hasMore:
            result.source === "api" &&
            result.page * result.pageSize < result.totalCount,
        };
      }

      const items = await fetchFromBarcodeLookup(
        params.query,
        pageParam as number,
        params,
      );
      searchDebug.log("product-search.completed", {
        query: params.query,
        category: params.category ?? null,
        source: "barcode-lookup",
        resultCount: items.length,
      });
      return { items, hasMore: items.length >= 10 };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length + 1 : undefined;
    },
    enabled: !!params.query,
  });
}

// External API Search Hook (Simple)
export function useSearchExternalApi(query: string) {
  return useQuery({
    queryKey: ["external-search", query],
    queryFn: async () => {
      if (!query) return { items: [] };
      searchDebug.log("external-search.started", { query });
      const items = await fetchFromUPCItemDB(query);
      searchDebug.log("external-search.completed", {
        query,
        resultCount: items.length,
      });
      return { items };
    },
    enabled: !!query,
  });
}

// Create Item Mutation (with Product Lookup Logic)
export function useCreateItemWithProductLookup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateItemPayload) => {
      createItemDebug.log("create.started", {
        hasProductData: !!payload.productData,
        hasSearchQuery: !!payload.searchQuery,
        hasImageFile: !!payload.imageFile,
        customTitle: payload.customTitle ?? null,
        condition: payload.condition,
      });
      validateCreateItem(payload);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      let productData: Product | undefined = payload.productData ?? undefined;
      const pokemonTcgCardId = productData?.pokemonTcgId ?? null;
      const { ean, upc, isbn } = payload.searchQuery
        ? normalizeCodes(payload.searchQuery)
        : { ean: undefined, upc: undefined, isbn: undefined };

      if (!productData && (ean || upc || isbn) && payload.searchQuery) {
        try {
          // Try UPCItemDB first (free/trial)
          const upcItems = await fetchFromUPCItemDB(payload.searchQuery);
          if (upcItems.length > 0) productData = upcItems[0];
        } catch {
          createItemDebug.log("create.upc-lookup-failed-trying-barcode-lookup");
          try {
            const blItems = await fetchFromBarcodeLookup(payload.searchQuery);
            if (blItems.length > 0) productData = blItems[0];
          } catch {
            createItemDebug.log("create.product-lookup-exhausted");
          }
        }
      }

      const fallbackProductCode = ean || upc || isbn || null;
      const candidateProductEan = getProductCode(
        productData,
        fallbackProductCode,
      );
      let productEan: string | null = null;

      if (candidateProductEan) {
        if (productData) {
          productEan = await upsertProduct(productData, candidateProductEan);
        }
        if (!productEan) {
          productEan = await findExistingProductEan(candidateProductEan);
        }
      }

      // Handle Image Upload
      let finalImageUrl = payload.imageUrl;
      if (payload.imageFile) {
        try {
          // Upload local file to Supabase Storage
          finalImageUrl = await uploadImageToSupabase({
            uri: payload.imageFile,
            fileSize: undefined, // We can pass size if we have it, or let function check
          });
        } catch (e) {
          createItemDebug.error("create.image-upload-failed", e);
          throw e; // Fail creation if upload fails
        }
      }

      const { data: item, error } = await supabase
        .from("items")
        .insert({
          user_id: user.id,
          product_ean: productEan,
          pokemon_tcg_card_id: pokemonTcgCardId,
          is_verified: !!productEan || !!pokemonTcgCardId,
          custom_title: payload.customTitle || null,
          custom_brand: payload.customBrand || null,
          custom_publisher: payload.customPublisher || null,
          custom_category: payload.customCategory || null,
          condition: payload.condition,
          user_description: payload.userDescription,
          for_sale: payload.forSale,
          price: payload.price,
          image_url: finalImageUrl || null,
        })
        .select()
        .single();

      if (error) {
        createItemDebug.error("create.insert-failed", error);
        throw error;
      }

      createItemDebug.log("create.completed", {
        itemId: item.id,
        productEan,
        pokemonTcgCardId,
        isVerified: !!productEan || !!pokemonTcgCardId,
      });
      return { itemId: item.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["showcase"] });
      qc.invalidateQueries({ queryKey: ["items", "my"] });
    },
    onError: (error) => {
      createItemDebug.error("create.mutation-failed", error);
    },
  });
}

/**
 * Append photos to an item's gallery (Curator multi-image perk — gate the
 * entry point on `isCurator`). Uploads each local uri, then writes the merged
 * ordered list. The first gallery image becomes the cover when the item had
 * no `image_url` yet.
 */
export function useAddItemImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemId: number;
      currentImageUrls: string[];
      currentCoverUrl?: string | null;
      newImageUris: { uri: string; fileSize?: number }[];
    }) => {
      if (input.newImageUris.length === 0) return { imageUrls: input.currentImageUrls };

      const uploadedUrls: string[] = [];
      for (const image of input.newImageUris) {
        const url = await uploadImageToSupabase({
          uri: image.uri,
          fileSize: image.fileSize,
        });
        uploadedUrls.push(url);
      }

      // Seed the gallery with the existing cover so cycling includes it.
      const base =
        input.currentImageUrls.length > 0
          ? input.currentImageUrls
          : input.currentCoverUrl
            ? [input.currentCoverUrl]
            : [];
      const imageUrls = [...base, ...uploadedUrls];

      const { error } = await supabase
        .from("items")
        .update({
          image_urls: imageUrls,
          image_url: input.currentCoverUrl || imageUrls[0],
        })
        .eq("id", input.itemId);
      if (error) throw new Error(error.message);

      createItemDebug.log("gallery.images-added", {
        itemId: input.itemId,
        added: uploadedUrls.length,
        total: imageUrls.length,
      });
      return { imageUrls };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["showcase:items"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
  });
}

export interface MyItemSummary {
  id: number;
  title: string;
  imageUrl: string | null;
}

/**
 * Lightweight list of the signed-in user's items (newest first) for pickers
 * (e.g. referencing an item in a post).
 */
export function useGetMyItems({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["items", "my"],
    enabled,
    queryFn: async (): Promise<MyItemSummary[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("items")
        .select(
          `
          id, image_url, custom_title, created_at,
          products ( searchableTitle, data ),
          pokemon_tcg_cards ( name, image_small ),
          magic_cards ( name, image_small )
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return (data ?? []).map((row: any) => ({
        id: row.id,
        title:
          row.products?.searchableTitle ||
          row.pokemon_tcg_cards?.name ||
          row.magic_cards?.name ||
          row.custom_title ||
          "Collection item",
        imageUrl:
          row.image_url ||
          row.pokemon_tcg_cards?.image_small ||
          row.magic_cards?.image_small ||
          row.products?.data?.images?.[0] ||
          null,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Get Items for Showcase (Joined with Products)
/**
 * Fetches all items belonging to a specific showcase.
 * Performs a join with the `items` table and the `products` table to return full details.
 *
 * @param showcaseId - The UUID of the showcase to fetch items for.
 */
export function useGetItemsWithProductData(showcaseId: string) {
  return useQuery({
    queryKey: ["showcase:items", showcaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("showcase_items")
        .select(
          `
                    item_id,
                    showcase_id,
                    items (
                        id, user_id, product_ean, pokemon_tcg_card_id, magic_card_id, created_at, image_url, image_urls, condition, user_description, for_sale, price, currency_code, custom_title, custom_brand, custom_publisher, custom_category,
                        products (
                            ean, searchableTitle, searchableDescription, searchableBrand, data
                        ),
                        pokemon_tcg_cards (
                            id, name, set_name, number, rarity, image_small, image_large, raw_data,
                            types, set_id, set_series, set_printed_total, tcgplayer
                        ),
                        magic_cards (
                            id, name, set_code, set_name, collector_number, rarity, image_normal, image_small, raw_data, type_line, price_usd, colors
                        )
                    )
                `,
        )
        .eq("showcase_id", showcaseId);

      if (error) throw error;

      return (data ?? [])
        .map((row: any) => {
          if (!row?.items) return null;
          const item = row.items;
          const product = item.products;
          const pokemonCard = item.pokemon_tcg_cards;
          const magicCard = item.magic_cards;

          // Parse data field if it's a string (legacy/db support)
          let parsedProductData: any = {};
          if (product?.data) {
            if (typeof product.data === "string") {
              try {
                parsedProductData = JSON.parse(product.data);
              } catch (e) {
                console.error("Failed to parse product data", e);
              }
            } else {
              parsedProductData = product.data;
            }
          }

          return {
            ...item,
            custom_title: item.custom_title, // Ensure these are passed through if selected
            custom_brand: item.custom_brand,
            custom_publisher: item.custom_publisher,
            custom_category: item.custom_category,
            showcase_id: row.showcase_id,
            pokemonTypes: pokemonCard?.types ?? undefined,
            pokemonSetId: pokemonCard?.set_id ?? null,
            pokemonSetSeries: pokemonCard?.set_series ?? null,
            pokemonSetPrintedTotal: pokemonCard?.set_printed_total ?? null,
            pokemonMarketPrice: pokemonCard
              ? extractMarketPrice(pokemonCard.tcgplayer?.prices)
              : null,
            magicSetCode: magicCard?.set_code ?? null,
            magicSetName: magicCard?.set_name ?? null,
            magicMarketPrice: magicCard?.price_usd ?? null,
            magicColors: magicCard?.colors ?? undefined,
            products: product
              ? {
                ...product,
                data: parsedProductData,
              }
              : pokemonCard
                ? {
                  ean: null,
                  pokemonTcgId: pokemonCard.id,
                  searchableTitle: pokemonCard.name,
                  searchableDescription: [
                    pokemonCard.set_name,
                    `#${pokemonCard.number}`,
                    pokemonCard.rarity,
                  ].filter(Boolean).join(" • "),
                  searchableBrand: "Pokémon",
                  data: {
                    ...(pokemonCard.raw_data ?? {}),
                    category: "TCG",
                    publisher: "The Pokémon Company",
                    images: [
                      pokemonCard.image_large,
                      pokemonCard.image_small,
                    ].filter(Boolean),
                  },
                }
                : magicCard
                  ? {
                    ean: null,
                    searchableTitle: magicCard.name,
                    searchableDescription: [
                      magicCard.set_name,
                      magicCard.collector_number ? `#${magicCard.collector_number}` : null,
                      magicCard.rarity,
                    ].filter(Boolean).join(" • "),
                    searchableBrand: "Magic: The Gathering",
                    data: {
                      ...(magicCard.raw_data ?? {}),
                      category: "TCG",
                      publisher: "Wizards of the Coast",
                      images: [
                        magicCard.image_normal,
                        magicCard.image_small,
                      ].filter(Boolean),
                    },
                  }
                  : null,
          } as ItemWithProduct;
        })
        .filter((item): item is ItemWithProduct => item !== null);
    },
    enabled: !!showcaseId,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
