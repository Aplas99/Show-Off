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

  const { data, error } = await supabase
    .from("subscriptions_with_tier")
    .select(
      "id, user_id, status, price_id, cancel_at_period_end, current_period_end, created_at, updated_at, tier, provider",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const parsed = subscriptionRowSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function invokeStripeSession(body: {
  action: "checkout" | "portal";
  plan?: MembershipPlanId;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body,
  });

  if (error) throw new Error(error.message);
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("Stripe did not return a session URL.");
  return url;
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
export function useMembership() {
  return useQuery({
    queryKey: membershipKeys.current(),
    queryFn: async () => {
      const subscription = await fetchCurrentSubscription();
      const isPaidUser = isActiveMembershipStatus(subscription?.status);
      const isCurator = isPaidUser && subscription?.tier === "curator";
      return {
        subscription,
        tier: isPaidUser ? (subscription?.tier ?? "collector") : null,
        isPaidUser,
        isCollectorOrAbove: isPaidUser,
        isCurator,
      };
    },
    staleTime: 60 * 1000,
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
      return WebBrowser.openAuthSessionAsync(url, "showoff://membership");
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
      return WebBrowser.openAuthSessionAsync(url, "showoff://membership");
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
      if (getActiveBillingProvider() === "revenuecat") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Please sign in to subscribe.");

        await configureNativeBilling(user.id);
        const productId = PLAN_STORE_PRODUCT_IDS[plan];
        if (!productId) {
          throw new Error(`No store product configured for plan "${plan}".`);
        }
        return purchaseNativePlan(productId);
      }

      // Web / fallback: Stripe Checkout in the system browser. Payment success
      // is confirmed asynchronously by the Stripe webhook, so we don't claim
      // `success` here — the refetch below reflects the real state on return.
      const url = await invokeStripeSession({ action: "checkout", plan });
      await WebBrowser.openAuthSessionAsync(url, "showoff://membership");
      return { success: false, cancelled: false };
    },
    onSettled: () => {
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
      await WebBrowser.openAuthSessionAsync(url, "showoff://membership");
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
