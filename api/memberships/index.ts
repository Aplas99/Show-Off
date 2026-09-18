import { membershipDebug } from "@/lib/membershipDebug";
import { supabase } from "@/lib/supabase";
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { useAuthStore } from "@/hooks/useAuthStore";
import { z } from "zod";
import {
  getNativeProductPrices,
  isNativeBillingAvailable,
  purchaseNativePlan,
  restoreNativePurchases,
  showNativeManageSubscriptions,
  type NativePurchaseResult,
} from "./nativeBilling";

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
  interval: "month" | "year";
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

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "founding_curator",
    tier: "curator",
    name: "Founding Curator",
    interval: "month",
    description:
      "Curator access with 10MB uploads per file.",
  },
  {
    id: "curator_monthly",
    tier: "curator",
    name: "Curator",
    interval: "month",
    description:
      "Full premium membership: price history, sharable showcases, set-completion tracking, and faster card recognition.",
  },
  {
    id: "curator_annual",
    tier: "curator",
    name: "Annual Curator",
    interval: "year",
    description: "Curator access billed annually with 100MB uploads per file.",
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

export function hasUnexpiredMembership(subscription: { status: string; current_period_end: string | null } | null | undefined, now = Date.now()): boolean {
  return !!subscription && isActiveMembershipStatus(subscription.status) &&
    !!subscription.current_period_end && Date.parse(subscription.current_period_end) > now;
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
      .select("id, status, current_period_end")
      .in("status", [...ACTIVE_MEMBERSHIP_STATUSES])
      .gt("current_period_end", new Date().toISOString())
      .limit(1);

    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function fetchCurrentSubscription(): Promise<SubscriptionRow | null> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return null;

  // Select the whole own-row view for rolling-deploy compatibility: before
  // the plan_id migration reaches a backend, Zod safely defaults it to null.
  const { data, error } = await supabase
    .from("subscriptions_with_tier")
    .select("*")
    .eq("user_id", userId)
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
    parsedRows.find((row) => hasUnexpiredMembership(row)) ??
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

export async function getCurrentMembershipAccess() {
  try {
    const subscription = await fetchCurrentSubscription();
    const isPaidUser = hasUnexpiredMembership(subscription);
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

export function membershipQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...membershipKeys.current(), userId],
    queryFn: getCurrentMembershipAccess,
    // The sign-in snapshot is shared by every screen. Actions that change or
    // require membership refresh it explicitly; navigation never polls it.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export async function refreshMembershipAccess(queryClient: QueryClient) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Sign in to use Curator features.");
  const access = await getCurrentMembershipAccess();
  if (useAuthStore.getState().user?.id !== userId) {
    throw new Error("Your session changed. Please try again.");
  }
  queryClient.setQueryData(membershipQueryOptions(userId).queryKey, access);
  return access;
}

export function useMembership() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    ...membershipQueryOptions(userId ?? ""),
    enabled: !!userId,
  });
}

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

export const PURCHASE_UNAVAILABLE_MESSAGE = Platform.OS === "web"
  ? "Purchases are available in the iOS or Android app. Web purchases are not available yet."
  : "Store purchases are unavailable in this build. Please try again in the latest store version.";

export function getActiveBillingProvider(): BillingProvider | null {
  return isNativeBillingAvailable() ? "revenuecat" : null;
}

async function requireBillingUser(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please sign in to manage purchases.");
  return user.id;
}

export function useMembershipPrices(enabled = true) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: [...membershipKeys.all(), "prices", userId],
    enabled: enabled && !!userId && isNativeBillingAvailable(),
    queryFn: async () => getNativeProductPrices(await requireBillingUser(), Object.values(PLAN_STORE_PRODUCT_IDS)),
    staleTime: 60_000,
  });
}

export function usePurchaseMembership() {
  const qc = useQueryClient();

  return useMutation<NativePurchaseResult, Error, MembershipPlanId>({
    mutationFn: async (plan) => {
      if (!isNativeBillingAvailable()) throw new Error(PURCHASE_UNAVAILABLE_MESSAGE);
      const userId = await requireBillingUser();
      const access = await getCurrentMembershipAccess();
      if (access.isPaidUser) throw new Error("You already have a membership. Use Manage membership to change it.");
      return purchaseNativePlan(userId, PLAN_STORE_PRODUCT_IDS[plan]);
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
      const rail =
        provider === "revenuecat" || provider === "stripe"
          ? provider
          : getActiveBillingProvider();

      if (rail === "revenuecat") {
        if (!isNativeBillingAvailable()) {
          throw new Error("Manage your subscription in the Apple App Store or Google Play account used to purchase it.");
        }
        await showNativeManageSubscriptions(await requireBillingUser());
        return;
      }
      if (rail !== "stripe") throw new Error(PURCHASE_UNAVAILABLE_MESSAGE);
      const url = await invokeStripeSession({ action: "portal" });
      if (Platform.OS === "web") await Linking.openURL(url);
      else await WebBrowser.openAuthSessionAsync(url, MEMBERSHIP_REDIRECT_URL);
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
    mutationFn: async () => restoreNativePurchases(await requireBillingUser()),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: membershipKeys.all() });
    },
  });
}
