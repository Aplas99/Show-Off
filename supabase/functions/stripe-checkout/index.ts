// Creates Stripe Checkout sessions (subscribe) and Billing Portal sessions
// (manage/cancel) for the authenticated user.
//
// Deploy:  npx supabase functions deploy stripe-checkout
// Secrets: npx supabase secrets set STRIPE_SECRET_KEY=sk_... \
//            STRIPE_PRICE_ID_FOUNDING_COLLECTOR=price_... \
//            STRIPE_PRICE_ID_CURATOR_MONTHLY=price_... \
//            STRIPE_PRICE_ID_CURATOR_ANNUAL=price_...
//
// After creating each Price in the Stripe Dashboard, also seed
// public.membership_tiers with its id -> tier mapping (see migration
// 20260714090000_add_membership_tiers.sql) so the app resolves the
// correct tier for subscribers on that price.
//
// Optional secrets:
//   MEMBERSHIP_SUCCESS_URL / MEMBERSHIP_CANCEL_URL / MEMBERSHIP_RETURN_URL
//   (default to the showoff:// deep-link scheme used by the app).

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLAN_PRICE_ENV_VARS: Record<string, string> = {
  founding_collector: "STRIPE_PRICE_ID_FOUNDING_COLLECTOR",
  curator_monthly: "STRIPE_PRICE_ID_CURATOR_MONTHLY",
  curator_annual: "STRIPE_PRICE_ID_CURATOR_ANNUAL",
};

const DEFAULT_SUCCESS_URL = "showoff://membership?checkout=success";
const DEFAULT_CANCEL_URL = "showoff://membership?checkout=cancelled";
const DEFAULT_RETURN_URL = "showoff://membership";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getOrCreateStripeCustomer(
  admin: ReturnType<typeof createClient>,
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
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action: "checkout" | "portal" =
      body?.action === "portal" ? "portal" : "checkout";

    const customerId = await getOrCreateStripeCustomer(admin, {
      id: user.id,
      email: user.email ?? undefined,
    });

    if (action === "portal") {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url:
          Deno.env.get("MEMBERSHIP_RETURN_URL") ?? DEFAULT_RETURN_URL,
      });
      return json({ url: session.url });
    }

    const plan =
      typeof body?.plan === "string" ? body.plan : "founding_collector";
    const priceEnvVar = PLAN_PRICE_ENV_VARS[plan];
    const priceId = priceEnvVar ? Deno.env.get(priceEnvVar) : undefined;

    if (!priceId) {
      return json(
        { error: `No Stripe price configured for plan "${plan}".` },
        400,
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        Deno.env.get("MEMBERSHIP_SUCCESS_URL") ?? DEFAULT_SUCCESS_URL,
      cancel_url: Deno.env.get("MEMBERSHIP_CANCEL_URL") ?? DEFAULT_CANCEL_URL,
      allow_promotion_codes: true,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("[stripe-checkout] error:", err);
    return json({ error: "Internal error creating Stripe session" }, 500);
  }
});
