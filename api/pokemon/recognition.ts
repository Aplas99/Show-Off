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
  ) => Promise<PokemonTcgCard[]>;
}

const CARD_ASPECT_RATIO = 63 / 88;
const OCR_IMAGE_WIDTH = 1600;
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeNumber(value: string) {
  return value
    .toUpperCase()
    .replace(/[O]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+(?=\d)/, "")
    .toLowerCase();
}

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

  const context = ImageManipulator.manipulate(imageUri);
  context
    .crop(crop)
    .resize({ width: Math.min(OCR_IMAGE_WIDTH, crop.width), height: null });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: 1,
    format: SaveFormat.JPEG,
  });
  cardScanDebug("ocr.image-ready", {
    width: result.width,
    height: result.height,
    previewUri: result.uri,
  });
  return result.uri;
}

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
    .replace(/\s+\d{2,3}$/, "")
    .replace(/[^a-z0-9.'’:\-\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePokemonCardText(
  result: PokemonOcrResult,
): PokemonCardIdentifiers {
  const lines = ocrLines(result).map((line) => line.trim()).filter(Boolean);
  const numberLine = lines.find((line) =>
    /[A-Z0-9]{1,4}\s*[\/[|]\s*[0-9OIL]{2,3}/i.test(line),
  );
  const numberMatch = numberLine?.match(
    /([A-Z0-9]{1,4})\s*[\/[|]\s*([0-9OIL]{2,3})/i,
  );
  const number = numberMatch ? normalizeNumber(numberMatch[1]) : null;
  const printedTotalText = numberMatch
    ? normalizeNumber(numberMatch[2]).replace(/[^0-9]/g, "")
    : "";
  const printedTotal = printedTotalText ? Number(printedTotalText) : null;

  const prefix = numberLine && numberMatch
    ? numberLine.slice(0, numberMatch.index ?? 0)
    : "";
  const setCodes = (prefix.match(/\b[A-Z]{2,5}\b/gi) ?? []).map((code) =>
    code.toUpperCase(),
  );
  const setCode =
    [...setCodes].reverse().find((code) => !["EN", "HP"].includes(code)) ?? null;

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
      all.findIndex((candidate) => normalize(candidate) === normalize(line)) === index,
    )
    .slice(0, 4);

  return {
    nameCandidates,
    number,
    printedTotal: Number.isFinite(printedTotal) ? printedTotal : null,
    setCode,
    rawText: result.text,
  };
}

function cardMatchesIdentifiers(
  card: PokemonTcgCard,
  name: string,
  identifiers: PokemonCardIdentifiers,
) {
  if (normalize(card.name) !== normalize(name)) return false;
  if (!identifiers.number || normalizeNumber(card.number) !== identifiers.number) {
    return false;
  }
  if (
    identifiers.printedTotal &&
    card.set.printedTotal !== identifiers.printedTotal
  ) {
    return false;
  }
  if (
    !identifiers.printedTotal &&
    identifiers.setCode &&
    card.set.ptcgoCode &&
    normalize(card.set.ptcgoCode) !== normalize(identifiers.setCode)
  ) {
    return false;
  }
  return true;
}

async function searchCardsByIdentifiers(identifiers: PokemonCardIdentifiers) {
  if (!identifiers.number) return [];

  for (const name of identifiers.nameCandidates) {
    const attempts = identifiers.setCode
      ? [identifiers.setCode, undefined]
      : [undefined];
    for (const setCode of attempts) {
      const result = await searchPokemonCardsCacheFirst({
        query: name,
        number: identifiers.number,
        printedTotal: identifiers.printedTotal ?? undefined,
        setCode,
        pageSize: 25,
      });
      const exact = result.cards.filter((card) =>
        cardMatchesIdentifiers(card, name, identifiers),
      );
      if (exact.length > 0) return exact;
    }
  }
  return [];
}

async function recognizeTextWithMlKit(imageUri: string) {
  try {
    const { recognizeText } = await import(
      "@infinitered/react-native-mlkit-text-recognition"
    );
    return await recognizeText(imageUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("RNMLKitTextRecognition")) {
      throw new Error(
        "Card OCR requires a development build; it is unavailable in Expo Go.",
      );
    }
    throw error;
  }
}

const defaultDependencies: PokemonRecognitionDependencies = {
  prepareImage: preparePokemonCardImage,
  recognizeText: recognizeTextWithMlKit,
  searchCards: searchCardsByIdentifiers,
};

export async function identifyPokemonCardImage(
  imageUri: string,
  dependencies: PokemonRecognitionDependencies = defaultDependencies,
  scanFrame?: PokemonCardScanFrame,
): Promise<RecognizedPokemonCard[]> {
  const startedAt = Date.now();
  cardScanDebug("ocr.started");
  try {
    const preparedUri = scanFrame
      ? await dependencies.prepareImage(imageUri, scanFrame)
      : await dependencies.prepareImage(imageUri);
    const ocr = await dependencies.recognizeText(preparedUri);
    const identifiers = parsePokemonCardText(ocr);
    cardScanDebug("ocr.identifiers", {
      nameCandidates: identifiers.nameCandidates,
      number: identifiers.number,
      printedTotal: identifiers.printedTotal,
      setCode: identifiers.setCode,
      rawText: identifiers.rawText,
    });

    if (identifiers.nameCandidates.length === 0 || !identifiers.number) {
      cardScanDebug("ocr.incomplete", {
        durationMs: Date.now() - startedAt,
      });
      return [];
    }

    const cards = await dependencies.searchCards(identifiers);
    const matches = cards.map((card) => ({ card, score: 1 }));
    cardScanDebug("ocr.completed", {
      durationMs: Date.now() - startedAt,
      matchCount: matches.length,
      matches: matches.map((match) => summarizePokemonCard(match.card)),
    });
    return matches;
  } catch (error) {
    cardScanError("ocr.failed", error);
    throw error;
  }
}
