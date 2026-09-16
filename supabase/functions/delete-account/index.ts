import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { deleteAccountData } from "../../../lib/accountDeletion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return json({ error: "Unauthorized" }, 401);

    await deleteAccountData(user.id, {
      async beginDeletion(userId) {
        const { error } = await admin.from("account_deletion_requests").upsert(
          { user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      },
      async listFiles(bucket, prefix, offset, limit) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, {
          offset, limit, sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        if (!data) throw new Error("Storage listing unavailable");
        return data;
      },
      async removeFiles(bucket, paths) {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (error) throw error;
      },
      async deleteAuthUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
    });
    return json({ deleted: true });
  } catch {
    console.error("[delete-account] Cleanup incomplete; account retained for retry.");
    return json({ error: "Deletion could not finish. Retry from Settings or contact support. Some data may already have been removed." }, 503);
  }
});
