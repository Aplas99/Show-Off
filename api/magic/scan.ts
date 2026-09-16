import { cleanOcrText, deduplicateLines } from "@/api/pokemon/ocrPostprocessing";
import { createActionLogger } from "@/lib/actionDebug";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  fetchScryfallApi,
  MagicApiError,
  magicCardSchema,
  searchMagicCardsCacheFirst,
  type MagicCard,
} from "./index";

// Scryfall has no image-scan endpoint, so Magic scanning is on-device OCR
// (ML Kit, same native module as the Pokémon scanner) on the card's name
// banner, resolved through Scryfall's typo-tolerant /cards/named?fuzzy=
// endpoint. Requires a development build — OCR is unavailable in Expo Go.

const magicScanDebug = createActionLogger("MagicScan");

const CARD_ASPECT_RATIO = 63 / 88;
/** Resolution target for the OCR crop. */
const OCR_IMAGE_WIDTH = 1200;
/** Top portion of a Magic card containing the name banner (all frames). */
const NAME_ZONE_BOTTOM = 0.16;
const MAX_CANDIDATE_NAMES = 3;
const MAX_MATCHES = 5;

interface OcrLine {
  text: string;
}

export interface MagicOcrResult {
  text: string;
  blocks?: { lines?: OcrLine[] }[];
}

export interface MagicScanDependencies {
  prepareImage: (imageUri: string) => Promise<string>;
  recognizeText: (imageUri: string) => Promise<MagicOcrResult>;
  findCardByFuzzyName: (name: string) => Promise<MagicCard | null>;
  searchCardsByName: (name: string) => Promise<MagicCard[]>;
}

/**
 * Crop the centered card region's name banner (top ~16%) and upscale it for
 * OCR. Mirrors the Pokémon scanner's generous-centered-crop approach so a
 * card aligned in the camera guide frame is always fully inside the crop.
 */
async function prepareMagicNameImage(imageUri: string) {
  const original = await ImageManipulator.manipulate(imageUri).renderAsync();
  const { width: sourceWidth, height: sourceHeight } = original;

  // Generous centered card-aspect region, matching the on-screen guide frame.
  let cardWidth = sourceWidth * 0.92;
  let cardHeight = cardWidth / CARD_ASPECT_RATIO;
  if (cardHeight > sourceHeight * 0.96) {
    cardHeight = sourceHeight * 0.96;
    cardWidth = cardHeight * CARD_ASPECT_RATIO;
  }
  const originX = Math.max(0, (sourceWidth - cardWidth) / 2);
  const originY = Math.max(0, (sourceHeight - cardHeight) / 2);

  const crop = {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(cardWidth),
    height: Math.round(cardHeight * NAME_ZONE_BOTTOM),
  };
  magicScanDebug.log("ocr.image-crop", {
    sourceWidth,
    sourceHeight,
    ...crop,
  });

  const context = ImageManipulator.manipulate(imageUri);
  context
    .crop(crop)
    .resize({ width: Math.min(OCR_IMAGE_WIDTH, crop.width), height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 1, format: SaveFormat.JPEG });
  return saved.uri;
}

