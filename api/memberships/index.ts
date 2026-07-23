import { membershipDebug } from "@/lib/membershipDebug";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { z } from "zod";
import {
  configureNativeBilling,
  isNativeBillingAvailable,
  purchaseNativePlan,
  restoreNativePurchases,
  showNativeManageSubscriptions,
  type NativePurchaseResult,
} from "./nativeBilling";

const CHECKOUT_REDIRECT_URL = "showoff:///membership";
const MEMBERSHIP_REDIRECT_URL = "showoff:///profile/membership";

// --- Types & schemas ---

export type MembershipTier = "collector" | "curator";

export const subscriptionRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  status: z.string().min(1),
  price_id: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Both default rather than required: rows read before the tiers
  // migration/view is in place (or via the raw `subscriptions` table)
  // should still parse, falling back to the base paid tier.
  tier: z.enum(["collector", "curator"]).default("collector"),
  provider: z.string().default("stripe"),
  plan_id: z
    .enum(["founding_curator", "curator_monthly", "curator_annual"])
    .nullable()
    .default(null),
});

export type SubscriptionRow = z.infer<typeof subscriptionRowSchema>;

export type MembershipPlanId =
  | "founding_curator"
  | "curator_monthly"
  | "curator_annual";

export interface MembershipPlan {
  id: MembershipPlanId;
  tier: MembershipTier;
  name: string;
  /** Display-only. Real amounts live on the Stripe Price objects. */
  priceLabel: string;
  description: string;
}

/**
 * "Collector" is the free tier's display name — not a purchasable plan.
 * Every purchasable plan below is the Curator tier at a different price
 * point; there is no separate paid Collector tier anymore.
 */
export const FREE_TIER_NAME = "Collector";
export const FREE_TIER_LIMITS = {
  maxItems: 50,
  maxShowcases: 1,
} as const;

export const MEMBERSHIP_UPLOAD_LIMITS_BYTES = {
  free: 5 * 1024 * 1024,
  foundingCurator: 10 * 1024 * 1024,
  curator: 100 * 1024 * 1024,
} as const;

export function getMembershipUploadLimitBytes(access: {
  isPaidUser: boolean;
  tier?: MembershipTier | null;
  planId?: MembershipPlanId | null;
}): number {
  if (!access.isPaidUser) return MEMBERSHIP_UPLOAD_LIMITS_BYTES.free;
  if (access.planId === "founding_curator") {
    return MEMBERSHIP_UPLOAD_LIMITS_BYTES.foundingCurator;
  }
  if (access.tier === "curator") {
    return MEMBERSHIP_UPLOAD_LIMITS_BYTES.curator;
  }
  // Legacy paid rows without a mapped plan fail safely to the lower paid cap.
  return MEMBERSHIP_UPLOAD_LIMITS_BYTES.foundingCurator;
}

// Placeholder copy — keep in sync with the Stripe Prices configured via
// STRIPE_PRICE_ID_FOUNDING_CURATOR / STRIPE_PRICE_ID_CURATOR_MONTHLY /
// STRIPE_PRICE_ID_CURATOR_ANNUAL on the Edge Function. Founding Curator is
// a permanently-priced legacy rate for early subscribers — once retired,
// archive its Stripe Price (existing subscribers keep billing at it;
// new checkouts can no longer select it) rather than deleting it.
export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "founding_curator",
    tier: "curator",
    name: "Founding Curator",
    priceLabel: "$3.99 / month",
    description:
      "Full Curator access at a permanent founding-member rate for early subscribers.",
  },
  {
    id: "curator_monthly",
    tier: "curator",
    name: "Curator",
    priceLabel: "$5.99 / month",
    description:
      "Full premium membership: price history, sharable showcases, set-completion tracking, and faster card recognition.",
  },
  {
    id: "curator_annual",
    tier: "curator",
    name: "Annual Curator",
    priceLabel: "$59.99 / year",
    description: "Everything in Curator, at roughly two months free.",
  },
];

/** Stripe statuses that count as a paid membership. */
const ACTIVE_MEMBERSHIP_STATUSES = ["active", "trialing"] as const;

