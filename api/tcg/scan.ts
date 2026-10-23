import { cleanOcrText, deduplicateLines, normalizeName, similarityRatio } from "@/api/pokemon/ocrPostprocessing";
import type { TcgGameCode } from "@/constants/tcgGames";
import { createActionLogger } from "@/lib/actionDebug";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { searchTcgCardsCacheFirst, type TcgCard } from "./index";
import { recognizeTextWithMlKit } from "@/lib/mlKitOcr";

// Camera scanning for the shared-pipeline games (constants/tcgGames.ts).
// Card layouts differ by game (Yu-Gi-Oh! names sit on top, One Piece names
// at the bottom), so the whole card is OCR'd. The printed card code
// (OP01-003, LOB-EN005, WTR001, ...) names one printing, but TCG API only
// searches names: codes are looked up in the shared cache alone, and name
// searches (cache first, then TCG API) prefer cards carrying the code.

const tcgScanDebug = createActionLogger("TcgScan");

const CARD_ASPECT_RATIO = 63 / 88;
const OCR_IMAGE_WIDTH = 1400;
const MAX_MATCHES = 5;
/** Searches per scan, to bound TCG API use on a miss. */
const MAX_CODE_SEARCHES = 2;
const MAX_NAME_SEARCHES = 3;
/** Minimum similarity between an OCR'd line and a candidate card name. */
const NAME_MATCH_THRESHOLD = 0.72;

export interface TcgOcrText {
  text: string;
  blocks?: { lines?: { text: string }[] }[];
}

export interface TcgScanDependencies {
  prepareImage: (imageUri: string) => Promise<string>;
  recognizeText: (imageUri: string) => Promise<TcgOcrText>;
  /** `cacheOnly` reads the shared cache without falling back to TCG API. */
  searchCards: (game: TcgGameCode, query: string, options?: { cacheOnly?: boolean }) => Promise<TcgCard[]>;
}

export interface TcgScanIdentifiers {
  /** Printed card codes, best first, e.g. `OP01-003`. */
  codes: string[];
  /** Name guesses, in reading order. */
  names: string[];
}

// Printed collector codes per game. Each match is one search query.
const CODE_PATTERNS: Record<TcgGameCode, RegExp[]> = {
  // LOB-005, LOB-EN005, RA01-EN001
  ygo: [/\b([A-Z0-9]{2,5}-(?:[A-Z]{1,2})?\d{3})\b/g],
  // OP01-003, ST10-001, EB01-012, PRB01-001, P-025
  op: [/\b((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})\b/g],
  // 12/204 (set number follows elsewhere on the footer)
  lor: [/\b(\d{1,3}\s*\/\s*\d{2,3})\b/g],
  // WTR001, ARC123, MST045
  fab: [/\b([A-Z]{3}\d{3})\b/g],
  // BT1-001, EX2-034, ST1-01, P-001
  dgm: [/\b((?:BT|EX|ST|RB|LM|AD)\d{1,2}-\d{2,3}|P-\d{3})\b/g],
  // 012/252 (set code printed beside it)
  swu: [/\b(\d{3}\s*\/\s*\d{3})\b/g],
  // Fusion World: FB01-001, FS01-01, SB01-001, P-001
  dbs: [/\b((?:FB|FS|SB|EB)\d{2}-\d{2,3}|P-\d{3})\b/g],
  // Masters: BT1-001, SD1-01, EX01-01, TB1-001, DB1-001, P-001
  dbm: [/\b((?:BT|SD|EX|TB|DB|XD)\d{1,2}-\d{2,3}|P-\d{3})\b/g],
  // D-BT01/001, V-EB02/012, BT01/001
  cfv: [/\b((?:[A-Z]-)?[A-Z]{2,3}\d{2}\/\d{3}[A-Z]{0,3})\b/g],
  // Unknown layout; a number over a total is the safest guess.
  cpk: [/\b(\d{1,3}\s*\/\s*\d{2,3})\b/g],
};

/**
 * OCR reads O/0 and I/1 interchangeably in codes. An O or I that touches a
 * digit (or follows the code's hyphen/slash) is a digit; repeat so runs like
 * "-OO3" fix left to right.
 */