async function recognizeTextWithMlKit(imageUri: string) {
  try {
    const mlKit = await import(
      "@infinitered/react-native-mlkit-text-recognition"
    );
    const { recognizeText } = mlKit;

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

/**
 * Pull plausible card-name candidates out of the name-banner OCR. The name
 * is the dominant text line; mana-cost symbols, artifacts of the frame, and
 * stray digits are filtered out.
 */
export function extractMagicNameCandidates(ocr: MagicOcrResult): string[] {
  const lines =
    ocr.blocks?.flatMap((block) => block.lines?.map((line) => line.text) ?? []) ??
    ocr.text.split("\n");

  const cleaned = deduplicateLines(
    lines
      .map((line) => cleanOcrText(line))
      // Strip trailing mana-cost fragments OCR'd off the symbols, e.g. "3 R R" / "{2}{U}"
      .map((line) => line.replace(/[\s({\d][\dWUBRGXC/}()\s]{1,12}$/i, "").trim())
      .filter((line) => {
        if (line.length < 3 || line.length > 40) return false;
        const letters = line.replace(/[^a-z]/gi, "");
        // Card names are mostly letters; mana costs / collector data are not.
        return letters.length >= Math.ceil(line.length * 0.6);
      }),
  );

  return cleaned.slice(0, MAX_CANDIDATE_NAMES);
}

async function findCardByFuzzyName(name: string): Promise<MagicCard | null> {
  try {
    const raw = await fetchScryfallApi(
      `/cards/named?fuzzy=${encodeURIComponent(name)}`,
    );
    const parsed = magicCardSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // 404 covers both "no match" and "ambiguous name" — not a failure.
    if (error instanceof MagicApiError && error.status === 404) return null;
    throw error;
  }
}

async function searchCardsByName(name: string): Promise<MagicCard[]> {
  const result = await searchMagicCardsCacheFirst({
    query: name,
    pageSize: MAX_MATCHES,
    bypassCache: true,
  });
  return result.cards;
}

const defaultDependencies: MagicScanDependencies = {
  prepareImage: prepareMagicNameImage,
  recognizeText: recognizeTextWithMlKit,
  findCardByFuzzyName,
  searchCardsByName,
};

/**
 * Identify a physical Magic card from a camera photo. Returns the best
 * matches (fuzzy-name hit first, then name-search alternates), or an empty
 * array when nothing could be read/matched.
 */
export async function identifyMagicCardImage(
  imageUri: string,
  dependencyOverrides: Partial<MagicScanDependencies> = {},
  onCandidates?: (names: string[]) => void,
): Promise<MagicCard[]> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const startedAt = Date.now();
  magicScanDebug.log("scan.started");

  const preparedUri = await dependencies.prepareImage(imageUri);
  const ocr = await dependencies.recognizeText(preparedUri);
  const candidates = extractMagicNameCandidates(ocr);
  magicScanDebug.log("scan.ocr-complete", {
    rawText: ocr.text,
    candidates,
  });
  onCandidates?.(candidates);

  if (candidates.length === 0) {
    magicScanDebug.log("scan.no-name-candidates", {
      durationMs: Date.now() - startedAt,
    });
    return [];
  }

  const matches = new Map<string, MagicCard>();
  for (const candidate of candidates) {
    const fuzzyCard = await dependencies.findCardByFuzzyName(candidate);
    magicScanDebug.log("scan.fuzzy-attempt", {
      candidate,
      matched: fuzzyCard ? fuzzyCard.name : null,
    });
    if (!fuzzyCard) continue;

    matches.set(fuzzyCard.id, fuzzyCard);
    // Surface other cards sharing the resolved name (different printings /
    // near names) as alternates for manual confirmation.
    try {
      const alternates = await dependencies.searchCardsByName(fuzzyCard.name);
      for (const card of alternates) {
        if (matches.size >= MAX_MATCHES) break;
        matches.set(card.id, card);
      }
    } catch (error) {
      magicScanDebug.error("scan.alternates-failed", error);
    }
    break;
  }

  // Fuzzy came up empty everywhere — fall back to a contains-style name
  // search on the strongest candidate.
  if (matches.size === 0) {
    try {
      const fallback = await dependencies.searchCardsByName(candidates[0]);
      for (const card of fallback.slice(0, MAX_MATCHES)) {
        matches.set(card.id, card);
      }
      magicScanDebug.log("scan.fallback-search", {
        candidate: candidates[0],
        resultCount: fallback.length,
      });
    } catch (error) {
      magicScanDebug.error("scan.fallback-search-failed", error);
    }
  }

  const cards = [...matches.values()];
  magicScanDebug.log("scan.completed", {
    matchCount: cards.length,
    durationMs: Date.now() - startedAt,
    matches: cards.map((card) => ({ id: card.id, name: card.name, set: card.set })),
  });
  return cards;
}