export function isActiveMembershipStatus(status: string | null | undefined) {
  return (
    !!status &&
    (ACTIVE_MEMBERSHIP_STATUSES as readonly string[]).includes(status)
  );
}

export const membershipKeys = {
  all: () => ["membership"] as const,
  current: () => ["membership", "current"] as const,
};

// --- Helpers ---

/**
 * Non-hook membership check for use inside plain async code
 * (e.g. upload size limits in api/storage). Fails closed to the free tier.
 */
export async function getHasActiveMembership(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status")
      .in("status", [...ACTIVE_MEMBERSHIP_STATUSES])
      .limit(1);

    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function fetchCurrentSubscription(): Promise<SubscriptionRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Select the whole own-row view for rolling-deploy compatibility: before
  // the plan_id migration reaches a backend, Zod safely defaults it to null.
  const { data, error } = await supabase
    .from("subscriptions_with_tier")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    membershipDebug.log("membership.no_subscription");
    return null;
  }

  const parsedRows = data
    .map((row) => subscriptionRowSchema.safeParse(row))
    .filter((result) => result.success)
    .map((result) => result.data);
  if (parsedRows.length === 0) {
    membershipDebug.log("membership.invalid_subscription_rows", {
      rowCount: data.length,
    });
    return null;
  }

  const subscription =
    parsedRows.find((row) => isActiveMembershipStatus(row.status)) ??
    parsedRows[0];
  membershipDebug.log("membership.subscription_resolved", {
    status: subscription.status,
    tier: subscription.tier,
    plan: subscription.plan_id,
    provider: subscription.provider,
  });
  return subscription;
}

async function getFunctionErrorDetails(error: unknown): Promise<{
  message: string;
  requestId?: string;
}> {
  const fallback =
    error instanceof Error ? error.message : "Membership service unavailable.";
  const context = (error as { context?: unknown } | null)?.context as
    | { clone?: () => { json?: () => Promise<unknown> } }
    | undefined;

  try {
    const payload = await context?.clone?.().json?.();
    const serverPayload = payload as {
      error?: unknown;
      requestId?: unknown;
    } | null;
    return {
      message:
        typeof serverPayload?.error === "string"
          ? serverPayload.error
          : fallback,
      requestId:
        typeof serverPayload?.requestId === "string"
          ? serverPayload.requestId
          : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

async function invokeStripeSession(body: {
  action: "checkout" | "portal";
  plan?: MembershipPlanId;
}): Promise<string> {
  membershipDebug.log("stripe.session.requested", body);
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body,
  });

  if (error) {
    const details = await getFunctionErrorDetails(error);
    membershipDebug.error("stripe.session.failed", error, {
      action: body.action,
      plan: body.plan,
      serverMessage: details.message,
      requestId: details.requestId,
    });
    throw new Error(
      details.requestId
        ? `${details.message} (reference: ${details.requestId})`
        : details.message,
    );
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) {
    const missingUrlError = new Error("Stripe did not return a session URL.");
    membershipDebug.error("stripe.session.missing_url", missingUrlError, body);
    throw missingUrlError;
  }
  membershipDebug.log("stripe.session.created", {
    action: body.action,
    plan: body.plan,
  });
  return url;
}

export async function syncMembershipFromBilling(): Promise<boolean> {
  membershipDebug.log("stripe.sync.requested");
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { action: "sync" },
  });
  if (error) {
    const details = await getFunctionErrorDetails(error);
    membershipDebug.error("stripe.sync.failed", error, {
      serverMessage: details.message,
      requestId: details.requestId,
    });
    throw new Error(
      details.requestId
        ? `${details.message} (reference: ${details.requestId})`
        : details.message,
    );
  }

  const result = data as {
    synced?: boolean;
    status?: string;
    plan?: string | null;
  } | null;
  membershipDebug.log("stripe.sync.completed", {
    synced: result?.synced ?? false,
    status: result?.status,
    plan: result?.plan,
  });
  return result?.synced ?? false;
}

