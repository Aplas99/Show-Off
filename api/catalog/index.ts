import { createActionLogger } from "@/lib/actionDebug";
import { catalogRequestSchema, type CatalogRequest } from "@/lib/catalogValidation";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { z } from "zod";

const errorSchema = z.object({ error: z.string().min(1).max(250) });

const catalogDebug = createActionLogger("Catalog");

export class CatalogRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

/** What a request asked for, for logs: the provider plus its query, path, code or card. */
function describeRequest(request: CatalogRequest): Record<string, unknown> {
  const { provider, ...rest } = request as Record<string, unknown>;
  const pick = ["game", "query", "path", "code", "setId", "cardId", "page"]
    .filter((key) => rest[key] !== undefined)
    .map((key) => [key, rest[key]]);
  return { provider, ...Object.fromEntries(pick) };
}

/** Vendor requests cross this authenticated boundary before shared caching. */
export async function fetchCatalog(request: CatalogRequest): Promise<unknown> {
  const body = catalogRequestSchema.parse(request);
  const details = describeRequest(request);
  const startedAt = Date.now();
  catalogDebug.log("request.started", details);
  const { data, error } = await supabase.functions.invoke("catalog-proxy", { body });
  if (error) {
    let message = "Could not search the catalog. Please try again.";
    let status = 503;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try {
        const parsed = errorSchema.safeParse(await error.context.json());
        if (parsed.success) message = parsed.data.error;
      } catch {
        // Gateway errors may not contain the function's JSON response.
      }
    }
    // The function's own logs (catalog-proxy in the Supabase dashboard) have
    // the upstream cause; this records which request failed and how.
    catalogDebug.error("request.failed", {
      ...details,
      status,
      message,
      errorType: error.name,
      durationMs: Date.now() - startedAt,
    });
    throw new CatalogRequestError(status, message);
  }
  catalogDebug.log("request.completed", { ...details, durationMs: Date.now() - startedAt });
  return data as unknown;
}
