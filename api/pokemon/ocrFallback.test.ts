import { supabase } from "@/lib/supabase";
import { getInstaScanFailureMessage } from "@/api/tcg/enhancedOcr";

import {
  recognizeTextWithEnhancedService,
  recognizeTextWithFallbackService,
} from "./ocrFallback";

jest.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const originalFormData = global.FormData;

beforeAll(() => {
  global.FormData = class {
    append() {}
  } as unknown as typeof FormData;
});

afterAll(() => {
  global.FormData = originalFormData;
});

beforeEach(() => {
  invoke.mockReset();
});

describe("enhanced card OCR", () => {
  it("explains a missing Edge Function without blaming Railway", () => {
    expect(getInstaScanFailureMessage({ context: { status: 404 } }))
      .toBe("InstaScan is not set up for this app environment yet.");
  });
  it("returns text from the direct service call", async () => {
    invoke.mockResolvedValue({ data: { text: "Pikachu 25/102" }, error: null });

    await expect(recognizeTextWithEnhancedService("file:///crop.jpg"))
      .resolves.toEqual({ text: "Pikachu 25/102", blocks: undefined });
    expect(invoke).toHaveBeenCalledWith(
      "ocr-fallback",
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("reports direct service failures while keeping optional fallback nonfatal", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Service unavailable") });

    await expect(recognizeTextWithEnhancedService("file:///crop.jpg"))
      .rejects.toThrow("Service unavailable");
    await expect(recognizeTextWithFallbackService("file:///crop.jpg"))
      .resolves.toBeNull();
  });

  it("logs the Edge Function status, public reason, and request ID", async () => {
    const response = Response.json({ error: "Enhanced scanning requires Curator." }, {
      status: 403,
      headers: { "x-ocr-request-id": "request-123" },
    });
    invoke.mockResolvedValue({ data: null, error: new Error("non-2xx"), response });
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(recognizeTextWithEnhancedService("file:///crop.jpg"))
        .rejects.toThrow("non-2xx");
      expect(log).toHaveBeenCalledWith("[CardScan] ocr.edge-failed", expect.objectContaining({
        status: 403,
        reason: "Enhanced scanning requires Curator.",
        requestId: "request-123",
      }));
    } finally {
      log.mockRestore();
    }
  });
});