// --- Hooks ---

/**
 * Current user's membership state.
 *
 * `isPaidUser` is kept as the flag pre-existing feature gates (upload
 * limits, the membership screen) already consume — it means "any active
 * paid tier," collector or curator. New Curator-only features should gate
 * on `isCurator` instead.
 */
export async function getCurrentMembershipAccess() {
  try {
    const subscription = await fetchCurrentSubscription();
    const isPaidUser = isActiveMembershipStatus(subscription?.status);
    const tier = isPaidUser ? (subscription?.tier ?? "collector") : null;
    const planId = isPaidUser ? (subscription?.plan_id ?? null) : null;
    return {
      subscription,
      tier,
      planId,
      isPaidUser,
      isCollectorOrAbove: isPaidUser,
      isCurator: isPaidUser && tier === "curator",
      isFoundingCurator: isPaidUser && planId === "founding_curator",
    };
  } catch (error) {
    membershipDebug.error("membership.fetch_failed", error);
    throw error;
  }
}

export function useMembership() {
  return useQuery({
    queryKey: membershipKeys.current(),
    queryFn: getCurrentMembershipAccess,
    staleTime: 60 * 1000,
  });
}

export function useSyncMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncMembershipFromBilling,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}

/**
 * Starts a Stripe Checkout session for the given plan and opens it in an
 * auth browser session. Resolves when the browser is dismissed.
 */
export function useStartCheckout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: MembershipPlanId) => {
      const url = await invokeStripeSession({ action: "checkout", plan });
      return WebBrowser.openAuthSessionAsync(url, CHECKOUT_REDIRECT_URL);
    },
    onSettled: () => {
      // The webhook updates the subscription row; refetch on return.
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}

/**
 * Opens the Stripe Billing Portal (update payment method, cancel, invoices).
 */
export function useOpenBillingPortal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const url = await invokeStripeSession({ action: "portal" });
      return WebBrowser.openAuthSessionAsync(url, MEMBERSHIP_REDIRECT_URL);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}

// --- Native IAP (App Store / Play) + provider routing ---
//
// Store policy requires in-app digital memberships to use native billing, not
// an in-app web checkout. `usePurchaseMembership` / `useManageMembership` route
// to RevenueCat IAP on store builds and Stripe-in-the-browser on web (and any
// build where native billing isn't configured). Both rails reconcile into the
// same `public.subscriptions` table via their respective webhooks, so the
// membership state (`useMembership`) is identical regardless of how the user
// paid. See `docs/iap-memberships.md`.

export type BillingProvider = "stripe" | "revenuecat";

/** App Store / Play product identifiers per plan. Must match the products
 *  created in App Store Connect and Google Play Console (and be seeded into
 *  `membership_tiers` so tier resolves to 'curator' — see the IAP migration).
 *  Overridable per environment; defaults are conventional ids. */
export const PLAN_STORE_PRODUCT_IDS: Record<MembershipPlanId, string> = {
  founding_curator:
    process.env.EXPO_PUBLIC_IAP_PRODUCT_FOUNDING_CURATOR ??
    "curator_founding_monthly",
  curator_monthly:
    process.env.EXPO_PUBLIC_IAP_PRODUCT_CURATOR_MONTHLY ?? "curator_monthly",
  curator_annual:
    process.env.EXPO_PUBLIC_IAP_PRODUCT_CURATOR_ANNUAL ?? "curator_annual",
};

/**
 * Which billing rail this build should use for a *new* purchase: native IAP
 * when it's available (store build with RevenueCat configured), otherwise
 * Stripe web checkout. Managing an *existing* subscription instead follows the
 * rail it was bought on — see `useManageMembership`.
 */
export function getActiveBillingProvider(): BillingProvider {
  return isNativeBillingAvailable() ? "revenuecat" : "stripe";
}

/**
 * Purchase a membership plan on the correct rail for this build. On store
 * builds this opens the native App Store / Play purchase sheet (compliant);
 * on web it opens Stripe Checkout in the system browser. The subscription row
 * is written by the provider's webhook, so callers should rely on the
 * `useMembership` refetch (invalidated here) for the authoritative state.
 */
