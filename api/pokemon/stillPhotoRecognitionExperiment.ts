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
  parsePokemonCardText,
  preparePokemonCardZones,
  scoreCardMatch,
  type PokemonCardIdentifiers,
  type PokemonOcrResult,
  type RecognizedPokemonCard,
} from "./recognition";
import { recognizeTextWithMlKit } from "@/lib/mlKitOcr";

/**
 * Experimental still-photo recognition pipeline.
 *
 * This intentionally stays out of the production scanner for now. The goal is
 * to test a less shaky UX:
 *
 * 1. User captures a single still image.
 * 2. We crop the frozen image into high-signal OCR zones.
 * 3. We OCR the name/footer/full-card zones independently.
 * 4. We merge identifiers and rank exact-ish Pokémon TCG candidates.
 *
 * If this produces cleaner identifiers than the current scanner path, the UI
 * can move toward "take photo → review → process" instead of asking users to
 * hold a moving camera steady during recognition.
 */

export interface StillPhotoRecognitionResult {
  identifiers: PokemonCardIdentifiers;
  matches: RecognizedPokemonCard[];
  ocr: {
    nameZoneText: string;
    footerZoneText: string;
    fullCardText: string;
  };
  shouldAskForRetake: boolean;
}

export interface StillPhotoRecognitionDependencies {
  recognizeText: (imageUri: string) => Promise<PokemonOcrResult>;
  searchCards: (
    identifiers: PokemonCardIdentifiers,
  ) => Promise<RecognizedPokemonCard[]>;
}

const STILL_PHOTO_MIN_ACCEPTABLE_SCORE = 0.78;
const STILL_PHOTO_MAX_CANDIDATES = 5;

function mergeOcrResults(
  nameZone: PokemonOcrResult,
  footerZone: PokemonOcrResult,
  fullCard: PokemonOcrResult,
): PokemonOcrResult {
  return {
    text: [
      nameZone.text,
      footerZone.text,
      fullCard.text,
    ]
      .filter(Boolean)
      .join("\n"),
    blocks: [
      ...(nameZone.blocks ?? []),
      ...(footerZone.blocks ?? []),
      ...(fullCard.blocks ?? []),
    ],
  };
}

async function searchStillPhotoCandidates(
  identifiers: PokemonCardIdentifiers,
): Promise<RecognizedPokemonCard[]> {
  if (identifiers.nameCandidates.length === 0) return [];

  const scored = new Map<string, RecognizedPokemonCard>();

  for (const name of identifiers.nameCandidates) {
    const setCodeAttempts = identifiers.setCode
      ? [identifiers.setCode, undefined]
      : [undefined];

    for (const setCode of setCodeAttempts) {
      const result = await searchPokemonCardsCacheFirst({
        query: name,
        number: identifiers.number ?? undefined,
        printedTotal: identifiers.printedTotal ?? undefined,
        setCode,
        pageSize: 25,
      });

      for (const card of result.cards) {
        const score = scoreCardMatch(card, name, identifiers);
        const existing = scored.get(card.id);
        if (score > 0 && (!existing || score > existing.score)) {
          scored.set(card.id, { card, score });
        }
      }
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, STILL_PHOTO_MAX_CANDIDATES);
}

const defaultDependencies: StillPhotoRecognitionDependencies = {
  recognizeText: recognizeTextWithMlKit,
  searchCards: searchStillPhotoCandidates,
};

export async function identifyPokemonCardStillPhoto(
  imageUri: string,
  dependencies: StillPhotoRecognitionDependencies = defaultDependencies,
): Promise<StillPhotoRecognitionResult> {
  const startedAt = Date.now();
  cardScanDebug("still-photo.started");

  try {
    const zones = await preparePokemonCardZones(imageUri);
    cardScanDebug("still-photo.zones-ready", zones);

    const [nameZoneOcr, footerZoneOcr, fullCardOcr] = await Promise.all([
      dependencies.recognizeText(zones.nameZoneUri),
      dependencies.recognizeText(zones.footerZoneUri),
      dependencies.recognizeText(zones.fullCardUri),
    ]);

    const mergedOcr = mergeOcrResults(nameZoneOcr, footerZoneOcr, fullCardOcr);
    const identifiers = parsePokemonCardText(mergedOcr);
    const matches = await dependencies.searchCards(identifiers);
    const topMatch = matches[0];
    const shouldAskForRetake =
      !topMatch ||
      topMatch.score < STILL_PHOTO_MIN_ACCEPTABLE_SCORE ||
      identifiers.nameCandidates.length === 0 ||
      !identifiers.number;

    cardScanDebug("still-photo.completed", {
      durationMs: Date.now() - startedAt,
      identifiers,
      shouldAskForRetake,
      matches: matches.map((match) => ({
        score: match.score,
        card: summarizePokemonCard(match.card),
      })),
    });

    return {
      identifiers,
      matches,
      ocr: {
        nameZoneText: nameZoneOcr.text,
        footerZoneText: footerZoneOcr.text,
        fullCardText: fullCardOcr.text,
      },
      shouldAskForRetake,
    };
  } catch (error) {
    cardScanError("still-photo.failed", error);
    throw error;
  }
}

export function summarizeStillPhotoMatch(card: PokemonTcgCard) {
  return summarizePokemonCard(card);
}
