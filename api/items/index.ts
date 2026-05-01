import { uploadImageToSupabase } from "@/api/storage";
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
  product_ean: string;
  created_at: string;
  image_url: string;
  condition: string;
  user_description: string | null;
  for_sale: boolean;
  price: number | null;
  currency_code?: string;
  products: ShowcaseItemProduct | null;
  custom_title?: string | null;
  custom_brand?: string | null;
  custom_publisher?: string | null;
  custom_category?: string | null;
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

      let productData: Product | undefined = payload.productData ?? undefined;
      const { ean, upc, isbn } = payload.searchQuery
        ? normalizeCodes(payload.searchQuery)
        : { ean: undefined, upc: undefined, isbn: undefined };

      if (!productData && (ean || upc || isbn) && payload.searchQuery) {
        try {
          // Try UPCItemDB first (free/trial)
          const upcItems = await fetchFromUPCItemDB(payload.searchQuery);
          if (upcItems.length > 0) productData = upcItems[0];
        } catch {
          console.log("UPC failed, trying Barcode Lookup...");
          try {
            const blItems = await fetchFromBarcodeLookup(payload.searchQuery);
            if (blItems.length > 0) productData = blItems[0];
          } catch {
            console.log("Both APIs failed or found nothing");
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
          console.error("Failed to upload image:", e);
          throw e; // Fail creation if upload fails
        }
      }

      const { data: item, error } = await supabase
        .from("items")
        .insert({
          user_id: user.id,
          product_ean: productEan,
          is_verified: !!productEan,
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
                        id, user_id, product_ean, created_at, image_url, condition, user_description, for_sale, price, currency_code, custom_title, custom_brand, custom_publisher, custom_category,
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
            custom_title: item.custom_title, // Ensure these are passed through if selected
            custom_brand: item.custom_brand,
            custom_publisher: item.custom_publisher,
            custom_category: item.custom_category,
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