function repairCodeDigits(value: string) {
  let repaired = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = repaired
      .replace(/(?<=[-/\d])O|O(?=\d)/g, "0")
      .replace(/(?<=[-/\d])[Il|]|[Il|](?=\d)/g, "1");
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
}

/** Crop the full card inside the on-screen guide frame for OCR. */
async function prepareTcgImage(imageUri: string) {
  const original = await ImageManipulator.manipulate(imageUri).renderAsync();
  const { width: sourceWidth, height: sourceHeight } = original;

  let cardWidth = sourceWidth * 0.92;
  let cardHeight = cardWidth / CARD_ASPECT_RATIO;
  if (cardHeight > sourceHeight * 0.96) {
    cardHeight = sourceHeight * 0.96;
    cardWidth = cardHeight * CARD_ASPECT_RATIO;
  }
  const crop = {
    originX: Math.round(Math.max(0, (sourceWidth - cardWidth) / 2)),
    originY: Math.round(Math.max(0, (sourceHeight - cardHeight) / 2)),
    width: Math.round(cardWidth),
    height: Math.round(cardHeight),
  };
  tcgScanDebug.log("ocr.image-crop", { sourceWidth, sourceHeight, ...crop });

  const context = ImageManipulator.manipulate(imageUri);
  context.crop(crop).resize({ width: Math.min(OCR_IMAGE_WIDTH, crop.width), height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 1, format: SaveFormat.JPEG });
  return saved.uri;
}

function ocrLines(ocr: TcgOcrText) {
  const lines = ocr.blocks?.flatMap((block) => block.lines?.map((line) => line.text) ?? []);
  return deduplicateLines((lines?.length ? lines : ocr.text.split("\n")).map(cleanOcrText).filter(Boolean));
}

// Rules-text and frame words that are never a card name.
const NOT_A_NAME = /\b(when|until|your|opponent|each|turn|draw|attack|damage|ability|effect|cost|counter|trigger|character|illus|illustration|artist|©|konami|bandai|disney|wizards|ravensburger|fantasy flight|legend story|bushiroad|cd projekt)\b/i;

