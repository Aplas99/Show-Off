import { recognizeTextWithInstaScan } from "@/api/tcg/enhancedOcr";

import { cardScanDebug, cardScanError } from "./cardScanDebug";
import type { PokemonOcrResult } from "./recognition";

export async function recognizeTextWithEnhancedService(
  imageUri: string,
): Promise<PokemonOcrResult> {
  const startedAt = Date.now();
  const result = await recognizeTextWithInstaScan(imageUri);

  cardScanDebug("ocr.fallback-completed", {
    durationMs: Date.now() - startedAt,
    textLength: result.text.length,
  });
  return result;
}

export async function recognizeTextWithFallbackService(
  imageUri: string,
): Promise<PokemonOcrResult | null> {
  try {
    return await recognizeTextWithEnhancedService(imageUri);
  } catch (error) {
    cardScanError("ocr.fallback-failed", error);
    return null;
  }
}
