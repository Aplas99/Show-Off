import POKEMON_NAMES from "@/constants/pokemonNames.json";
import { levenshtein, normalizeName } from "./ocrPostprocessing";

/**
 * Fuzzy correction of OCR name candidates against the full bundled Pokémon
 * species list (constants/pokemonNames.json).
 *
 * The list ships inside the JS bundle and is indexed into an in-memory Map on
 * first import, so lookups are O(1) for exact hits and a single linear pass
 * (with a length pre-filter) for fuzzy ones — no storage round-trips needed.
 */

/** Rarity suffixes that follow the species name on card titles. */
const SUFFIX_TOKENS = new Set(["v", "vmax", "vstar", "ex", "gx"]);

const NORMALIZED_TO_DISPLAY = new Map<string, string>();
for (const name of POKEMON_NAMES as string[]) {
  NORMALIZED_TO_DISPLAY.set(normalizeName(name), name);
}
const ALL_NORMALIZED = [...NORMALIZED_TO_DISPLAY.keys()];

/**
 * Find the species whose name best matches `value`, tolerating small OCR
 * errors. Returns the canonical display name, or null when nothing is close.
 */
export function fuzzyMatchPokemonName(value: string): string | null {
  const normalized = normalizeName(value);
  if (normalized.length < 4) return null;

  const exact = NORMALIZED_TO_DISPLAY.get(normalized);
  if (exact) return exact;

  const maxDistance = normalized.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of ALL_NORMALIZED) {
    if (Math.abs(candidate.length - normalized.length) > maxDistance) continue;
    const distance = levenshtein(candidate, normalized);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best ? NORMALIZED_TO_DISPLAY.get(best)! : null;
}

/**
 * Correct an OCR name candidate ("Cinderaee V" → "Cinderace V") using the
 * bundled species list. Returns the corrected candidate, or null when the
 * candidate is already correct or no species is a plausible match.
 */
export function correctPokemonNameCandidate(candidate: string): string | null {
  const words = candidate.trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return null;

  // Detach a trailing rarity suffix so the species part matches cleanly.
  let suffix: string | null = null;
  if (words.length > 1 && SUFFIX_TOKENS.has(words[words.length - 1].toLowerCase())) {
    suffix = words.pop()!;
  }
  const base = words.join(" ");

  // Whole-base match first — covers multi-word species ("Iron Hands").
  let correctedBase = fuzzyMatchPokemonName(base);

  // Otherwise repair individual words, keeping prefixes like "Galarian".
  if (!correctedBase && words.length > 1) {
    let changed = false;
    const correctedWords = words.map((word) => {
      const match = fuzzyMatchPokemonName(word);
      if (match && normalizeName(match) !== normalizeName(word)) {
        changed = true;
        return match;
      }
      return word;
    });
    if (changed) correctedBase = correctedWords.join(" ");
  }

  if (!correctedBase) return null;

  const corrected = suffix ? `${correctedBase} ${suffix}` : correctedBase;
  return corrected === candidate ? null : corrected;
}
