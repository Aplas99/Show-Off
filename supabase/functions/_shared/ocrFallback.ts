const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

export interface OcrFallbackDependencies {
  authenticate: (token: string) => Promise<string | null>;
  isCurator: (userId: string) => Promise<boolean>;
  getSecret: (name: "OCR_SERVICE_URL" | "OCR_SERVICE_TOKEN") => string | undefined;
  fetch: typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createOcrFallbackHandler(deps: OcrFallbackDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: "Sign in to use enhanced scanning." }, 401);

    try {
      const userId = await deps.authenticate(token);
      if (!userId) return json({ error: "Sign in again to use enhanced scanning." }, 401);
      if (!await deps.isCurator(userId)) return json({ error: "Enhanced scanning requires Curator." }, 403);
    } catch {
      return json({ error: "Enhanced scanning is temporarily unavailable." }, 503);
    }

    const serviceUrl = deps.getSecret("OCR_SERVICE_URL");
    const serviceToken = deps.getSecret("OCR_SERVICE_TOKEN");
    let endpoint: URL;
    try {
      endpoint = new URL("ocr", `${serviceUrl?.replace(/\/+$/, "")}/`);
      if (endpoint.protocol !== "https:" || !serviceToken || endpoint.username || endpoint.password) {
        throw new Error("Invalid OCR service configuration");
      }
    } catch {
      return json({ error: "Enhanced scanning is not configured." }, 503);
    }

    if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      return json({ error: "Expected a card image." }, 400);
    }
    if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 1024) {
      return json({ error: "Card image is too large." }, 413);
    }
    let image: File;
    try {
      if (!req.body) throw new Error("Missing image");
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_IMAGE_BYTES + 1024) throw new Error("Image too large");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const bounded = new Request(req.url, {
        method: "POST",
        headers: { "Content-Type": req.headers.get("content-type")! },
        body: new Blob([bytes.buffer as ArrayBuffer]),
      });
      const parsed = await bounded.formData() as unknown as { get(name: string): FormDataEntryValue | null };
      const part = parsed.get("image");
      if (!(part instanceof File) || part.size === 0 || part.size > MAX_IMAGE_BYTES ||
          !["image/jpeg", "image/png"].includes(part.type)) throw new Error("Invalid image");
      image = part;
    } catch {
      return json({ error: "Invalid or oversized card image." }, 400);
    }

    const form = new FormData();
    form.append("image", image, "card.jpg");
    try {
      const response = await deps.fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceToken}` },
        body: form,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return json({ error: "Enhanced scanning is temporarily unavailable." }, 502);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("text" in result) ||
          typeof result.text !== "string" || result.text.length > 20_000) {
        throw new Error("Invalid OCR response");
      }
      return json({ text: result.text });
    } catch {
      return json({ error: "Enhanced scanning is temporarily unavailable." }, 502);
    }
  };
}
