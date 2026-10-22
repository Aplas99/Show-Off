import { ITEM_CATEGORIES, isItemCategory, type ItemCategory } from "@/constants/itemCategory";
import { ITEM_CONDITIONS, type ItemCondition } from "@/constants/itemCondition";
import { normalizeImageUrl } from "@/lib/itemImages";
import { z } from "zod";

/**
 * CSV import/export of a user's collection (Curator perk). Pure helpers only:
 * the Supabase reads/writes live in `api/items/csv.ts`, file pickers in
 * `lib/csvFile.ts`.
 */

export const ITEM_CSV_COLUMNS = [
  "title",
  "brand",
  "publisher",
  "type",
  "category",
  "condition",
  "price",
  "currency",
  "description",
  "barcode",
  "pokemon_card_id",
  "magic_card_id",
  "riftbound_card_id",
  "tcg_card_id",
  "showcases",
  "image_url",
  "created_at",
] as const;

export type ItemCsvColumn = (typeof ITEM_CSV_COLUMNS)[number];

/** Upper bounds keep a single import from flooding the items table. */
export const ITEM_CSV_MAX_ROWS = 1000;
export const ITEM_CSV_MAX_BYTES = 2 * 1024 * 1024;

/** Separates showcase names inside the `showcases` cell. */
const SHOWCASE_SEPARATOR = ";";

// --- Low-level CSV (RFC 4180) ---

/**
 * Spreadsheet apps evaluate cells starting with these as formulas, so a
 * crafted title could run a formula when the export is opened. Prefixing with
 * an apostrophe keeps the text literal; `unescapeFormula` reverses it.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_PREFIX.test(value.slice(1)) ? value.slice(1) : value;
}

function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((cell) => quoteCell(escapeFormula(cell))).join(",")).join("\r\n") + "\r\n";
}

/** Parses CSV text into rows of raw cells. Tolerates a BOM, CRLF/LF and quoted newlines. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (inQuotes) throw new Error("The CSV has an unclosed quoted field.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

// --- Export ---

export interface ItemCsvExportSource {
  title: string;
  brand?: string | null;
  publisher?: string | null;
  type?: string | null;
  category?: string | null;
  condition?: string | null;
  price?: number | null;
  currency?: string | null;
  description?: string | null;
  barcode?: string | null;
  pokemonCardId?: string | null;
  magicCardId?: string | null;
  riftboundCardId?: string | null;
  tcgCardId?: string | null;
  showcases: string[];
  imageUrl?: string | null;
  createdAt?: string | null;
}

export function itemsToCsv(items: readonly ItemCsvExportSource[]): string {
  const rows = items.map((item): string[] => [
    item.title,
    item.brand ?? "",
    item.publisher ?? "",
    item.type ?? "",
    item.category ?? "",
    item.condition ?? "",
    item.price == null ? "" : String(item.price),
    item.currency ?? "",
    item.description ?? "",
    item.barcode ?? "",
    item.pokemonCardId ?? "",
    item.magicCardId ?? "",
    item.riftboundCardId ?? "",
    item.tcgCardId ?? "",
    item.showcases.join(`${SHOWCASE_SEPARATOR} `),
    item.imageUrl ?? "",
    item.createdAt ?? "",
  ]);
  return toCsv([[...ITEM_CSV_COLUMNS], ...rows]);
}

export function itemCsvFileName(now = new Date()): string {
  return `show-off-collection-${now.toISOString().slice(0, 10)}.csv`;
}

// --- Import ---

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must be ${max} characters or fewer`)
    .transform((value) => value || null);

export const itemCsvRowSchema = z
  .object({
    title: optionalText(200),
    brand: optionalText(200),
    publisher: optionalText(200),
    type: optionalText(100),
    category: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase().replace(/[\s-]+/g, "_"))
      .refine((value) => value === "" || isItemCategory(value), {
        message: `must be one of ${ITEM_CATEGORIES.join(", ")}`,
      })
      .transform((value): ItemCategory | null => (value ? (value as ItemCategory) : null)),
    condition: z
      .string()
      .trim()
      .transform((value) => ITEM_CONDITIONS.find((c) => c.toLowerCase() === value.toLowerCase()) ?? value)
      .refine((value) => value === "" || (ITEM_CONDITIONS as readonly string[]).includes(value), {
        message: `must be one of ${ITEM_CONDITIONS.join(", ")}`,
      })
      .transform((value): ItemCondition | null => (value ? (value as ItemCondition) : null)),
    price: z
      .string()
      .trim()
      .transform((value) => value.replace(/^[$€£¥]/, "").replace(/,/g, ""))
      .refine((value) => value === "" || (/^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value))), {
        message: "must be a non-negative number",
      })
      .transform((value) => (value === "" ? null : Number(value))),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z]{3}$/.test(value), { message: "must be a 3-letter code like USD" })
      .transform((value) => value || "USD"),
    description: optionalText(2000),
    barcode: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{8,14}$/.test(value), { message: "must be 8-14 digits" })
      .transform((value) => value || null),
    pokemon_card_id: optionalText(100),
    magic_card_id: optionalText(100),
    riftbound_card_id: optionalText(100),
    tcg_card_id: optionalText(200),
    showcases: z
      .string()
      .transform((value) => {
        // Showcase names match case-insensitively; keep the first spelling.
        const seen = new Set<string>();
        return value
          .split(SHOWCASE_SEPARATOR)
          .map((name) => name.replace(/\s+/g, " ").trim().slice(0, 100))
          .filter((name) => {
            const key = name.toLowerCase();
            if (!name || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      }),
    image_url: z
      .string()
      .trim()
      // Only remote https images survive an import; local/device URIs from
      // another phone would never load.
      .transform((value) => {
        const url = normalizeImageUrl(value);
        return url?.startsWith("https://") ? url : null;
      }),
  })
  .refine(
    (row) => row.title || row.barcode || row.pokemon_card_id || row.magic_card_id || row.riftbound_card_id
      || row.tcg_card_id,
    { message: "Row needs a title, barcode, or card id" },
  );

export type ItemCsvImportRow = z.output<typeof itemCsvRowSchema> & { line: number };

export interface ItemCsvRowError {
  /** 1-based spreadsheet row, counting the header as row 1. */
  line: number;
  message: string;
}

