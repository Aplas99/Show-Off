import { fetchExternalProducts, fetchFromBarcodeLookup, resolveProductForItem } from "@/api/products";
import type { CatalogProduct } from "@/lib/productCatalog";
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
export interface Product extends CatalogProduct {
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

export interface ItemDetailsUpdate {
  itemId: number;
  title: string;
  brand: string;
  publisher: string;
  category: string;
  description: string;
  price: number | null;
  forSale: boolean;
}

export function useUpdateItemDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, title, brand, publisher, category, description, price, forSale }: ItemDetailsUpdate) => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again to edit this item.");
      const { data, error } = await supabase.from("items").update({
        custom_title: title.trim(),
        custom_brand: brand.trim() || null,
        custom_publisher: publisher.trim() || null,
        custom_category: category.trim() || null,
        user_description: description.trim() || null,
        price,
        for_sale: forSale,
      }).eq("id", itemId).eq("user_id", user.id)
        .select("custom_title, custom_brand, custom_publisher, custom_category, user_description, price, for_sale")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["showcase:items"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
      queryClient.invalidateQueries({ queryKey: ["social", "feed"] });
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
      const items = await fetchExternalProducts(query);
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

      const pokemonTcgCardId = payload.productData?.pokemonTcgId ?? null;
      let resolved: Awaited<ReturnType<typeof resolveProductForItem>>;
      try {
        resolved = await resolveProductForItem(payload.productData, payload.searchQuery);
      } catch (error) {
        if (!payload.customTitle) throw error;
        // A manually titled item may be saved without a catalog association.
        resolved = { product: payload.productData, productEan: null };
      }
      const { product: productData, productEan } = resolved;
      // Preserve selected product details as personal fields if it has no
      // shared record. Never write client-supplied metadata into the catalog.
      const personalProduct = !productEan && !pokemonTcgCardId ? productData : null;
      if (!productEan && !pokemonTcgCardId && !payload.customTitle && !personalProduct?.title) {
        throw new Error("No matching product was found. Add a title to save it manually.");
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
          custom_title: payload.customTitle || personalProduct?.title || null,
          custom_brand: payload.customBrand || personalProduct?.brand || null,
          custom_publisher: payload.customPublisher || null,
          custom_category: payload.customCategory || personalProduct?.category || null,
          condition: payload.condition,
          user_description: payload.userDescription ?? personalProduct?.description,
          for_sale: payload.forSale,
          price: payload.price,
          image_url: finalImageUrl || personalProduct?.images?.[0] || null,
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
