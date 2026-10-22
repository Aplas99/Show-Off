import { getHasActiveMembership } from "@/api/memberships";
import { useAuthStore } from "@/hooks/useAuthStore";
import { createActionLogger } from "@/lib/actionDebug";
import { pickCsvFile, saveCsvFile } from "@/lib/csvFile";
import {
  itemCsvFileName,
  itemsToCsv,
  parseItemCsv,
  type ItemCsvExportSource,
  type ItemCsvImportRow,
  type ItemCsvRowError,
} from "@/lib/itemCsv";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const csvDebug = createActionLogger("ItemCsv");

/** Rows per Supabase request; keeps `in()` filters and insert payloads small. */
const PAGE_SIZE = 500;
/** Must not exceed the batch cap in import_items_csv. */
const INSERT_CHUNK = 100;

export const CSV_MEMBERSHIP_REQUIRED_MESSAGE = "CSV import and export are Curator features.";

async function requireMembership(): Promise<string> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Sign in to import or export your collection.");
  if (!(await getHasActiveMembership())) throw new Error(CSV_MEMBERSHIP_REQUIRED_MESSAGE);
  return userId;
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

// --- Export ---

const EXPORT_SELECT = `
  id, created_at, custom_title, custom_brand, custom_publisher, custom_category, category,
  condition, user_description, price, currency_code, image_url,
  product_ean, pokemon_tcg_card_id, magic_card_id, riftbound_card_id,
  products ( searchableTitle, searchableBrand ),
  pokemon_tcg_cards ( name ),
  magic_cards ( name ),
  riftbound_cards ( name ),
  showcase_items ( showcase ( name ) )
`;

