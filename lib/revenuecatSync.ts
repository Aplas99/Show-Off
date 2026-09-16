import { z } from "zod";

const planSchema = z.enum(["founding_curator", "curator_monthly", "curator_annual"]);
export type BillingPlan = z.infer<typeof planSchema>;
export const defaultStorePlans: Record<string, BillingPlan> = {
  curator_founding_monthly: "founding_curator",
  curator_monthly: "curator_monthly",
  curator_annual: "curator_annual",
};
export function parseStorePlans(value?: string): Record<string, BillingPlan> {
  return value ? z.record(z.string().min(1), planSchema).parse(JSON.parse(value)) : defaultStorePlans;
}

const webhookSchema = z.object({ event: z.object({
  type: z.string().min(1),
  app_id: z.string().optional(),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).optional(),
  app_user_id: z.string().optional(),
  transferred_from: z.array(z.string()).max(20).optional(),
  transferred_to: z.array(z.string()).max(20).optional(),
}) });
const lifecycleEvents = new Set([
  "INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", "UNCANCELLATION",
  "EXPIRATION", "BILLING_ISSUE", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED",
  "SUBSCRIPTION_PAUSED", "REFUND_REVERSED", "TRANSFER",
]);

export function revenuecatSyncUsers(body: unknown, appIds: string[], allowSandbox: boolean): string[] {
  const { event } = webhookSchema.parse(body);
  if (event.type === "TEST") return [];
  if (!lifecycleEvents.has(event.type)) return [];
  // Transfers do not contain app_id/environment. Their resulting snapshots
  // still have to pass store, product, entitlement and environment validation.
  if (event.type !== "TRANSFER") {
    if (!event.app_id || !appIds.includes(event.app_id)) throw new Error("Unexpected billing app");
    if (!event.environment) throw new Error("Missing billing environment");
    if (event.environment === "SANDBOX" && !allowSandbox) return [];
  }
  const candidates = event.type === "TRANSFER"
    ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
    : [event.app_user_id];
  // Never choose an arbitrary alias: it might be another signed-in account.
  return [...new Set(candidates.filter((id): id is string => z.uuid().safeParse(id).success))];
}

const date = z.string().datetime({ offset: true }).nullable().optional();
const subscriberSchema = z.object({
  request_date_ms: z.number().int().positive(),
  subscriber: z.object({
    entitlements: z.record(z.string(), z.object({
      product_identifier: z.string(), expires_date: date, grace_period_expires_date: date,
    })),
    subscriptions: z.record(z.string(), z.object({
      expires_date: date, grace_period_expires_date: date,
      store: z.string(), is_sandbox: z.boolean(),
      unsubscribe_detected_at: date, refunded_at: date, period_type: z.string().optional(),
    })),
  }),
});

export interface VerifiedMembership {
  observed_at_ms: number;
  status: "active" | "trialing" | "canceled";
  price_id: string | null;
  plan_id: BillingPlan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

// A webhook is a signal to fetch current state, never an entitlement grant.
export function verifiedMembershipSnapshot(body: unknown, plans: Record<string, BillingPlan>, allowSandbox: boolean, now = Date.now()): VerifiedMembership {
  const response = subscriberSchema.parse(body);
  if (response.request_date_ms > now + 60_000 || response.request_date_ms < now - 5 * 60_000) {
    throw new Error("Stale billing response");
  }
  const inactive: VerifiedMembership = {
    observed_at_ms: response.request_date_ms, status: "canceled", price_id: null,
    plan_id: null, current_period_end: null, cancel_at_period_end: false,
  };
  const entitlement = response.subscriber.entitlements.curator;
  if (!entitlement) return inactive;
  const product = entitlement.product_identifier;
  const subscription = response.subscriber.subscriptions[product];
  const plan = plans[product];
  if (!subscription || !plan || !["app_store", "play_store"].includes(subscription.store) ||
      (subscription.is_sandbox && !allowSandbox) || subscription.refunded_at) return inactive;
  const end = Math.max(Date.parse(entitlement.expires_date ?? ""), Date.parse(entitlement.grace_period_expires_date ?? entitlement.expires_date ?? ""));
  const storeEnd = Math.max(Date.parse(subscription.expires_date ?? ""), Date.parse(subscription.grace_period_expires_date ?? subscription.expires_date ?? ""));
  const verifiedEnd = Math.min(end, storeEnd);
  // These are recurring plans: a missing/non-expiring record cannot grant them.
  if (!Number.isFinite(verifiedEnd) || verifiedEnd <= now) return inactive;
  return {
    observed_at_ms: response.request_date_ms,
    status: subscription.period_type === "trial" ? "trialing" : "active",
    price_id: product, plan_id: plan, current_period_end: new Date(verifiedEnd).toISOString(),
    cancel_at_period_end: !!subscription.unsubscribe_detected_at,
  };
}
