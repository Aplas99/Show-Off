import type { PokemonOcrResult } from "./recognition";

// Remote image processing is disabled for launch. Re-enabling it requires
// authenticated server access, retention rules and an explicit user disclosure.
// A shared bearer secret must never be placed in EXPO_PUBLIC_* configuration.
export function isOcrFallbackConfigured(): boolean { return false; }
export async function recognizeTextWithFallbackService(
  _imageUri: string,
): Promise<PokemonOcrResult | null> { return null; }
