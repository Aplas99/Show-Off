// Creates Stripe Checkout sessions (subscribe) and Billing Portal sessions
// (manage/cancel) for the authenticated user.
//
// Deploy:  npx supabase functions deploy stripe-checkout
// Secrets: npx supabase secrets set STRIPE_SECRET_KEY=sk_... \
//            STRIPE_PRICE_ID_FOUNDING_CURATOR=price_... \
//            STRIPE_PRICE_ID_CURATOR_MONTHLY=price_... \
//            STRIPE_PRICE_ID_CURATOR_ANNUAL=price_...
//
// "Collector" is the free tier's display name (50 items, 1 showcase) —
// there is no paid Collector plan. All three prices above are the
// Curator tier; Founding Curator is a permanent legacy rate for early
// subscribers, not a time-limited intro price. After creating each Price
// in the Stripe Dashboard, seed public.membership_tiers with its
// id -> 'curator' mapping (see migration 20260714090000_add_membership_tiers.sql)
// so the app resolves the correct tier for subscribers on that price.
// When Founding Curator is retired to new signups, archive its Stripe
// Price (existing subscribers keep billing at it) rather than deleting it.
//
// Optional secrets:
//   MEMBERSHIP_SUCCESS_URL / MEMBERSHIP_CANCEL_URL / MEMBERSHIP_RETURN_URL
//   (default to the showoff:// deep-link scheme used by the app).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.89.0";
import Stripe from "npm:stripe@18.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "stripe_disabled", {
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLAN_PRICE_ENV_VARS: Record<string, string> = {
  founding_curator: "STRIPE_PRICE_ID_FOUNDING_CURATOR",
  curator_monthly: "STRIPE_PRICE_ID_CURATOR_MONTHLY",
  curator_annual: "STRIPE_PRICE_ID_CURATOR_ANNUAL",
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function resolveMembershipPlan(subscription: Stripe.Subscription): string | null {
  const metadataPlan = subscription.metadata?.membership_plan;
  if (metadataPlan && PLAN_PRICE_ENV_VARS[metadataPlan]) return metadataPlan;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  return (
    Object.entries(PLAN_PRICE_ENV_VARS).find(
      ([, envName]) => Deno.env.get(envName) === priceId,
    )?.[0] ?? null
  );
}

function getPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
  const legacyPeriodEnd = (subscription as unknown as {
    current_period_end?: number;
  }).current_period_end;
  const periodEnd = itemPeriodEnd ?? legacyPeriodEnd;
  return typeof periodEnd === "number"
    ? new Date(periodEnd * 1000).toISOString()
    : null;
}

// Triple-slash custom-scheme URLs preserve the route as a path. Checkout
// returns through /membership for its success animation; the billing portal
// returns directly to the membership screen.
const DEFAULT_RETURN_URL = "showoff:///profile/membership";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getOrCreateStripeCustomer(
  admin: SupabaseClient,
  user: { id: string; email?: string },
): Promise<string> {
  const { data: existing } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id as string;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  });

  const { error } = await admin
    .from("billing_customers")
    .insert({ user_id: user.id, stripe_customer_id: customer.id });

  if (error) {
    // Unique-violation race: another request created the row first — reuse it.
    const { data: raced } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (raced?.stripe_customer_id) return raced.stripe_customer_id as string;
    throw error;
  }

  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[stripe-checkout] unauthorized", { requestId });
      return json({ error: "Unauthorized", requestId }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action: "checkout" | "portal" | "sync" =
      body?.action === "portal"
        ? "portal"
        : body?.action === "sync"
          ? "sync"
          : "checkout";
    if (action === "checkout") {
      return json({ error: "Web purchases are not available. Use the iOS or Android app.", requestId }, 403);
    }
    const requestedPlan =
      typeof body?.plan === "string" ? body.plan : undefined;

    console.log("[stripe-checkout] request", {
      requestId,
      action,
      plan: requestedPlan,
    });

    const customerId = await getOrCreateStripeCustomer(admin, {
      id: user.id,
      email: user.email ?? undefined,
    });

    if (action === "sync") {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      const subscription =
        subscriptions.data.find((candidate) =>
          ACTIVE_SUBSCRIPTION_STATUSES.has(candidate.status),
        ) ?? subscriptions.data[0];

      if (!subscription) {
        console.log("[stripe-checkout] no subscription to sync", { requestId });
        return json({ synced: false, requestId });
      }

      const planId = resolveMembershipPlan(subscription);
      const { error: syncError } = await admin.from("subscriptions").upsert({
        id: subscription.id,
        user_id: user.id,
        status: subscription.status,
        price_id: subscription.items?.data?.[0]?.price?.id ?? null,
        plan_id: planId,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        current_period_end: getPeriodEndIso(subscription),
        provider: "stripe",
        updated_at: new Date().toISOString(),
      });
      if (syncError) throw syncError;

      console.log("[stripe-checkout] subscription synced", {
        requestId,
        status: subscription.status,
        plan: planId,
      });
      return json({
        synced: true,
        status: subscription.status,
        plan: planId,
        requestId,
      });
    }

    if (action === "portal") {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url:
          Deno.env.get("MEMBERSHIP_RETURN_URL") ?? DEFAULT_RETURN_URL,
      });
      console.log("[stripe-checkout] portal session created", { requestId });
      return json({ url: session.url, requestId });
    }

    return json({ error: "Unsupported billing action", requestId }, 400);

  } catch (err) {
    console.error("[stripe-checkout] error", { requestId, error: err });
    return json(
      { error: "Internal error creating Stripe session", requestId },
      500,
    );
  }
});
