import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  cardScanDebug,
  cardScanError,
  summarizePokemonCard,
} from "./cardScanDebug";
import {
  searchPokemonCardsCacheFirst,
  type PokemonTcgCard,
} from "./index";
import {
  cleanOcrText,
  deduplicateLines,
  levenshtein,
  normalizeName,
  normalizeOcrDigits,
  similarityRatio,
} from "./ocrPostprocessing";

export interface RecognizedPokemonCard {
  card: PokemonTcgCard;
  score: number;
}

export interface PokemonCardScanFrame {
  previewWidth: number;
  previewHeight: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
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
  number: string | null;
  printedTotal: number | null;
  setCode: string | null;
  rawText: string;
}

export interface PokemonRecognitionDependencies {
  prepareImage: (
    imageUri: string,
    scanFrame?: PokemonCardScanFrame,
  ) => Promise<string>;
  recognizeText: (imageUri: string) => Promise<PokemonOcrResult>;
  searchCards: (
    identifiers: PokemonCardIdentifiers,
  ) => Promise<RecognizedPokemonCard[]>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_ASPECT_RATIO = 63 / 88;

/** Resolution target for OCR crops. Higher = better text but slower. */
const OCR_IMAGE_WIDTH = 2000;

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
]);

/** Short uppercase tokens that are NOT set codes — common false positives. */
const SET_CODE_BLACKLIST = new Set([
  "EN", "HP", "LV", "NO", "PP", "IS", "THE", "AN", "GX", "EX",
  "OF", "IN", "TO", "AT", "BY", "OR", "IT",
]);

/**
 * Collector number patterns — from most specific to broadest.
 *
 * Group 1 = card number, Group 2 = printed total (if present).
 *
 * Covers:
 * - Standard: `111/142`, `057/091`
 * - Secret rare: `201/198`
 * - OCR mangled slashes: `111|142`, `111[142`
 * - Promo: `SWSH001`, `SVP 038`, `SV001`
 */
