/**
 * OCR text cleaning and normalization for Pokémon card scanning.
 *
 * This module handles the messy gap between raw ML Kit OCR output and
 * the structured identifiers that the card lookup pipeline expects.
 */

/** Common OCR character-level misreads for printed card text. */
const CHAR_SUBSTITUTIONS: [RegExp, string][] = [
  [/[\u201C\u201D\u2018\u2019]/g, ""], // smart quotes → remove
  [/[\u2014\u2013]/g, "-"],            // em/en dash → hyphen
  [/[ﬁ]/g, "fi"],           // ligatures
  [/[ﬂ]/g, "fl"],
  [/[©®™]/g, ""],           // symbols from card footer
];

/**
 * Normalize a raw OCR string: strip diacritics (except é in Pokémon),
 * apply common substitutions, and collapse whitespace.
 */
export function cleanOcrText(raw: string): string {
  let text = raw;
  for (const [pattern, replacement] of CHAR_SUBSTITUTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalize digits that OCR commonly confuses with letters and vice-versa.
 * Used specifically for collector numbers.
 */
export function normalizeOcrDigits(value: string): string {
  return value
    .toUpperCase()
    .replace(/[O]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+(?=\d)/, "")
    .toLowerCase();
}

/**
 * Deduplicate lines that appear multiple times in OCR output.
 * ML Kit sometimes returns overlapping blocks with identical text.
 */
export function deduplicateLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy name matching when OCR introduces minor errors.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix for memory efficiency.
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Compute a similarity ratio between two strings (0 = no match, 1 = exact).
 * Based on normalized Levenshtein distance.
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Normalize a card name for comparison: lowercase, strip non-alphanumeric,
 * collapse whitespace.
 */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Extract the first available market price from tcgplayer pricing data.
 * Returns null when no pricing is available.
 */
export function extractMarketPrice(
  prices?: Record<string, { market?: number | null }>,
): number | null {
  if (!prices) return null;
  for (const variant of Object.values(prices)) {
    if (variant.market != null) return variant.market;
  }
  return null;
}

/**
 * Format a USD price for display.
 */
export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}
