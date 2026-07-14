import { POKEMON_TCG_SETS } from "@/constants/pokemonTcgSets";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  searchPokemonCardsCacheFirst,
  type PokemonTcgCard,
} from "./index";
import {
  cardScanDebug,
  cardScanError,
  summarizePokemonCard,
} from "./cardScanDebug";
import {
  containsKnownPokemonName,
  correctPokemonNameCandidate,
} from "./nameCorrection";
import { recognizeTextWithFallbackService } from "./ocrFallback";
import { scanPokemonCardViaTcgTracking } from "./tcgTracking";
import {
  cleanOcrText,
  deduplicateLines,
  isPokemonPromoCard,
  levenshtein,
  normalizeName,
  normalizeOcrDigits,
  repairCollectorNumberGaps,
  similarityRatio,
} from "./ocrPostprocessing";

export interface RecognizedPokemonCard {
  card: PokemonTcgCard;
  score: number;
  exactMatch?: boolean;
  identifierMatches?: number;
}

interface OcrLine {
  text: string;
}

export interface PokemonOcrResult {
  text: string;
  blocks?: { lines?: OcrLine[] }[];
}

export interface PokemonCardIdentifiers {
  nameCandidates: string[];
  collectionCandidates?: string[];
  number: string | null;
  printedTotal: number | null;
  setCode: string | null;
  rawText: string;
  scanHints?: { foil: boolean; promo: boolean };
}