async function fetchExportItems(userId: string): Promise<ItemCsvExportSource[]> {
  const items: ItemCsvExportSource[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("items")
      .select(EXPORT_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as any[]) {
      items.push({
        title:
          row.custom_title ||
          row.products?.searchableTitle ||
          row.pokemon_tcg_cards?.name ||
          row.magic_cards?.name ||
          row.riftbound_cards?.name ||
          "",
        brand: row.custom_brand || row.products?.searchableBrand || null,
        publisher: row.custom_publisher,
        type: row.custom_category,
        category: row.category,
        condition: row.condition,
        price: row.price,
        currency: row.currency_code,
        description: row.user_description,
        barcode: row.product_ean,
        pokemonCardId: row.pokemon_tcg_card_id,
        magicCardId: row.magic_card_id,
        riftboundCardId: row.riftbound_card_id,
        showcases: ((row.showcase_items ?? []) as { showcase: { name: string } | null }[])
          .map((link) => link.showcase?.name)
          .filter((name): name is string => !!name),
        imageUrl: row.image_url,
        createdAt: row.created_at,
      });
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return items;
}

/** Exports every item the signed-in user owns. Resolves null when the save is cancelled. */
export function useExportItemsCsv() {
  return useMutation({
    mutationFn: async (): Promise<{ count: number } | null> => {
      const userId = await requireMembership();
      const items = await fetchExportItems(userId);
      if (items.length === 0) throw new Error("You have no items to export yet.");
      csvDebug.log("export.ready", { count: items.length });
      const saved = await saveCsvFile(itemCsvFileName(), itemsToCsv(items));
      csvDebug.log(saved ? "export.saved" : "export.cancelled", { count: items.length });
      return saved ? { count: items.length } : null;
    },
    onError: (error) => csvDebug.error("export.failed", error),
  });
}

// --- Import ---

/** Maps lower-cased showcase names to ids, creating private showcases for new names. */
async function resolveShowcases(userId: string, names: string[]): Promise<{ byName: Map<string, string>; created: number }> {
  const byName = new Map<string, string>();
  if (names.length === 0) return { byName, created: 0 };

  const { data, error } = await supabase.from("showcase").select("id, name").eq("profile_id", userId);
  if (error) throw new Error(error.message);
  for (const showcase of data ?? []) byName.set(showcase.name.toLowerCase(), showcase.id);

  const missing = names.filter((name) => !byName.has(name.toLowerCase()));
  if (missing.length > 0) {
    const { data: created, error: createError } = await supabase
      .from("showcase")
      .insert(missing.map((name) => ({ profile_id: userId, name, is_default: false, is_public: false, audience_rating: null })))
      .select("id, name");
    if (createError) throw new Error(createError.message);
    for (const showcase of created ?? []) byName.set(showcase.name.toLowerCase(), showcase.id);
  }
  return { byName, created: missing.length };
}

export interface ItemCsvImportResult {
  imported: number;
  /** Rows that were not saved (failed validation or the server rejected them), by line. */
  failed: ItemCsvRowError[];
  /** Rows whose barcode or card id was unknown and were saved as manual items instead. */
  unlinked: number;
  showcasesCreated: number;
}

/** Postgres `insufficient_privilege`, raised by import_items_csv without a membership. */
const MEMBERSHIP_REQUIRED_CODE = "42501";

interface ImportRpcRow {
  row_index: number;
  item_id: number | null;
  linked: boolean;
  /** Set when the server rolled this row back; the other rows are still saved. */
  error: string | null;
}

/**
 * Saves rows through the `import_items_csv` RPC, which re-checks the
 * membership server-side and only links barcodes/card ids that exist in the
 * catalog caches.
 */
async function importRows(userId: string, rows: ItemCsvImportRow[], failed: ItemCsvRowError[]): Promise<ItemCsvImportResult> {
  const showcaseNames = [
    ...new Map(rows.flatMap((row) => row.showcases).map((name) => [name.toLowerCase(), name])).values(),
  ];
  const { byName: showcaseIds, created: showcasesCreated } = await resolveShowcases(userId, showcaseNames);

  let imported = 0;
  let unlinked = 0;
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { data, error } = await supabase.rpc("import_items_csv", {
      p_items: part.map((row) => ({
        title: row.title,
        brand: row.brand,
        publisher: row.publisher,
        type: row.type,
        // Null lets the items_set_category trigger infer it.
        category: row.category,
        condition: row.condition,
        price: row.price,
        currency: row.currency,
        description: row.description,
        barcode: row.barcode,
        pokemon_card_id: row.pokemon_card_id,
        magic_card_id: row.magic_card_id,
        riftbound_card_id: row.riftbound_card_id,
        image_url: row.image_url,
        showcase_ids: row.showcases.flatMap((name) => showcaseIds.get(name.toLowerCase()) ?? []),
      })),
    });
    if (error) {
      csvDebug.error("import.rpc-failed", error);
      const membershipRequired = error.code === MEMBERSHIP_REQUIRED_CODE;
      if (membershipRequired && imported === 0) throw new Error(CSV_MEMBERSHIP_REQUIRED_MESSAGE);
      // Keep going: earlier chunks are saved and later ones may still succeed.
      const message = membershipRequired ? CSV_MEMBERSHIP_REQUIRED_MESSAGE : `Could not save: ${error.message}`;
      failed.push(...part.map((row) => ({ line: row.line, message })));
      continue;
    }

    const results = new Map(((data ?? []) as ImportRpcRow[]).map((result) => [result.row_index, result]));
    part.forEach((row, index) => {
      const result = results.get(index);
      if (!result || result.error || result.item_id == null) {
        failed.push({ line: row.line, message: result?.error ?? "Could not save this row" });
        return;
      }
      imported++;
      const requestedLink = !!(row.pokemon_card_id || row.magic_card_id || row.riftbound_card_id || row.barcode);
      if (requestedLink && !result.linked) unlinked++;
    });
  }

  failed.sort((a, b) => a.line - b.line);
  return { imported, failed, unlinked, showcasesCreated };
}

/**
 * Picks a CSV and adds each valid row as a new item. A row that fails —
 * client validation or on the server — is reported by line and never blocks
 * the others. Resolves null when the picker is cancelled.
 */
export function useImportItemsCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ItemCsvImportResult | null> => {
      const userId = await requireMembership();
      const text = await pickCsvFile();
      if (text == null) return null;

      const { rows, errors } = parseItemCsv(text);
      csvDebug.log("import.parsed", { valid: rows.length, invalid: errors.length });
      if (rows.length === 0) {
        return { imported: 0, failed: errors, unlinked: 0, showcasesCreated: 0 };
      }
      const result = await importRows(userId, rows, [...errors]);
      csvDebug.log("import.completed", { imported: result.imported, failed: result.failed.length, unlinked: result.unlinked });
      return result;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["showcase:items"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
    onError: (error) => csvDebug.error("import.failed", error),
  });
}