const COLLECTOR_NUMBER_PATTERNS: RegExp[] = [
  // Standard "number / total" with OCR-friendly separators
  /([A-Z0-9]{1,4})\s*[\/\[|]\s*([0-9OIL]{2,4})/i,
  // Promo-style: "SVP 038", "SWSH001"
  /\b([A-Z]{2,5})\s*(\d{2,4})\b/i,
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

// ---------------------------------------------------------------------------
// Image preparation
// ---------------------------------------------------------------------------

export function calculatePokemonCardCrop(
  imageWidth: number,
  imageHeight: number,
  scanFrame?: PokemonCardScanFrame,
) {
  if (!scanFrame) {
    const width = Math.min(imageWidth * 0.9, imageHeight * CARD_ASPECT_RATIO);
    const height = width / CARD_ASPECT_RATIO;
    return {
      originX: Math.max(0, (imageWidth - width) / 2),
      originY: Math.max(0, (imageHeight - height) / 2),
      width,
      height,
    };
  }

  const scale = Math.max(
    scanFrame.previewWidth / imageWidth,
    scanFrame.previewHeight / imageHeight,
  );
  const horizontalOverflow = (imageWidth * scale - scanFrame.previewWidth) / 2;
  const verticalOverflow = (imageHeight * scale - scanFrame.previewHeight) / 2;
  const originX = Math.min(
    Math.max(0, (scanFrame.frameX + horizontalOverflow) / scale),
    imageWidth - 1,
  );
  const originY = Math.min(
    Math.max(0, (scanFrame.frameY + verticalOverflow) / scale),
    imageHeight - 1,
  );
  const width = Math.min(scanFrame.frameWidth / scale, imageWidth - originX);
  const height = Math.min(scanFrame.frameHeight / scale, imageHeight - originY);

  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
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

export async function preparePokemonCardImage(
  imageUri: string,
  scanFrame?: PokemonCardScanFrame,
) {
  const originalContext = ImageManipulator.manipulate(imageUri);
  const original = await originalContext.renderAsync();
  const crop = calculatePokemonCardCrop(
    original.width,
    original.height,
    scanFrame,
  );
  cardScanDebug("ocr.image-crop", {
    sourceWidth: original.width,
    sourceHeight: original.height,
    ...crop,
    scanFrame: scanFrame ?? null,
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
export async function preparePokemonCardZones(
  imageUri: string,
  scanFrame?: PokemonCardScanFrame,
) {
  const originalContext = ImageManipulator.manipulate(imageUri);
  const original = await originalContext.renderAsync();
  const fullCrop = calculatePokemonCardCrop(
    original.width,
    original.height,
    scanFrame,
  );

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

function cleanNameCandidate(value: string) {
  return value
    .replace(/^(?:basic|stage\s*\d*|trainer|energy)\s*/i, "")
    .replace(/\s+HP\s*\d+.*$/i, "")
    .replace(/\bHP\s*\d+\b/gi, "")
    .replace(/\b\d{2,3}\s*HP\b/gi, "")
    .replace(/\s+\d{2,3}$/, "")
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
  let number: string | null = null;
  let printedTotal: number | null = null;
  let numberLine: string | undefined;
  let numberMatch: RegExpMatchArray | null = null;

  for (const pattern of COLLECTOR_NUMBER_PATTERNS) {
    const found = lines.find((line) => pattern.test(line));
    if (found) {
      numberLine = found;
      numberMatch = found.match(pattern);
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
  }

  // --- Set code extraction (from the number line prefix or footer) ---
  const prefix = numberLine && numberMatch
    ? numberLine.slice(0, numberMatch.index ?? 0)
    : "";
  const setCodes = (prefix.match(/\b[A-Z]{2,5}\b/gi) ?? []).map((code) =>
    code.toUpperCase(),
  );
  const setCode =
    [...setCodes]
      .reverse()
      .find((code) => !SET_CODE_BLACKLIST.has(code)) ?? null;

  // --- Name candidate extraction ---
  const nameCandidates = lines
    .slice(0, 10)
    .filter((line) => line !== numberLine)
    .map(cleanNameCandidate)
    .filter((line) => {
      if (line.length < 2 || line.length > 40 || !/[a-z]/i.test(line)) return false;
      const words = line.toLowerCase().split(/\s+/);
      return !words.every((word) => OCR_METADATA_WORDS.has(word));
    })
    .filter((line, index, all) =>
      all.findIndex((candidate) => normalizeName(candidate) === normalizeName(line)) === index,
    )
    .slice(0, 4);

  return {
    nameCandidates,
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
): number {
  // Name similarity
  const nameSim = similarityRatio(
    normalizeName(card.name),
    normalizeName(name),
  );
  if (nameSim < MIN_NAME_SIMILARITY) return 0;
  const nameScore = nameSim * SCORE_WEIGHT_NAME;

  // Number match
  let numberScore = 0;
  if (identifiers.number) {
    const cardNum = normalizeOcrDigits(card.number);
    if (cardNum === identifiers.number) {
      numberScore = SCORE_WEIGHT_NUMBER;
    } else if (levenshtein(cardNum, identifiers.number) <= 1) {
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
  return total >= MIN_MATCH_SCORE ? total : 0;
}

// ---------------------------------------------------------------------------
// Card search
// ---------------------------------------------------------------------------

/**
 * Search for cards by OCR-extracted identifiers using the Pokémon TCG API
 * and Supabase cache. This is the **scan-pipeline** search — it does NOT
 * use TCGTracking. For manual/fallback search, see `searchPokemonCardSources`
 * in `search.ts`.
 */
async function searchCardsByIdentifiers(
  identifiers: PokemonCardIdentifiers,
): Promise<RecognizedPokemonCard[]> {
  if (identifiers.nameCandidates.length === 0) return [];

  const allScored: RecognizedPokemonCard[] = [];

  for (const name of identifiers.nameCandidates) {
    const attempts = identifiers.setCode
      ? [identifiers.setCode, undefined]
      : [undefined];

    for (const setCode of attempts) {
      const result = await searchPokemonCardsCacheFirst({
        query: name,
        number: identifiers.number ?? undefined,
        printedTotal: identifiers.printedTotal ?? undefined,
        setCode,
        pageSize: 25,
      });

      for (const card of result.cards) {
        const score = scoreCardMatch(card, name, identifiers);
        if (score > 0) {
          // Avoid duplicates
          if (!allScored.some((s) => s.card.id === card.id)) {
            allScored.push({ card, score });
          }
        }
      }

      // If we found strong matches, stop searching
      if (allScored.some((s) => s.score >= 0.8)) break;
    }

    if (allScored.some((s) => s.score >= 0.8)) break;
  }

  return allScored
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
  searchCards: searchCardsByIdentifiers,
};

export async function identifyPokemonCardImage(
  imageUri: string,
  dependencies: PokemonRecognitionDependencies = defaultDependencies,
  scanFrame?: PokemonCardScanFrame,
  onIdentifiers?: (identifiers: PokemonCardIdentifiers) => void,
): Promise<RecognizedPokemonCard[]> {
  const startedAt = Date.now();
  cardScanDebug("ocr.started");
  try {
    const preparedUri = scanFrame
      ? await dependencies.prepareImage(imageUri, scanFrame)
      : await dependencies.prepareImage(imageUri);
    const ocr = await dependencies.recognizeText(preparedUri);
    const identifiers = parsePokemonCardText(ocr);
    onIdentifiers?.(identifiers);
    cardScanDebug("ocr.identifiers", {
      nameCandidates: identifiers.nameCandidates,
      number: identifiers.number,
      printedTotal: identifiers.printedTotal,
      setCode: identifiers.setCode,
      rawText: identifiers.rawText,
    });

    if (identifiers.nameCandidates.length === 0 && !identifiers.number) {
      cardScanDebug("ocr.incomplete", {
        durationMs: Date.now() - startedAt,
      });
      return [];
    }

    const matches = await dependencies.searchCards(identifiers);
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
