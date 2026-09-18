import { createOcrFallbackHandler, type OcrFallbackDependencies } from "./ocrFallback";

const makeDeps = (): OcrFallbackDependencies => ({
  authenticate: jest.fn(async () => "user-1"),
  isCurator: jest.fn(async () => true),
  getSecret: (name) => name === "OCR_SERVICE_URL"
    ? "https://ocr.example.com"
    : "server-secret",
  fetch: jest.fn(async () => Response.json({ text: "Pikachu\n025/102" })),
});

function imageRequest(token = "session-token") {
  const form = new FormData();
  form.append("image", new Blob(["image"], { type: "image/jpeg" }), "card.jpg");
  return new Request("https://example.com/functions/v1/ocr-fallback", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

describe("OCR fallback proxy", () => {
  it("rejects non-Curators without sending the image upstream", async () => {
    const deps = makeDeps();
    deps.isCurator = jest.fn(async () => false);
    const response = await createOcrFallbackHandler(deps)(imageRequest());

    expect(response.status).toBe(403);
    expect(response.headers.get("x-ocr-request-id")).toMatch(/^[\da-f-]{36}$/);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("sends only a valid image with a server-side token", async () => {
    const deps = makeDeps();
    const response = await createOcrFallbackHandler(deps)(imageRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Pikachu\n025/102" });
    const requestId = response.headers.get("x-ocr-request-id");
    expect(deps.fetch).toHaveBeenCalledWith(
      new URL("https://ocr.example.com/ocr"),
      expect.objectContaining({
        headers: { Authorization: "Bearer server-secret", "x-ocr-request-id": requestId },
        redirect: "error",
      }),
    );
  });

  it("logs an upstream HTTP failure with its status and request ID", async () => {
    const deps = makeDeps();
    deps.fetch = jest.fn(async () => new Response("unavailable", { status: 503 }));
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    try {
      const response = await createOcrFallbackHandler(deps)(imageRequest());
      expect(response.status).toBe(502);
      expect(JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}")).toEqual(expect.objectContaining({
        requestId: response.headers.get("x-ocr-request-id"),
        stage: "upstream-http", status: 502, upstreamStatus: 503,
      }));
    } finally {
      log.mockRestore();
    }
  });

  it("fails closed when the service token is absent", async () => {
    const deps = makeDeps();
    deps.getSecret = (name) => name === "OCR_SERVICE_URL" ? "https://ocr.example.com" : undefined;
    const response = await createOcrFallbackHandler(deps)(imageRequest());

    expect(response.status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized image before forwarding it", async () => {
    const deps = makeDeps();
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], {
      type: "image/jpeg",
    }), "card.jpg");
    const request = new Request("https://example.com/functions/v1/ocr-fallback", {
      method: "POST",
      headers: { Authorization: "Bearer session-token" },
      body: form,
    });

    const response = await createOcrFallbackHandler(deps)(request);
    expect(response.status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});
