import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { parseStorePlans, revenuecatSyncUsers, verifiedMembershipSnapshot } from "../../../lib/revenuecatSync.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_HEADER");
  if (!secret || req.headers.get("authorization") !== secret) return new Response("Unauthorized", { status: 401 });
  const key = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  const appIds = (Deno.env.get("REVENUECAT_APP_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!key || !appIds.length) return new Response("Billing configuration missing", { status: 503 });
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > 64 * 1024) return new Response("Request too large", { status: 413 });
    const sandbox = Deno.env.get("REVENUECAT_ALLOW_SANDBOX") === "true";
    const users = revenuecatSyncUsers(JSON.parse(text), appIds, sandbox);
    const plans = parseStorePlans(Deno.env.get("REVENUECAT_PRODUCT_PLANS"));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    for (const userId of users) {
      // Deleted accounts must not be recreated by late provider notifications.
      const { data: user, error: userError } = await admin.auth.admin.getUserById(userId);
      if (userError?.status === 404 || !user?.user && !userError) continue;
      if (userError) throw new Error("Account lookup failed");
      const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (!response.ok) throw new Error("Billing provider unavailable");
      const snapshot = verifiedMembershipSnapshot(await response.json(), plans, sandbox);
      const { error } = await admin.rpc("apply_revenuecat_snapshot", { p_user_id: userId, p_state: snapshot });
      if (error) throw new Error("Billing synchronization failed");
    }
    return Response.json({ received: true });
  } catch {
    // Do not log subscriber attributes, user ids, receipts, or secrets.
    console.error("RevenueCat synchronization failed; delivery must be retried.");
    return new Response("Billing synchronization failed", { status: 503 });
  }
});
