const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-ocr-request-id",
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
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const finish = (response: Response, stage: string, upstreamStatus?: number) => {
      response.headers.set("x-ocr-request-id", requestId);
      console.info(JSON.stringify({
        service: "ocr-fallback", requestId, stage, status: response.status,
        durationMs: Date.now() - startedAt,
        ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
      }));
      return response;
    };
    if (req.method === "OPTIONS") return finish(new Response(null, { status: 204, headers: corsHeaders }), "preflight");
    if (req.method !== "POST") return finish(json({ error: "Method not allowed." }, 405), "method");

    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return finish(json({ error: "Sign in to use enhanced scanning." }, 401), "missing-auth");

    try {
      const userId = await deps.authenticate(token);
      if (!userId) return finish(json({ error: "Sign in again to use enhanced scanning." }, 401), "invalid-auth");
      if (!await deps.isCurator(userId)) return finish(json({ error: "Enhanced scanning requires Curator." }, 403), "membership");
    } catch (error) {
      console.error(JSON.stringify({ service: "ocr-fallback", requestId, stage: "auth-error", errorType: error instanceof Error ? error.name : "UnknownError" }));
      return finish(json({ error: "Enhanced scanning is temporarily unavailable." }, 503), "auth-error");
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
      return finish(json({ error: "Enhanced scanning is not configured." }, 503), "configuration");
    }

    if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      return finish(json({ error: "Expected a card image." }, 400), "content-type");
    }
    if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 1024) {
      return finish(json({ error: "Card image is too large." }, 413), "content-length");
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
      return finish(json({ error: "Invalid or oversized card image." }, 400), "invalid-image");
    }

    const form = new FormData();
    form.append("image", image, "card.jpg");
    try {
      const response = await deps.fetch(endpoint, {
        method: "POST",
        // The ID is generated here, never copied from an untrusted client.
        headers: { Authorization: `Bearer ${serviceToken}`, "x-ocr-request-id": requestId },
        body: form,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return finish(json({ error: "Enhanced scanning is temporarily unavailable." }, 502), "upstream-http", response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("text" in result) ||
          typeof result.text !== "string" || result.text.length > 20_000) {
        throw new Error("Invalid OCR response");
      }
      return finish(json({ text: result.text }), "completed", response.status);
    } catch (error) {
      console.error(JSON.stringify({ service: "ocr-fallback", requestId, stage: "upstream-error", errorType: error instanceof Error ? error.name : "UnknownError" }));
      return finish(json({ error: "Enhanced scanning is temporarily unavailable." }, 502), "upstream-error");
    }
  };
}
