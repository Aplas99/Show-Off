import { levenshtein } from "@/api/pokemon/ocrPostprocessing";

export interface RiftboundSet {
  /** Printed set code, as on the card footer and in Riftcodex `set.set_id`. */
  code: string;
  /** Short display name (Riftcodex labels for promo sets are long). */
  name: string;
  /** The `/298` in `011/298`. Promo sets reuse their source set's total. */
  printedTotal: number | null;
  releaseDate: string;
  kind: "main" | "promo";
}

/** Riftcodex set snapshot. Refresh from GET https://api.riftcodex.com/sets. */
export const RIFTBOUND_SETS: readonly RiftboundSet[] = [
  { code: "VEN", name: "Vendetta", printedTotal: 166, releaseDate: "2026-07-31", kind: "main" },
  { code: "UNL", name: "Unleashed", printedTotal: 219, releaseDate: "2026-05-08", kind: "main" },
  { code: "SFD", name: "Spiritforged", printedTotal: 221, releaseDate: "2026-02-13", kind: "main" },
  { code: "OGN", name: "Origins", printedTotal: 298, releaseDate: "2025-10-31", kind: "main" },
  { code: "OGS", name: "Proving Grounds", printedTotal: 24, releaseDate: "2025-10-31", kind: "main" },
  { code: "OPP", name: "Organized Play Promos", printedTotal: null, releaseDate: "2025-10-31", kind: "promo" },
  { code: "JDG", name: "Judge Promos", printedTotal: null, releaseDate: "2025-12-01", kind: "promo" },
  { code: "PR", name: "Promos", printedTotal: null, releaseDate: "2025-10-31", kind: "promo" },
];

const SETS_BY_CODE = new Map(RIFTBOUND_SETS.map((set) => [set.code, set]));

export function getRiftboundSet(code: string | null | undefined): RiftboundSet | undefined {
  return code ? SETS_BY_CODE.get(code.toUpperCase()) : undefined;
}

/** Friendly set name: the snapshot name, else the Riftcodex label, else the code. */
export function getRiftboundSetName(code: string | null | undefined, label?: string | null): string {
  return getRiftboundSet(code)?.name ?? label?.trim() ?? code?.toUpperCase() ?? "Unknown set";
}

/**
 * Printed collector number from a Riftbound ID: `ogn-011-298` → `011/298`,
 * `ogn-011a-298` → `011a/298`, `ven-r06` → `r06`. Signature stars are kept.
 */
export function formatRiftboundCollectorNumber(riftboundId: string | null | undefined): string | null {
  if (!riftboundId) return null;
  const [, number, total] = riftboundId.toLowerCase().split("-");
  if (!number) return null;
  return total ? `${number}/${total}` : number;
}

/** "Released Oct 2025 · 298 cards" style subtitle for a known set. */
export function describeRiftboundSet(code: string | null | undefined): string | null {
  const set = getRiftboundSet(code);
  if (!set) return null;
  const released = new Date(`${set.releaseDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return [
    set.kind === "promo" ? "Promo set" : `Released ${released}`,
    set.printedTotal ? `${set.printedTotal} cards` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * Map an OCR'd footer set code to a known set. Exact codes win; otherwise
 * a main set whose printed total matches; otherwise a one-letter misread
 * of a known code (e.g. `SED` → `SFD`). Returns null when unsure.
 */
export function resolveRiftboundSetCode(ocrCode: string, printedTotal?: number | null): string | null {
  const code = ocrCode.toUpperCase();
  if (SETS_BY_CODE.has(code)) return code;
  const byTotal = RIFTBOUND_SETS.filter((set) => set.kind === "main" && set.printedTotal === printedTotal);
  if (byTotal.length === 1) return byTotal[0].code;
  const close = RIFTBOUND_SETS.filter((set) => set.code.length === code.length && levenshtein(set.code, code) === 1);
  return close.length === 1 ? close[0].code : null;
}
