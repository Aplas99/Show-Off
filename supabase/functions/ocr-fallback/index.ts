import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { createOcrFallbackHandler } from "../_shared/ocrFallback.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createOcrFallbackHandler({
  authenticate: async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  },
  isCurator: async (userId) => {
    const { data, error } = await admin.rpc("has_curator_membership", { uid: userId });
    if (error) throw error;
    return data === true;
  },
  getSecret: (name) => Deno.env.get(name),
  fetch: globalThis.fetch,
}));
