import { cardScanDebug, cardScanError } from "./cardScanDebug";
import type { PokemonOcrResult } from "./recognition";

/**
 * Client for the server-side PaddleOCR fallback (server/paddleocr).
 *
 * Called only when the on-device ML Kit pass produces no catalog matches.
 * Configure with:
 *   EXPO_PUBLIC_OCR_FALLBACK_URL   e.g. http://192.168.1.20:8787
 *   EXPO_PUBLIC_OCR_FALLBACK_TOKEN optional bearer token (OCR_SERVICE_TOKEN)
 *
 * Unset URL disables the fallback entirely.
 */

const FALLBACK_URL = process.env.EXPO_PUBLIC_OCR_FALLBACK_URL || "";
const FALLBACK_TOKEN = process.env.EXPO_PUBLIC_OCR_FALLBACK_TOKEN || "";

// Generous: a CPU-only dev machine takes ~15-20s per image. A production
// Linux container with MKL-DNN typically answers in 1-3s.
const FALLBACK_TIMEOUT_MS = 30_000;

export function isOcrFallbackConfigured() {
  return FALLBACK_URL.length > 0;
}

/**
 * Upload the prepared (cropped + downscaled) card image and return its OCR
 * text, or null when the service is unconfigured, unreachable, or errors —
 * the scan flow must never break because the fallback did.
 */
export async function recognizeTextWithFallbackService(
  imageUri: string,
): Promise<PokemonOcrResult | null> {
  if (!isOcrFallbackConfigured()) return null;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("image", {
      uri: imageUri,
      name: "card.jpg",
      type: "image/jpeg",
    } as unknown as Blob);

    const response = await fetch(`${FALLBACK_URL.replace(/\/+$/, "")}/ocr`, {
      method: "POST",
      body: form,
      headers: FALLBACK_TOKEN
        ? { Authorization: `Bearer ${FALLBACK_TOKEN}` }
        : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OCR fallback responded ${response.status}`);
    }

    const data = await response.json();
    if (typeof data?.text !== "string") return null;

    cardScanDebug("ocr.fallback-completed", {
      durationMs: Date.now() - startedAt,
      serverDurationMs: data.durationMs ?? null,
      textLength: data.text.length,
    });
    return { text: data.text, blocks: data.blocks };
  } catch (error) {
    cardScanError("ocr.fallback-failed", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
