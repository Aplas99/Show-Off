// RevenueCat webhook receiver. The IAP counterpart to stripe-webhook: mirrors
// App Store / Play subscription state into public.subscriptions (provider =
// 'revenuecat') so every membership gate works identically whether the user
// paid via native IAP or Stripe on the web.
//
// Deploy:  npx supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: npx supabase secrets set REVENUECAT_WEBHOOK_AUTH_HEADER=<random-secret>
//
// RevenueCat Dashboard -> Project -> Integrations -> Webhooks:
//   URL:            https://<project-ref>.functions.supabase.co/revenuecat-webhook
//   Authorization:  <the same REVENUECAT_WEBHOOK_AUTH_HEADER value>
// RevenueCat sends that value verbatim in the `Authorization` header on every
// delivery; we reject anything that doesn't match. (`--no-verify-jwt` is
// required so Supabase doesn't demand a Supabase JWT on the public endpoint —
// the shared secret is what authenticates RevenueCat.)
//
// Set the app's RevenueCat `app_user_id` to the Supabase auth user id
// (api/memberships/nativeBilling.ts calls configure/logIn with it) so
// `event.app_user_id` resolves straight to our `user_id`.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RevenueCat event shape (only the fields we consume).
interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  period_type?: string; // NORMAL | TRIAL | INTRO | PROMOTIONAL
  expiration_at_ms?: number | null;
  original_transaction_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string; // SANDBOX | PRODUCTION
}

/** Resolve our Supabase user id from the event's app_user_id / aliases. The
 *  app sets app_user_id to the Supabase uid, but fall back to any alias that
 *  looks like a uuid in case RevenueCat routes an anonymous/aliased id. */
function resolveUserId(event: RevenueCatEvent): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ];
  return candidates.find((c): c is string => !!c && UUID_RE.test(c)) ?? null;
}

interface DerivedState {
  status: string;
  cancelAtPeriodEnd: boolean;
}

/** Map a RevenueCat event to the Stripe-style status vocabulary already used
 *  in public.subscriptions ('active' | 'trialing' | 'past_due' | 'canceled' |
 *  'paused'), so has_active_membership() and the tier view need no changes. */
function getPlanId(productId?: string): string | null {
  const baseProductId = productId?.split(":")[0];
  if (baseProductId === "curator_founding_monthly") {
    return "founding_curator";
  }
  if (baseProductId === "curator_monthly") return "curator_monthly";
  if (baseProductId === "curator_annual") return "curator_annual";
  return null;
}

function deriveState(event: RevenueCatEvent): DerivedState {
  const now = Date.now();
  const exp = event.expiration_at_ms ?? null;
  const expired = typeof exp === "number" && exp <= now;
  const isTrial =
    event.period_type === "TRIAL" || event.period_type === "INTRO";
  const activeOrTrial = expired ? "canceled" : isTrial ? "trialing" : "active";

  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
      return { status: activeOrTrial, cancelAtPeriodEnd: false };
    case "NON_RENEWING_PURCHASE":
      // One-off / non-renewing entitlement: active until it expires, no renewal.
      return { status: activeOrTrial, cancelAtPeriodEnd: true };
    case "CANCELLATION":
      // Auto-renew turned off (or refund): still entitled until expiration.
      return { status: activeOrTrial, cancelAtPeriodEnd: true };
    case "BILLING_ISSUE":
      return { status: "past_due", cancelAtPeriodEnd: false };
    case "SUBSCRIPTION_PAUSED":
      return { status: "paused", cancelAtPeriodEnd: true };
    case "EXPIRATION":
      return { status: "canceled", cancelAtPeriodEnd: false };
    default:
      return { status: expired ? "canceled" : "active", cancelAtPeriodEnd: false };
  }
}

async function upsertFromEvent(event: RevenueCatEvent): Promise<void> {
  const userId = resolveUserId(event);
  if (!userId) {
    console.error(
      "[revenuecat-webhook] Could not resolve user for event",
      event.type,
      event.app_user_id,
    );
    return;
  }

  // original_transaction_id is stable across renewals -> idempotent upsert.
  const rowKey =
    event.original_transaction_id ??
    event.transaction_id ??
    `${userId}:${event.product_id ?? "unknown"}`;

  const { status, cancelAtPeriodEnd } = deriveState(event);
  const planId = getPlanId(event.product_id);

  console.log("[revenuecat-webhook] syncing subscription", {
    eventType: event.type,
    productId: event.product_id,
    planId,
    status,
  });

  const { error } = await admin.from("subscriptions").upsert({
    id: `rc_${rowKey}`,
    user_id: userId,
    status,
    // price_id holds the store product id here; seed membership_tiers with
    // these ids so subscriptions_with_tier resolves them to 'curator'.
    price_id: event.product_id ?? null,
    plan_id: planId,
    cancel_at_period_end: cancelAtPeriodEnd,
    current_period_end:
      typeof event.expiration_at_ms === "number"
        ? new Date(event.expiration_at_ms).toISOString()
        : null,
    provider: "revenuecat",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[revenuecat-webhook] Upsert failed", {
      eventType: event.type,
      productId: event.product_id,
      planId,
      error,
    });
    throw error;
  }

  console.log("[revenuecat-webhook] subscription synced", {
    eventType: event.type,
    productId: event.product_id,
    planId,
  });
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_HEADER");
  const provided = req.headers.get("authorization");

  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { event?: RevenueCatEvent };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = body.event;
  if (!event?.type) {
    return new Response("Missing event", { status: 400 });
  }

  try {
    switch (event.type) {
      // Test pings and account transfers carry no actionable subscription
      // state on their own; ack them so RevenueCat stops retrying. (After a
      // TRANSFER, RevenueCat re-emits the purchase state for the new user.)
      case "TEST":
      case "TRANSFER":
        break;
      default:
        await upsertFromEvent(event);
        break;
    }
  } catch (err) {
    console.error("[revenuecat-webhook] Handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
