import { supabase } from "@/lib/supabase";

export interface TcgOcrResult {
  text: string;
  blocks?: { lines?: { text: string }[] }[];
}

// Only a crop prepared by the game scanner is uploaded after an explicit tap.
export async function recognizeTextWithInstaScan(imageUri: string): Promise<TcgOcrResult> {
  const startedAt = Date.now();
  const form = new FormData();
  form.append("image", {
    uri: imageUri,
    name: "card.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const { data, error, response } = await supabase.functions.invoke("ocr-fallback", {
    body: form,
    timeout: 30_000,
  });
  if (error) {
    const httpResponse = response ?? (error.context instanceof Response ? error.context : undefined);
    let reason: string | undefined;
    if (httpResponse) {
      try {
        const body: unknown = await httpResponse.clone().json();
        if (body && typeof body === "object") {
          const payload = body as { error?: unknown; message?: unknown };
          const publicMessage = typeof payload.error === "string" ? payload.error : payload.message;
          if (typeof publicMessage === "string") reason = publicMessage.slice(0, 200);
        }
      } catch {
        // Gateway errors can return a non-JSON body.
      }
    }
    console.error("[CardScan] ocr.edge-failed", {
      status: httpResponse?.status ?? null,
      requestId: httpResponse?.headers.get("x-ocr-request-id") ?? null,
      reason: reason ?? null,
      errorType: error.name ?? "UnknownError",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  if (typeof data?.text !== "string") {
    throw new Error("InstaScan returned no card text. Check the OCR service configuration.");
  }
  return { text: data.text, blocks: data.blocks };
}
