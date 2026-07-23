// Stripe webhook receiver. Mirrors subscription state into
// public.subscriptions so the app can gate membership features.
//
// Deploy:  npx supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: npx supabase secrets set STRIPE_SECRET_KEY=sk_... \
//            STRIPE_WEBHOOK_SECRET=whsec_...
//
// Stripe Dashboard → Developers → Webhooks → endpoint:
//   https://<project-ref>.functions.supabase.co/stripe-webhook
// Events: checkout.session.completed, customer.subscription.created,
//         customer.subscription.updated, customer.subscription.deleted

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});

// Deno has no Node crypto; Stripe needs the SubtleCrypto provider for
// async signature verification.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const MEMBERSHIP_PLANS = new Set([
  "founding_curator",
  "curator_monthly",
  "curator_annual",
]);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function getPeriodEndIso(subscription: Stripe.Subscription): string | null {
  // Newer Stripe API versions expose current_period_end on the items;
  // older ones on the subscription itself. Handle both.
  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
  const legacyPeriodEnd = (subscription as unknown as {
    current_period_end?: number;
  }).current_period_end;
  const periodEnd = itemPeriodEnd ?? legacyPeriodEnd;
  return typeof periodEnd === "number"
    ? new Date(periodEnd * 1000).toISOString()
    : null;
}

async function resolveUserId(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.supabase_user_id;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;

  const { data } = await admin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return (data?.user_id as string | undefined) ?? null;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error(
      "[stripe-webhook] Could not resolve user for subscription",
      subscription.id,
    );
    return;
  }

  const metadataPlan = subscription.metadata?.membership_plan;
  const planId =
    typeof metadataPlan === "string" && MEMBERSHIP_PLANS.has(metadataPlan)
      ? metadataPlan
      : null;

  console.log("[stripe-webhook] syncing subscription", {
    subscriptionId: subscription.id,
    status: subscription.status,
    planId,
  });

  const { error } = await admin.from("subscriptions").upsert({
    id: subscription.id,
    user_id: userId,
    status: subscription.status,
    price_id: subscription.items?.data?.[0]?.price?.id ?? null,
    plan_id: planId,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    current_period_end: getPeriodEndIso(subscription),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[stripe-webhook] Upsert failed", {
      subscriptionId: subscription.id,
      planId,
      error,
    });
    throw error;
  }

  console.log("[stripe-webhook] subscription synced", {
    subscriptionId: subscription.id,
    planId,
  });
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret", {
      status: 400,
    });
  }

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("[stripe-webhook] event received", {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId,
          );
          await upsertSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  console.log("[stripe-webhook] event processed", {
    eventId: event.id,
    eventType: event.type,
  });

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