/** Pull printed card codes and name guesses out of whole-card OCR text. */
export function extractTcgIdentifiers(game: TcgGameCode, ocr: TcgOcrText): TcgScanIdentifiers {
  const lines = ocrLines(ocr);

  const codes = new Set<string>();
  for (const line of lines) {
    const upper = repairCodeDigits(line.toUpperCase());
    for (const pattern of CODE_PATTERNS[game]) {
      for (const match of upper.matchAll(pattern)) {
        const code = match[1].replace(/\s+/g, "");
        // A bare number/total with a zero numerator is a misread, not a card.
        if (/^0+\//.test(code)) continue;
        codes.add(code);
      }
    }
  }

  // Name lines: short, mostly letters, not rules text or credits. Reading
  // order keeps top-of-card names (most games) ahead of body text.
  const isNameLine = (line: string) => {
    const compact = line.replace(/\s/g, "");
    const letters = line.replace(/[^\p{L}]/gu, "");
    if (line.length < 3 || line.length > 40) return false;
    if (letters.length < Math.ceil(compact.length * 0.7)) return false;
    // A sentence ("...base power becomes 7000.") is rules text.
    if (/\s/.test(line) && line.endsWith(".")) return false;
    return !NOT_A_NAME.test(line) && line.split(" ").length <= 6;
  };
  const names: string[] = [];
  const addName = (line: string) => {
    const name = line.replace(/[^\p{L}\p{N}' ,.:!&-]/gu, "").trim();
    if (name.length >= 3 && !names.includes(name)) names.push(name);
  };
  lines.forEach((line, index) => {
    if (!isNameLine(line)) return;
    // A name wrapped over two lines ("Monkey.D." / "Luffy") is tried whole first.
    const next = lines[index + 1];
    if (/[.-]$/.test(line) && next && isNameLine(next)) addName(`${line} ${next}`);
    addName(line);
  });

  return { codes: [...codes].slice(0, MAX_CODE_SEARCHES), names: names.slice(0, MAX_NAME_SEARCHES) };
}

const compactCode = (value: string | null | undefined) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function nameSimilarity(candidate: string, card: TcgCard) {
  const wanted = normalizeName(candidate);
  // TCGplayer names can carry a printing suffix in parentheses.
  const full = normalizeName(card.name);
  const base = normalizeName(card.name.replace(/\s*\(.*\)\s*$/, ""));
  return Math.max(similarityRatio(wanted, full), similarityRatio(wanted, base));
}

const defaultDependencies: TcgScanDependencies = {
  prepareImage: prepareTcgImage,
  recognizeText: recognizeTextWithMlKit,
  searchCards: async (game, query, options) => (await searchTcgCardsCacheFirst({ game, query, ...options })).cards,
};

/**
 * Identify a physical card for one shared-pipeline game from a camera photo.
 * Returns the best matches for the user to confirm, or an empty array.
 */
export async function identifyTcgCardImage(
  game: TcgGameCode,
  imageUri: string,
  dependencyOverrides: Partial<TcgScanDependencies> = {},
): Promise<TcgCard[]> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const startedAt = Date.now();
  tcgScanDebug.log("scan.started", { game });

  const preparedUri = await dependencies.prepareImage(imageUri);
  const ocr = await dependencies.recognizeText(preparedUri);
  const identifiers = extractTcgIdentifiers(game, ocr);
  tcgScanDebug.log("scan.ocr-complete", { game, rawText: ocr.text, ...identifiers });

  const bestNameScore = (card: TcgCard) =>
    identifiers.names.length === 0 ? 0 : Math.max(...identifiers.names.map((name) => nameSimilarity(name, card)));
  const byName = (cards: TcgCard[]) => [...cards].sort((a, b) => bestNameScore(b) - bestNameScore(a));
  const matches = new Map<string, TcgCard>();

  const wantedCodes = identifiers.codes.map(compactCode);
  const carriesCode = (card: TcgCard) => {
    const number = compactCode(card.card_number);
    return number.length > 0
      && wantedCodes.some((wanted) => number === wanted || number.endsWith(wanted) || wanted.endsWith(number));
  };

  // 1. Printed code, in the shared cache only (TCG API can't search numbers).
  //    Keep cards whose number carries the code; if the numbering differs,
  //    accept results that also match a name.
  for (const code of identifiers.codes) {
    const cards = await dependencies.searchCards(game, code, { cacheOnly: true });
    const exact = cards.filter(carriesCode);
    const named = cards.filter((card) => bestNameScore(card) >= NAME_MATCH_THRESHOLD);
    tcgScanDebug.log("scan.code-attempt", { game, code, resultCount: cards.length, exactCount: exact.length });
    for (const card of [...byName(exact), ...byName(named)]) {
      if (matches.size >= MAX_MATCHES) break;
      matches.set(card.id, card);
    }
    if (matches.size > 0) break;
  }

  // 2. Name lines. Fuzzy search is loose, so keep cards carrying the printed
  //    code (the right printing, even from a partial name), then close names.
  if (matches.size === 0) {
    for (const name of identifiers.names) {
      const results = await dependencies.searchCards(game, name);
      const exact = results.filter(carriesCode);
      const named = results.filter((card) => !carriesCode(card) && nameSimilarity(name, card) >= NAME_MATCH_THRESHOLD);
      tcgScanDebug.log("scan.name-attempt", { game, name, resultCount: results.length, exactCount: exact.length });
      for (const card of [...byName(exact), ...byName(named)]) {
        if (matches.size >= MAX_MATCHES) break;
        matches.set(card.id, card);
      }
      if (matches.size > 0) break;
    }
  }

  const cards = [...matches.values()];
  tcgScanDebug.log("scan.completed", {
    game,
    matchCount: cards.length,
    durationMs: Date.now() - startedAt,
    matches: cards.map((card) => ({ id: card.id, number: card.card_number, name: card.name })),
  });
  return cards;
}
