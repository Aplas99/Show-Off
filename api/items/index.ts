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
}

export interface SearchParams {
  query: string;
  brand?: string;
  manufacturer?: string;
  category?: string;
}

/**
 * Represents the restricted product data structure when joined with an item.
 * This is a subset of the full Product table, focusing on searchable fields.
 */
export interface ShowcaseItemProduct {
  ean: string;
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
  product_ean: string; // Changed to string to match Product.ean usually
  created_at: string;
  image_url: string;
  condition: string;
  user_description: string | null;
  for_sale: boolean;
  price: number | null;
  currency_code?: string;
  products: ShowcaseItemProduct | null;
}

const BarcodeLookupAPIKey =
  process.env.EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY || "";

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

  console.log(`[API] 🌐 Fetching Barcode Lookup: ${sanitized} (Page ${page})`);

  const response = await fetch(
    `https://api.barcodelookup.com/v3/products?${urlParams.toString()}`,
  );

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Barcode Lookup API error: ${response.status}`);
  }

  const raw = await response.json();
  const rawItems: any[] = Array.isArray(raw?.products) ? raw.products : [];

  return rawItems
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
}

// Fetch from UPCItemDB (Trial)
async function fetchFromUPCItemDB(query: string): Promise<Product[]> {
  const sanitized = query.replace(/\s+/g, " ").trim();
  const isCode = /^\d+$/.test(sanitized);

  console.log(`[API] 🔗 Fetching UPCItemDB: ${sanitized} (Code: ${isCode})`);

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

  if (!response.ok) throw new Error(`UPC API error: ${response.status}`);

  const raw = await response.json();
  const rawItems: any[] = Array.isArray(raw?.items) ? raw.items : [];

  return rawItems.map((item: any) => ({
    title: item.title || "",
    ean: item.ean,
    upc: item.upc,
    isbn: item.isbn,
    images: Array.isArray(item.images) ? item.images : undefined,
    description: item.description,
    brand: item.brand,
    price: item.lowest_recorded_price,
  }));
}

// --- Hooks ---

// Main Product Search Hook (Infinite)
export function useProductSearch(params: SearchParams) {
  return useInfiniteQuery({
    queryKey: ["product-search", params.query, params.brand, params.category],
    queryFn: async ({ pageParam = 1 }) => {
      if (!params.query) return { items: [] };
      const items = await fetchFromBarcodeLookup(
        params.query,
        pageParam as number,
        params,
      );
      return { items };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.items.length < 10 ? undefined : allPages.length + 1;
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
      const items = await fetchFromUPCItemDB(query);
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
      console.log("[API] 🏗️ Creating item with lookup:", payload);
      validateCreateItem(payload);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      let productData: Product | undefined;
      const { ean, upc, isbn } = normalizeCodes(payload.searchQuery);

      if (ean || upc || isbn) {
        try {
          // Try UPCItemDB first (free/trial)
          const upcItems = await fetchFromUPCItemDB(payload.searchQuery);
          if (upcItems.length > 0) productData = upcItems[0];
        } catch (e) {
          console.log("UPC failed, trying Barcode Lookup...");
          try {
            const blItems = await fetchFromBarcodeLookup(payload.searchQuery);
            if (blItems.length > 0) productData = blItems[0];
          } catch (e2) {
            console.log("Both APIs failed or found nothing");
          }
        }
      }

      const { data: item, error } = await supabase
        .from("items")
        .insert({
          user_id: user.id,
          product_ean: productData?.ean || ean || upc || null,
          condition: payload.condition,
          user_description: payload.userDescription,
          for_sale: payload.forSale,
          price: payload.price,
        })
        .select()
        .single();

      if (error) throw error;

      return { itemId: item.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["showcase"] });
      qc.invalidateQueries({ queryKey: ["items", "my"] });
    },
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
                        id, user_id, product_ean, created_at, image_url, condition, user_description, for_sale, price, currency_code,
                        products (
                            ean, searchableTitle, searchableDescription, searchableBrand, data
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
            showcase_id: row.showcase_id,
            products: product
              ? {
                  ...product,
                  data: parsedProductData,
                }
              : null,
          } as ItemWithProduct;
        })
        .filter((item): item is ItemWithProduct => item !== null);
    },
    enabled: !!showcaseId,
  });
}
