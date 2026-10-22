import { cleanOcrText, deduplicateLines, normalizeName, similarityRatio } from "@/api/pokemon/ocrPostprocessing";
import { resolveRiftboundSetCode } from "@/constants/riftboundSets";
import { createActionLogger } from "@/lib/actionDebug";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { fetchRiftboundCardsByCode, searchRiftboundCardsCacheFirst, type RiftboundCard } from "./index";

// Riftbound scanning reads the lower half of the card: type line, name
// banner, rules text, and the footer code (e.g. "OGN • 011/298"). The footer
// code maps straight to Riftcodex's riftbound_id, so it is tried first; the
// name banner is the fallback when the code is unreadable.

const riftboundScanDebug = createActionLogger("RiftboundScan");

const CARD_ASPECT_RATIO = 63 / 88;
const OCR_IMAGE_WIDTH = 1200;
/** The name banner starts just under the art, a little above mid-card. */
const LOWER_ZONE_TOP = 0.5;
const MAX_MATCHES = 5;
/** Minimum similarity between an OCR'd name and a candidate card name. */
const NAME_MATCH_THRESHOLD = 0.72;

/** Words on the type line ("CHAMPION UNIT", "SIGNATURE SPELL", ...). */
const TYPE_WORDS = /\b(unit|spell|gear|rune|legend|battlefield|champion|signature|token|equipment)\b/i;

export interface RiftboundOcrResult {
  text: string;
  blocks?: { lines?: { text: string }[] }[];
}

export interface RiftboundScanDependencies {
  prepareImage: (imageUri: string) => Promise<string>;
  recognizeText: (imageUri: string) => Promise<RiftboundOcrResult>;
  findCardsByCode: (code: string) => Promise<RiftboundCard[]>;
  searchCardsByName: (name: string) => Promise<RiftboundCard[]>;
}

export interface RiftboundScanIdentifiers {
  /** Full printed codes, e.g. `ogn-011-298` or `unl-229*-219`. */
  codes: string[];
  /** Name guesses, best first, e.g. `Yone - Blademaster`, `Yone`. */
  names: string[];
}

/** Crop the card's lower half (inside the on-screen guide frame) for OCR. */
async function prepareRiftboundImage(imageUri: string) {
  const original = await ImageManipulator.manipulate(imageUri).renderAsync();
  const { width: sourceWidth, height: sourceHeight } = original;

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
    originY: Math.round(originY + cardHeight * LOWER_ZONE_TOP),
    width: Math.round(cardWidth),
    height: Math.round(Math.min(cardHeight * (1 - LOWER_ZONE_TOP), sourceHeight - originY - cardHeight * LOWER_ZONE_TOP)),
  };
  riftboundScanDebug.log("ocr.image-crop", { sourceWidth, sourceHeight, ...crop });

  const context = ImageManipulator.manipulate(imageUri);
  context.crop(crop).resize({ width: Math.min(OCR_IMAGE_WIDTH, crop.width), height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 1, format: SaveFormat.JPEG });
  return saved.uri;
}

async function recognizeTextWithMlKit(imageUri: string) {
  try {
    const mlKit = await import("@infinitered/react-native-mlkit-text-recognition");
    if (typeof mlKit.recognizeText !== "function") {
      throw new Error("Card OCR requires a development build; it is unavailable in Expo Go.");
    }
    return await mlKit.recognizeText(imageUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("RNMLKitTextRecognition") || message.includes("development build") || message.includes("native module")) {
      throw new Error("Card OCR requires a development build; it is unavailable in Expo Go.");
    }
    throw error;
  }
}

function ocrLines(ocr: RiftboundOcrResult) {
  const lines = ocr.blocks?.flatMap((block) => block.lines?.map((line) => line.text) ?? []);
  return deduplicateLines((lines?.length ? lines : ocr.text.split("\n")).map(cleanOcrText).filter(Boolean));
}

/** OCR reads O/0, I/l/1 interchangeably in the footer; fix by position. */
const toDigits = (value: string) => value.replace(/[oO]/g, "0").replace(/[iIlL|]/g, "1");
const toLetters = (value: string) => value.replace(/0/g, "O").replace(/1/g, "I").toUpperCase();

/** Footer code: set code, separator dot, number (signatures add `*`), slash, set total. */
// The set code must contain a letter, so the number's digits can't be read as one.
const CODE_PATTERN = /\b((?=[A-Z0-9]{0,3}[A-Z])[A-Z0-9]{2,4})\s*[•·.,:*\-]?\s*([\dOoIlL|]{1,3})(\*?)\s*\/\s*([\dOoIlL|]{1,3})\b/g;