export interface ParsedItemCsv {
  rows: ItemCsvImportRow[];
  errors: ItemCsvRowError[];
}

/**
 * Validates an item CSV. Column order does not matter and unknown columns
 * (e.g. `created_at` from an export, or `for_sale` from older exports — selling
 * is outside MVP scope) are ignored, so a file exported from
 * Show-Off — or hand-written in a spreadsheet — imports as-is.
 */
export function parseItemCsv(text: string): ParsedItemCsv {
  const [header, ...dataRows] = parseCsv(text);
  if (!header || isBlankRow(header)) throw new Error("The CSV is empty.");

  const columns = header.map((name) => name.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!columns.includes("title")) {
    throw new Error('The CSV needs a header row with at least a "title" column.');
  }
  const itemCount = dataRows.filter((cells) => !isBlankRow(cells)).length;
  if (itemCount === 0) throw new Error("The CSV has no item rows.");
  if (itemCount > ITEM_CSV_MAX_ROWS) {
    throw new Error(`Import up to ${ITEM_CSV_MAX_ROWS} items at a time. Split the file and try again.`);
  }

  const rows: ItemCsvImportRow[] = [];
  const errors: ItemCsvRowError[] = [];
  dataRows.forEach((cells, index) => {
    // Blank lines (common at the end of files) carry no data.
    if (isBlankRow(cells)) return;
    const line = index + 2;
    const record = Object.fromEntries(
      ITEM_CSV_COLUMNS.map((column) => {
        const position = columns.indexOf(column);
        return [column, position === -1 ? "" : unescapeFormula(cells[position] ?? "")];
      }),
    );
    const result = itemCsvRowSchema.safeParse(record);
    if (result.success) {
      rows.push({ ...result.data, line });
    } else {
      const issue = result.error.issues[0];
      const field = issue?.path[0];
      errors.push({ line, message: field ? `${String(field)} ${issue.message}` : (issue?.message ?? "is invalid") });
    }
  });
  return { rows, errors };
}
