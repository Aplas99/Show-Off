import { catalogRequestSchema, type CatalogRequest } from "@/lib/catalogValidation";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { z } from "zod";

const errorSchema = z.object({ error: z.string().min(1).max(250) });

export class CatalogRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

/** Vendor requests cross this authenticated boundary before shared caching. */
export async function fetchCatalog(request: CatalogRequest): Promise<unknown> {
  const body = catalogRequestSchema.parse(request);
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
    throw new CatalogRequestError(status, message);
  }
  return data as unknown;
}