/** Pull printed codes and name guesses out of lower-card OCR text. */
export function extractRiftboundIdentifiers(ocr: RiftboundOcrResult): RiftboundScanIdentifiers {
  const lines = ocrLines(ocr);

  const codes = new Set<string>();
  for (const line of lines) {
    for (const match of line.matchAll(CODE_PATTERN)) {
      const number = toDigits(match[2]);
      const total = toDigits(match[4]);
      if (!/^\d+$/.test(number) || !/^\d+$/.test(total) || Number(number) === 0) continue;
      // Correct misread set codes against the known sets (by code, then by
      // the set's printed total); keep an unknown but plausible code as-is.
      const read = toLetters(match[1]);
      const set = resolveRiftboundSetCode(read, Number(total)) ?? (/^[A-Z]{2,4}$/.test(read) ? read : null);
      if (!set) continue;
      codes.add(`${set}-${number.padStart(3, "0")}${match[3]}-${total.padStart(3, "0")}`.toLowerCase());
    }
  }

  // The name is the first mixed-case line after the type line; a champion's
  // title follows it on its own all-caps line ("Yone" / "BLADEMASTER").
  const names: string[] = [];
  const isLetterHeavy = (line: string) => {
    const letters = line.replace(/[^a-z]/gi, "");
    return line.length >= 2 && line.length <= 40 && letters.length >= Math.ceil(line.replace(/\s/g, "").length * 0.7);
  };
  const isAllCaps = (line: string) => /[A-Z]/.test(line) && line === line.toUpperCase();
  for (let index = 0; index < lines.length && names.length === 0; index += 1) {
    const line = lines[index];
    // The type line ("CHAMPION UNIT • YONE • IONIA") is all caps; names aren't.
    if (!isLetterHeavy(line) || isAllCaps(line)) continue;
    const name = line.replace(/[^\p{L}\p{N}' -]/gu, "").trim();
    if (name.length < 2) continue;
    const next = lines[index + 1];
    if (next && isLetterHeavy(next) && isAllCaps(next) && !TYPE_WORDS.test(next) && next.split(" ").length <= 4) {
      const title = next.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
      names.push(`${name} - ${title}`);
    }
    names.push(name);
  }

  return { codes: [...codes].slice(0, 3), names };
}

function nameSimilarity(candidate: string, card: RiftboundCard) {
  const wanted = normalizeName(candidate);
  const full = normalizeName(card.name);
  const base = normalizeName(card.name.split(" - ")[0]);
  return Math.max(similarityRatio(wanted, full), similarityRatio(wanted, base));
}

const defaultDependencies: RiftboundScanDependencies = {
  prepareImage: prepareRiftboundImage,
  recognizeText: recognizeTextWithMlKit,
  findCardsByCode: fetchRiftboundCardsByCode,
  searchCardsByName: async (name) =>
    (await searchRiftboundCardsCacheFirst({ query: name, pageSize: 20 })).cards,
};

/**
 * Identify a physical Riftbound card from a camera photo. Returns the best
 * matches for the user to confirm, or an empty array when nothing matched.
 */
export async function identifyRiftboundCardImage(
  imageUri: string,
  dependencyOverrides: Partial<RiftboundScanDependencies> = {},
): Promise<RiftboundCard[]> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const startedAt = Date.now();
  riftboundScanDebug.log("scan.started");

  const preparedUri = await dependencies.prepareImage(imageUri);
  const ocr = await dependencies.recognizeText(preparedUri);
  const identifiers = extractRiftboundIdentifiers(ocr);
  riftboundScanDebug.log("scan.ocr-complete", { rawText: ocr.text, ...identifiers });

  const matches = new Map<string, RiftboundCard>();
  const rankByName = (cards: RiftboundCard[]) =>
    identifiers.names.length === 0
      ? cards
      : [...cards].sort((a, b) =>
          Math.max(...identifiers.names.map((name) => nameSimilarity(name, b)))
          - Math.max(...identifiers.names.map((name) => nameSimilarity(name, a))));

  // 1. Footer code. Look up by set + number only, so a misread set total or
  //    a variant suffix still finds the printing; exact IDs rank first.
  for (const code of identifiers.codes) {
    const [set, number] = code.split("-");
    const cards = await dependencies.findCardsByCode(`${set}-${number}`);
    riftboundScanDebug.log("scan.code-attempt", { code, resultCount: cards.length });
    const exact = cards.filter((card) => card.riftbound_id.toLowerCase() === code);
    for (const card of [...exact, ...rankByName(cards)]) {
      if (matches.size >= MAX_MATCHES) break;
      matches.set(card.id, card);
    }
    if (matches.size > 0) break;
  }

  // 2. Name banner. Riftcodex's fuzzy search is loose, so keep only cards
  //    whose name is actually close to what was read.
  if (matches.size === 0) {
    for (const name of identifiers.names) {
      const cards = (await dependencies.searchCardsByName(name))
        .filter((card) => nameSimilarity(name, card) >= NAME_MATCH_THRESHOLD);
      riftboundScanDebug.log("scan.name-attempt", { name, resultCount: cards.length });
      for (const card of rankByName(cards)) {
        if (matches.size >= MAX_MATCHES) break;
        matches.set(card.id, card);
      }
      if (matches.size > 0) break;
    }
  }

  const cards = [...matches.values()];
  riftboundScanDebug.log("scan.completed", {
    matchCount: cards.length,
    durationMs: Date.now() - startedAt,
    matches: cards.map((card) => ({ id: card.id, riftboundId: card.riftbound_id, name: card.name })),
  });
  return cards;
}