export interface PokemonRecognitionDependencies {
  prepareImage: (imageUri: string) => Promise<string>;
  recognizeText: (imageUri: string) => Promise<PokemonOcrResult>;
  /** Optional server-side second OCR pass, tried when the on-device pass yields no matches. */
  fallbackRecognizeText?: (imageUri: string) => Promise<PokemonOcrResult | null>;
  searchCards: (
    identifiers: PokemonCardIdentifiers,
  ) => Promise<RecognizedPokemonCard[]>;
  /**
   * Last-resort image-based match (TCGTracking's /v1/scan), tried when
   * both text-OCR passes fail to find anything. Takes the ORIGINAL,
   * uncropped image uri — it does its own crop/compress internally.
   */
  imageScanFallback?: (imageUri: string) => Promise<RecognizedPokemonCard[]>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_ASPECT_RATIO = 63 / 88;

/** Resolution target for OCR crops. Higher = better text but slower. */
const OCR_IMAGE_WIDTH = 1400;

/** Top portion of the card containing the name banner. */
const NAME_ZONE_TOP = 0;
const NAME_ZONE_BOTTOM = 0.18;

/** Bottom portion containing collector number, set code, totals. */
const FOOTER_ZONE_TOP = 0.87;
const FOOTER_ZONE_BOTTOM = 1;

/** Words that indicate metadata lines, not the card name. */
const OCR_METADATA_WORDS = new Set([
  "ancient",
  "basic",
  "energy",
  "future",
  "item",
  "pokemon",
  "pokémon",
  "stage",
  "stadium",
  "supporter",
  "trainer",
  // Rarity badges read as standalone lines on full-art cards
  "vmax",
  "vstar",
]);

/**
 * Game-mechanic keywords — lines containing any of these are card rules /
 * ability text / stats, never Pokémon names.
 */
const GAME_MECHANIC_KEYWORDS = [
  "ability",
  "weakness",
  "resistance",
  "retreat",
  "poké-power",
  "poké-body",
  "poképower",
  "pokébody",
  "evolves from",
  "dynamax",
  "gigantamax",
  "vmax rule",
  "vstar rule",
  "v rule",
  "ex rule",
  "discard",
];

/** Language codes that OCR concatenates with set codes (e.g. "TWMEN"). */
const LANGUAGE_SUFFIXES = ["EN", "DE", "FR", "ES", "IT", "PT", "JP", "KO", "ZH"];

/**
 * Check whether a single word is a metadata word — either exactly or within
 * 1 edit distance (catches OCR typos like "BASIG" → "BASIC").
 */
function isMetadataWord(word: string): boolean {
  if (OCR_METADATA_WORDS.has(word)) return true;
  for (const meta of OCR_METADATA_WORDS) {
    if (Math.abs(word.length - meta.length) <= 1 && levenshtein(word, meta) <= 1) {
      return true;
    }
  }
  return false;
}

/** Short uppercase tokens that are NOT set codes — common false positives. */
const SET_CODE_BLACKLIST = new Set([
  "EN", "HP", "LV", "NO", "PP", "IS", "THE", "AN", "GX", "EX",
  "OF", "IN", "TO", "AT", "BY", "OR", "IT",
]);

/** Every ptcgoCode that actually exists — anything else is OCR noise. */
const KNOWN_SET_CODES = new Set<string>(
  POKEMON_TCG_SETS.flatMap((set) =>
    set.code ? [set.code.toUpperCase()] : [],
  ),
);

/**
 * Collector number patterns — from most specific to broadest.
 *
 * Group 1 = card number, Group 2 = printed total (if present).
 *
 * Covers:
 * - Standard: `111/142`, `057/091`
 * - Secret rare: `201/198`
 * - OCR mangled slashes: `111|142`, `111[142`
 * - Promo: `SWSH001`, `SVP 038`, `SV001`, `SM03`
 */
const COLLECTOR_NUMBER_PATTERNS: RegExp[] = [
  // Standard "number / total" with OCR-friendly separators
  /([A-Z0-9]{1,4})\s*[\/\[|]\s*([0-9OIL]{2,4})/i,
  // Promo-style: "SVP 038", "SWSH001", "SM03" — the prefix+digits form the
  // whole collector number (no separate total is printed on promo cards),
  // so this is captured as a single group rather than number + total.
  /\b([A-Z]{2,5}\s?\d{2,4})\b/i,
];

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const SCORE_WEIGHT_NAME = 0.5;
const SCORE_WEIGHT_NUMBER = 0.3;
const SCORE_WEIGHT_SET_CODE = 0.1;
const SCORE_WEIGHT_TOTAL = 0.1;

/** Minimum score to consider a card a viable match. */
const MIN_MATCH_SCORE = 0.55;

/** Maximum candidates to return from scoring. */
const MAX_CANDIDATES = 5;

/** Minimum name similarity to award any name score. */
const MIN_NAME_SIMILARITY = 0.65;

/**
 * Minimum name similarity for foil scans, where glare commonly garbles the
 * name text. Relaxed so a foil card can still score on number + collection
 * even when the OCR'd name is a poor match.
 */
const MIN_NAME_SIMILARITY_FOIL = 0.4;

// ---------------------------------------------------------------------------
// Image preparation
// ---------------------------------------------------------------------------

export function calculatePokemonCardCrop(
  imageWidth: number,
  imageHeight: number,
) {
  const width = Math.min(imageWidth * 0.9, imageHeight * CARD_ASPECT_RATIO);
  const height = width / CARD_ASPECT_RATIO;
  return {
    originX: Math.max(0, (imageWidth - width) / 2),
    originY: Math.max(0, (imageHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Calculate a sub-zone crop from an already-calculated full-card crop.
 */
function zoneCrop(
  fullCrop: { originX: number; originY: number; width: number; height: number },
  topFraction: number,
  bottomFraction: number,
) {
  const zoneOriginY = fullCrop.originY + fullCrop.height * topFraction;
  const zoneHeight = fullCrop.height * (bottomFraction - topFraction);
  return {
    originX: fullCrop.originX,
    originY: Math.round(zoneOriginY),
    width: fullCrop.width,
    height: Math.max(1, Math.round(zoneHeight)),
  };
}

async function renderCrop(
  imageUri: string,
  crop: { originX: number; originY: number; width: number; height: number },
  targetWidth: number,
) {
  const context = ImageManipulator.manipulate(imageUri);
  context
    .crop(crop)
    .resize({ width: Math.min(targetWidth, crop.width), height: null });
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ compress: 1, format: SaveFormat.JPEG });
}

export async function preparePokemonCardImage(imageUri: string) {
  const originalContext = ImageManipulator.manipulate(imageUri);
  const original = await originalContext.renderAsync();
  const crop = calculatePokemonCardCrop(original.width, original.height);
  cardScanDebug("ocr.image-crop", {
    sourceWidth: original.width,
    sourceHeight: original.height,
    ...crop,
  });

  const result = await renderCrop(imageUri, crop, OCR_IMAGE_WIDTH);
  cardScanDebug("ocr.image-ready", {
    width: result.width,
    height: result.height,
    previewUri: result.uri,
  });
  return result.uri;
}

/**
 * Prepare zone-specific crops for targeted OCR.
 *
 * Returns URIs for the name zone (top ~18%) and footer zone (bottom ~13%)
 * of the card. Each zone is cropped and resized independently for optimal
 * text recognition.
 */
export async function preparePokemonCardZones(imageUri: string) {
  const originalContext = ImageManipulator.manipulate(imageUri);
  const original = await originalContext.renderAsync();
  const fullCrop = calculatePokemonCardCrop(original.width, original.height);

  const nameCrop = zoneCrop(fullCrop, NAME_ZONE_TOP, NAME_ZONE_BOTTOM);
  const footerCrop = zoneCrop(fullCrop, FOOTER_ZONE_TOP, FOOTER_ZONE_BOTTOM);

  cardScanDebug("ocr.zone-crops", {
    fullCrop,
    nameCrop,
    footerCrop,
  });

  const [nameResult, footerResult, fullResult] = await Promise.all([
    renderCrop(imageUri, nameCrop, OCR_IMAGE_WIDTH),
    renderCrop(imageUri, footerCrop, OCR_IMAGE_WIDTH),
    renderCrop(imageUri, fullCrop, OCR_IMAGE_WIDTH),
  ]);

  return {
    nameZoneUri: nameResult.uri,
    footerZoneUri: footerResult.uri,
    fullCardUri: fullResult.uri,
  };
}

// ---------------------------------------------------------------------------
// OCR text parsing
// ---------------------------------------------------------------------------

function ocrLines(result: PokemonOcrResult) {
  const structured =
    result.blocks?.flatMap((block) => block.lines ?? []).map((line) => line.text) ?? [];
  return structured.length > 0 ? structured : result.text.split(/\r?\n/);
}

/**
 * Rarity suffixes the OCR often fuses onto the name because they are set in
 * a stylized glyph right after it (e.g. "CinderaceV", "PikachuVMAX").
 * Longer suffixes first so "…VMAX" isn't split as "…VMA" + "V".
 */
const FUSED_NAME_SUFFIXES = ["VMAX", "VSTAR", "GX", "EX", "V", "ex"];

/**
 * Expand a fused candidate into [split form, original, base name] so the
 * catalog search can match the real card name ("Cinderace V") and, failing
 * that, the base Pokémon name ("Cinderace").
 */
function expandFusedNameSuffix(candidate: string): string[] {
  for (const suffix of FUSED_NAME_SUFFIXES) {
    if (candidate.length <= suffix.length + 2 || !candidate.endsWith(suffix)) {
      continue;
    }
    const base = candidate.slice(0, -suffix.length);
    // Real card names always have a space before the suffix, so a suffix
    // glued straight onto a lowercase letter is an OCR artifact.
    if (/[a-z]$/.test(base)) {
      return [`${base} ${suffix}`, candidate, base];
    }
  }
  return [candidate];
}

function cleanNameCandidate(value: string) {
  return value
    .replace(/^(?:basic|stage\s*\d*|trainer|energy|ability)\s*/i, "")
    .replace(/\s+HP\s*\d+.*$/i, "")
    .replace(/\bHP\s*\d+\b/gi, "")
    .replace(/\b\d{2,3}\s*HP\b/gi, "")
    .replace(/\s+\d{2,3}$/, "")
    .replace(/\bV(?:ny|rnax)\b/gi, "VMAX")
    .replace(/[^a-z0-9.'':\-\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePokemonCardText(
  result: PokemonOcrResult,
): PokemonCardIdentifiers {
  const rawLines = ocrLines(result).map((line) => cleanOcrText(line.trim())).filter(Boolean);
  const lines = deduplicateLines(rawLines);

  // --- Collector number extraction ---
  // Match against gap-repaired lines ("043/2 64" → "043/264") but remember
  // the original line so it can be excluded from name candidates.
  const repairedLines = lines.map(repairCollectorNumberGaps);
  let number: string | null = null;
  let printedTotal: number | null = null;
  let numberLine: string | undefined;
  let repairedNumberLine: string | undefined;
  let numberMatch: RegExpMatchArray | null = null;

  for (const pattern of COLLECTOR_NUMBER_PATTERNS) {
    const index = repairedLines.findIndex((line) => pattern.test(line));
    if (index !== -1) {
      numberLine = lines[index];
      repairedNumberLine = repairedLines[index];
      numberMatch = repairedLines[index].match(pattern);
      break;
    }
  }

  if (numberMatch) {
    number = normalizeOcrDigits(numberMatch[1]);
    if (numberMatch[2]) {
      const totalText = normalizeOcrDigits(numberMatch[2]).replace(/[^0-9]/g, "");
      const parsed = Number(totalText);
      printedTotal = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    // Strip a fused regulation mark ("E029/203" → "029"): modern cards print
    // a single-letter mark right before the collector number and OCR often
    // glues them together. Only when a printed total confirms the NNN/NNN
    // form — promo numbers like "TG12" or "SM03" have 2+ letters and no total.
    if (number && printedTotal && /^[d-i]\d{2,4}$/i.test(number)) {
      number = number.slice(1);
    }
  }

  // --- Set code extraction (from the number line prefix or footer) ---
  const prefix = repairedNumberLine && numberMatch
    ? repairedNumberLine.slice(0, numberMatch.index ?? 0)
    : "";
  const setCodes = (prefix.match(/\b[A-Z]{2,5}\b/gi) ?? []).map((code) =>
    code.toUpperCase(),
  );
  const rawSetCode =
    [...setCodes]
      .reverse()
      .find((code) => !SET_CODE_BLACKLIST.has(code)) ?? null;
  // Strip language suffixes that OCR concatenates (e.g. "TWMEN" → "TWM")
  const strippedSetCode = rawSetCode
    ? LANGUAGE_SUFFIXES.reduce(
        (code, suffix) =>
          code.length > suffix.length && code.endsWith(suffix)
            ? code.slice(0, -suffix.length)
            : code,
        rawSetCode,
      )
    : null;
  // Only trust codes that exist in the set catalog — OCR frequently invents
  // short uppercase tokens from footer noise (e.g. "FS" from energy symbols),
  // and a bogus ptcgoCode filter zeroes out otherwise-good searches.
  const setCode =
    strippedSetCode && KNOWN_SET_CODES.has(strippedSetCode)
      ? strippedSetCode
      : null;

  // --- Name candidate extraction ---
  const nameCandidates = lines
    .slice(0, 10)
    .filter((line) => line !== numberLine)
    // Reject lines containing game-mechanic keywords before cleaning
    .filter((line) => {
      const lower = line.toLowerCase();
      return !GAME_MECHANIC_KEYWORDS.some((kw) => lower.includes(kw));
    })
    .map(cleanNameCandidate)
    .flatMap(expandFusedNameSuffix)
    // Fuzzy-correct against the bundled species list; the corrected form goes
    // first so it is searched before the raw OCR text.
    .flatMap((candidate) => {
      const corrected = correctPokemonNameCandidate(candidate);
      return corrected ? [corrected, candidate] : [candidate];
    })
    .filter((line) => {
      if (line.length < 2 || line.length > 40 || !/[a-z]/i.test(line)) return false;
      const words = line.toLowerCase().split(/\s+/);
      // Reject lines where every word is an exact or fuzzy metadata match
      if (words.every((word) => isMetadataWord(word))) return false;
      return true;
    })
    .filter((line, index, all) =>
      all.findIndex((candidate) => normalizeName(candidate) === normalizeName(line)) === index,
    )
    .slice(0, 4);

  const catalogMatches = POKEMON_TCG_SETS.map((set) => {
    const nameSimilarity = lines.reduce(
      (best, line) => Math.max(best, similarityRatio(normalizeName(line), normalizeName(set.name))),
      0,
    );
    const codeMatches = !!setCode && !!set.code && normalizeName(set.code) === normalizeName(setCode);
    const totalMatches = !!printedTotal && set.printedTotal === printedTotal;
    return { set, score: codeMatches ? 1 : totalMatches ? 0.9 : nameSimilarity };
  })
    .filter(({ score }) => score >= 0.78)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    nameCandidates,
    collectionCandidates: catalogMatches.map(({ set }) => set.name),
    number,
    printedTotal,
    setCode,
    rawText: result.text,
  };
}

// ---------------------------------------------------------------------------
// Card scoring
// ---------------------------------------------------------------------------

/**
 * Score how well a candidate card matches the OCR-extracted identifiers.
 * Returns a value between 0 and 1, or 0 if below minimum threshold.
 */
export function scoreCardMatch(
  card: PokemonTcgCard,
  name: string,
  identifiers: PokemonCardIdentifiers,
  options: { lenient?: boolean } = {},
): number {
  if (identifiers.scanHints?.promo && !isPokemonPromoCard(card)) return 0;
  // Strip leading zeros for comparison so "081" and "81" are equivalent.
  const normalizeNum = (s: string) => normalizeOcrDigits(s).replace(/^0+(?=\d)/, "");
  // Name similarity
  const nameSim = similarityRatio(
    normalizeName(card.name),
    normalizeName(name),
  );
  const numberExactlyMatches =
    !!identifiers.number &&
    normalizeNum(card.number) === normalizeNum(identifiers.number);
  const collectionExactlyMatches =
    identifiers.collectionCandidates?.some(
      (collection) => normalizeName(card.set.name) === normalizeName(collection),
    ) ||
    (!!identifiers.setCode &&
      normalizeName(card.set.ptcgoCode ?? "") === normalizeName(identifiers.setCode)) ||
    (!!identifiers.printedTotal && card.set.printedTotal === identifiers.printedTotal);
  const minNameSimilarity = identifiers.scanHints?.foil
    ? MIN_NAME_SIMILARITY_FOIL
    : MIN_NAME_SIMILARITY;
  if (!options.lenient && nameSim < minNameSimilarity) {
    return numberExactlyMatches && collectionExactlyMatches ? 2 / 3 : 0;
  }
  const nameScore = nameSim * SCORE_WEIGHT_NAME;

  // Number match
  let numberScore = 0;
  if (identifiers.number) {
    const cardNum = normalizeNum(card.number);
    const idNum = normalizeNum(identifiers.number);
    if (cardNum === idNum) {
      numberScore = SCORE_WEIGHT_NUMBER;
    } else if (levenshtein(cardNum, idNum) <= 1) {
      numberScore = SCORE_WEIGHT_NUMBER * 0.5;
    }
  } else {
    // No number from OCR — give partial credit
    numberScore = SCORE_WEIGHT_NUMBER * 0.3;
  }

  // Set code match
  let setCodeScore = 0;
  if (identifiers.setCode && card.set.ptcgoCode) {
    if (normalizeName(card.set.ptcgoCode) === normalizeName(identifiers.setCode)) {
      setCodeScore = SCORE_WEIGHT_SET_CODE;
    }
  } else if (!identifiers.setCode) {
    setCodeScore = SCORE_WEIGHT_SET_CODE * 0.3;
  }

  // Printed total match
  let totalScore = 0;
  if (identifiers.printedTotal && card.set.printedTotal) {
    if (card.set.printedTotal === identifiers.printedTotal) {
      totalScore = SCORE_WEIGHT_TOTAL;
    }
  } else if (!identifiers.printedTotal) {
    totalScore = SCORE_WEIGHT_TOTAL * 0.3;
  }

  const total = nameScore + numberScore + setCodeScore + totalScore;
  if (options.lenient) return total;
  return total >= MIN_MATCH_SCORE ? total : 0;
}

function normalizedCollectorNumber(value: string) {
  return normalizeOcrDigits(value.split(/[\/.]/, 1)[0]).replace(/^0+(?=\d)/, "");
}

export function isExactCardIdentifierMatch(
  card: PokemonTcgCard,
  name: string,
  identifiers: PokemonCardIdentifiers,
) {
  if (normalizeName(card.name) !== normalizeName(name)) return false;
  if (identifiers.number && normalizedCollectorNumber(card.number) !== normalizedCollectorNumber(identifiers.number)) return false;
  if (identifiers.printedTotal && card.set.printedTotal !== identifiers.printedTotal) return false;
  if (identifiers.setCode && normalizeName(card.set.ptcgoCode ?? "") !== normalizeName(identifiers.setCode)) return false;
  return true;
}

export function countCardIdentifierMatches(
  card: PokemonTcgCard,
  name: string,
  identifiers: PokemonCardIdentifiers,
) {
  const nameMatches = normalizeName(card.name) === normalizeName(name);
  const numberMatches = !!identifiers.number && normalizedCollectorNumber(card.number) === normalizedCollectorNumber(identifiers.number);
  const collectionMatches =
    identifiers.collectionCandidates?.some(
      (collection) => similarityRatio(normalizeName(card.set.name), normalizeName(collection)) >= 0.86,
    ) ||
    (!!identifiers.setCode && normalizeName(card.set.ptcgoCode ?? "") === normalizeName(identifiers.setCode)) ||
    (!!identifiers.printedTotal && card.set.printedTotal === identifiers.printedTotal);
  return [nameMatches, numberMatches, collectionMatches].filter(Boolean).length;
}

export function buildOfficialNameFallbacks(name: string) {
  const words = name
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  return [...new Set(words.sort((a, b) => b.length - a.length))].slice(0, 2);
}

// ---------------------------------------------------------------------------
// Card search
// ---------------------------------------------------------------------------

/**
 * Search for cards by OCR-extracted identifiers using the Pokémon TCG API
 * and Supabase cache. This is the **scan-pipeline** search — it does NOT
 * use TCGTracking. For manual/fallback search, see `searchPokemonCardSources`
 * in `search.ts`.
 *
 * Hard-capped to a single `searchPokemonCardsCacheFirst` call per image
 * (one cache lookup, falling back to exactly one API call if the cache
 * misses — see its "source" field). No query-variant retries and no fuzzy
 * fallback API calls. If nothing clears the confidence threshold, the
 * closest-scoring cards from that same result set are returned (via a
 * lenient re-score, no extra network calls) so the caller can offer them
 * up for manual confirmation instead of triggering more searches.
 */
async function searchCardsByIdentifiers(
  identifiers: PokemonCardIdentifiers,
): Promise<RecognizedPokemonCard[]> {
  const collection = identifiers.collectionCandidates?.[0];
  const baseAttempt = {
    number: identifiers.number ?? undefined,
    collection,
    printedTotal: identifiers.printedTotal ?? undefined,
    setCode: identifiers.setCode ?? undefined,
  };
  const hasAnchors = !!(
    baseAttempt.number ||
    baseAttempt.collection ||
    baseAttempt.printedTotal ||
    baseAttempt.setCode
  );

  // Attack/ability lines ("Hyper Beam") burn API calls without ever matching
  // a card name — only try candidates that plausibly name a Pokémon. When
  // none do (Trainer/Item cards), fall back to the raw candidate list.
  const speciesCandidates = identifiers.nameCandidates.filter(
    containsKnownPokemonName,
  );
  const rankedCandidates =
    speciesCandidates.length > 0 ? speciesCandidates : identifiers.nameCandidates;

  // Try name candidates in order until one of them returns catalog results;
  // a single garbled candidate should not sink the whole scan.
  const namesToTry = rankedCandidates.slice(0, 3);
  if (namesToTry.length === 0) {
    if (!hasAnchors) return [];
    namesToTry.push("");
  }

  let name = namesToTry[0];
  let cards: PokemonTcgCard[] = [];
  for (const candidate of namesToTry) {
    const attempt = { query: candidate, ...baseAttempt };
    const result = await searchPokemonCardsCacheFirst({ ...attempt, pageSize: 25 });
    cardScanDebug("catalog.search-attempt", {
      ...attempt,
      source: result.source,
      resultCount: result.cards.length,
    });
    if (result.cards.length > 0) {
      name = candidate;
      cards = result.cards;
      break;
    }
  }

  // Relaxation ladder: when every fully-constrained attempt comes up empty,
  // drop the least reliable identifiers and let scoring disambiguate. A
  // single misread set code or number must not sink a scan with a good name.
  if (cards.length === 0 && name) {
    const relaxedAttempts: (typeof baseAttempt)[] = [];
    if (baseAttempt.setCode) {
      relaxedAttempts.push({ ...baseAttempt, setCode: undefined });
    }
    if (baseAttempt.number && (baseAttempt.collection || baseAttempt.printedTotal)) {
      relaxedAttempts.push({ ...baseAttempt, setCode: undefined, number: undefined });
    }
    for (const relaxed of relaxedAttempts) {
      const result = await searchPokemonCardsCacheFirst({
        query: name,
        ...relaxed,
        pageSize: 25,
      });
      cardScanDebug("catalog.search-attempt", {
        query: name,
        ...relaxed,
        relaxed: true,
        source: result.source,
        resultCount: result.cards.length,
      });
      if (result.cards.length > 0) {
        cards = result.cards;
        break;
      }
    }
  }

  if (cards.length === 0) return [];

  const scored = cards
    .map((card) => {
      const identifierMatches = countCardIdentifierMatches(card, name, identifiers);
      return {
        card,
        score: scoreCardMatch(card, name, identifiers),
        exactMatch: identifierMatches >= 2,
        identifierMatches,
      };
    })
    .filter((match) => match.score > 0);

  if (scored.length > 0) {
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  }

  // Nothing cleared the confidence threshold — surface the closest raw
  // matches from the same result set for manual review.
  return cards
    .map((card) => {
      const identifierMatches = countCardIdentifierMatches(card, name, identifiers);
      return {
        card,
        score: scoreCardMatch(card, name, identifiers, { lenient: true }),
        exactMatch: identifierMatches >= 2,
        identifierMatches,
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

// ---------------------------------------------------------------------------
// ML Kit integration
// ---------------------------------------------------------------------------

async function recognizeTextWithMlKit(imageUri: string) {
  try {
    const mlKit = await import(
      "@infinitered/react-native-mlkit-text-recognition"
    );
    const { recognizeText } = mlKit;

    // The module can load in Expo Go but the native module won't be
    // registered, leaving recognizeText as undefined.
    if (typeof recognizeText !== "function") {
      throw new Error(
        "Card OCR requires a development build; it is unavailable in Expo Go.",
      );
    }

    return await recognizeText(imageUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("RNMLKitTextRecognition") ||
      message.includes("development build") ||
      message.includes("native module")
    ) {
      throw new Error(
        "Card OCR requires a development build; it is unavailable in Expo Go.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const defaultDependencies: PokemonRecognitionDependencies = {
  prepareImage: preparePokemonCardImage,
  recognizeText: recognizeTextWithMlKit,
  fallbackRecognizeText: recognizeTextWithFallbackService,
  searchCards: searchCardsByIdentifiers,
  imageScanFallback: (imageUri) => scanPokemonCardViaTcgTracking(imageUri),
};

export async function identifyPokemonCardImage(
  imageUri: string,
  dependencyOverrides: Partial<PokemonRecognitionDependencies> = {},
  onIdentifiers?: (identifiers: PokemonCardIdentifiers) => void,
  scanHints: { foil: boolean; promo: boolean } = { foil: false, promo: false },
): Promise<RecognizedPokemonCard[]> {
  // Merged rather than all-or-nothing so callers can override a single
  // dependency (e.g. disabling the paid backup-OCR fallback for free
  // users) without having to reconstruct the other defaults themselves.
  const dependencies: PokemonRecognitionDependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  };
  const startedAt = Date.now();
  cardScanDebug("ocr.started");

  const buildIdentifiers = (ocr: PokemonOcrResult) => {
    const identifiers = parsePokemonCardText(ocr);
    identifiers.scanHints = scanHints;
    if (scanHints.promo && (identifiers.collectionCandidates?.length ?? 0) === 0) {
      identifiers.collectionCandidates = POKEMON_TCG_SETS
        .filter((set) => /promo/i.test(set.name))
        .map((set) => set.name);
    }
    return identifiers;
  };
  const hasSearchableIdentifiers = (identifiers: PokemonCardIdentifiers) =>
    identifiers.nameCandidates.length > 0 || !!identifiers.number;

  try {
    const preparedUri = await dependencies.prepareImage(imageUri);
    const ocr = await dependencies.recognizeText(preparedUri);
    const identifiers = buildIdentifiers(ocr);
    onIdentifiers?.(identifiers);
    cardScanDebug("ocr.identifiers", {
      nameCandidates: identifiers.nameCandidates,
      number: identifiers.number,
      printedTotal: identifiers.printedTotal,
      setCode: identifiers.setCode,
      rawText: identifiers.rawText,
    });

    let matches: RecognizedPokemonCard[] = [];
    if (hasSearchableIdentifiers(identifiers)) {
      matches = await dependencies.searchCards(identifiers);
    }

    // Server-side second pass: only for scans the on-device OCR could not
    // resolve, and only when a fallback service is configured.
    if (matches.length === 0 && dependencies.fallbackRecognizeText) {
      const fallbackOcr = await dependencies.fallbackRecognizeText(preparedUri);
      if (fallbackOcr) {
        const fallbackIdentifiers = buildIdentifiers(fallbackOcr);
        cardScanDebug("ocr.fallback-identifiers", {
          nameCandidates: fallbackIdentifiers.nameCandidates,
          number: fallbackIdentifiers.number,
          printedTotal: fallbackIdentifiers.printedTotal,
          setCode: fallbackIdentifiers.setCode,
          rawText: fallbackIdentifiers.rawText,
        });
        if (hasSearchableIdentifiers(fallbackIdentifiers)) {
          onIdentifiers?.(fallbackIdentifiers);
          matches = await dependencies.searchCards(fallbackIdentifiers);
        }
      }
    }

    // Final fallback: both text-OCR passes failed to find anything —
    // try image-based matching (TCGTracking /v1/scan) on the original,
    // uncropped photo. Curator-gated by the caller (see TcgCreateScreen),
    // same as fallbackRecognizeText above.
    if (matches.length === 0 && dependencies.imageScanFallback) {
      try {
        const imageMatches = await dependencies.imageScanFallback(imageUri);
        if (imageMatches.length > 0) {
          cardScanDebug("ocr.image-scan-fallback", {
            matchCount: imageMatches.length,
            matches: imageMatches.map((match) => ({
              score: match.score,
              card: summarizePokemonCard(match.card),
            })),
          });
          matches = imageMatches;
        }
      } catch (error) {
        cardScanDebug("ocr.image-scan-fallback-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (matches.length === 0 && !hasSearchableIdentifiers(identifiers)) {
      cardScanDebug("ocr.incomplete", {
        durationMs: Date.now() - startedAt,
      });
      return [];
    }

    cardScanDebug("ocr.completed", {
      durationMs: Date.now() - startedAt,
      matchCount: matches.length,
      matches: matches.map((match) => ({
        score: match.score,
        card: summarizePokemonCard(match.card),
      })),
    });
    return matches;
  } catch (error) {
    cardScanError("ocr.failed", error);
    throw error;
  }
}