export function usePurchaseMembership() {
  const qc = useQueryClient();

  return useMutation<NativePurchaseResult, Error, MembershipPlanId>({
    mutationFn: async (plan) => {
      const provider = getActiveBillingProvider();
      membershipDebug.log("purchase.started", { plan, provider });
      if (provider === "revenuecat") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Please sign in to subscribe.");

        await configureNativeBilling(user.id);
        const productId = PLAN_STORE_PRODUCT_IDS[plan];
        if (!productId) {
          throw new Error(`No store product configured for plan "${plan}".`);
        }
        const result = await purchaseNativePlan(productId);
        membershipDebug.log("purchase.native_completed", {
          plan,
          success: result.success,
          cancelled: result.cancelled,
        });
        return result;
      }

      // Web / fallback: Stripe Checkout in the system browser. Payment success
      // is confirmed asynchronously by the Stripe webhook, so we don't claim
      // `success` here — the refetch below reflects the real state on return.
      const url = await invokeStripeSession({ action: "checkout", plan });
      const browserResult = await WebBrowser.openAuthSessionAsync(
        url,
        CHECKOUT_REDIRECT_URL,
      );
      membershipDebug.log("purchase.stripe_browser_closed", {
        plan,
        resultType: browserResult.type,
      });

      if (browserResult.type === "success") {
        // Reconcile directly as a fallback in addition to the authoritative
        // webhook. This covers delayed or misconfigured webhook delivery.
        await syncMembershipFromBilling().catch((error) => {
          membershipDebug.error("purchase.post_checkout_sync_failed", error, {
            plan,
          });
        });

        // Stripe writes membership state asynchronously through its webhook.
        // Poll briefly so the UI usually reflects the upgrade immediately,
        // while still allowing Stripe's normal webhook retry behavior.
        for (let attempt = 1; attempt <= 6; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const subscription = await fetchCurrentSubscription().catch(
            (error) => {
              membershipDebug.error("purchase.confirmation_fetch_failed", error, {
                plan,
                attempt,
              });
              return null;
            },
          );
          if (isActiveMembershipStatus(subscription?.status)) {
            membershipDebug.log("purchase.stripe_confirmed", {
              plan,
              resolvedPlan: subscription?.plan_id,
              attempt,
            });
            return { success: true, cancelled: false };
          }
        }
        membershipDebug.log("purchase.stripe_webhook_pending", { plan });
      }

      return {
        success: false,
        cancelled:
          browserResult.type === "cancel" || browserResult.type === "dismiss",
      };
    },
    onError: (error, plan) => {
      membershipDebug.error("purchase.failed", error, { plan });
    },
    onSettled: (_data, _error, plan) => {
      membershipDebug.log("purchase.membership_refetch", { plan });
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}

/**
 * Manage an existing subscription. Routes by the rail the subscription was
 * bought on (`subscription.provider`) — an IAP subscription can only be
 * managed in the native store sheet, a Stripe one only in the billing portal.
 * Pass the current `subscription.provider`; falls back to this build's active
 * provider when unknown.
 */
export function useManageMembership() {
  const qc = useQueryClient();

  return useMutation<void, Error, string | null | undefined>({
    mutationFn: async (provider) => {
      const rail: BillingProvider =
        provider === "revenuecat" || provider === "stripe"
          ? provider
          : getActiveBillingProvider();

      if (rail === "revenuecat") {
        await showNativeManageSubscriptions();
        return;
      }
      const url = await invokeStripeSession({ action: "portal" });
      await WebBrowser.openAuthSessionAsync(url, MEMBERSHIP_REDIRECT_URL);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}

/**
 * Restore previous IAP purchases (App Store review requires a visible
 * "Restore purchases" action for apps selling subscriptions). No-op / false on
 * web. Returns whether an active Curator entitlement was found.
 */
export function useRestorePurchases() {
  const qc = useQueryClient();

  return useMutation<boolean, Error, void>({
    mutationFn: () => restoreNativePurchases(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}
