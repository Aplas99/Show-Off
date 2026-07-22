// Native in-app purchase (IAP) billing via RevenueCat.
//
// WHY THIS EXISTS
// ---------------
// Apple App Store and Google Play require digital memberships bought *inside*
// the app to go through their own billing (StoreKit / Play Billing), not an
// external Stripe checkout. Steering users to a web checkout is only allowed in
// specific storefronts/programs and is the fastest way to get an app removed.
// So on native store builds we sell through IAP; the browser/Stripe flow
// (`useStartCheckout`) is kept for the web target and out-of-app signups.
//
// RevenueCat wraps StoreKit/Play Billing and, crucially, sends renewal /
// cancellation webhooks to `supabase/functions/revenuecat-webhook`, which
// upserts the SAME `public.subscriptions` table the Stripe webhook writes to
// (with `provider = 'revenuecat'`). Every existing gate — `isPaidUser`,
// `has_active_membership()`, `subscriptions_with_tier` — therefore keeps
// working unchanged, whichever rail the user paid on.
//
// The native module (`react-native-purchases`) is loaded with `require()`
// inside functions — the same pattern the app already uses for
// `react-native-mmkv` — so the web bundle and Expo Go (where it isn't linked)
// never evaluate it. OCR-style rule: native billing only works in a dev/store
// build, never in Expo Go.

import { Platform } from "react-native";

/** RevenueCat entitlement identifier that unlocks the Curator tier. Must match
 *  the entitlement configured in the RevenueCat dashboard. */
export const CURATOR_ENTITLEMENT_ID = "curator";

/** Public SDK keys are safe to bundle (RevenueCat validates receipts server
 *  side). Set per platform; leaving them unset disables native billing so the
 *  app cleanly falls back / hides the purchase CTA. */
const REVENUECAT_API_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ?? undefined;

// --- Minimal structural types for the bits of the SDK we touch. Declared
// locally so this file type-checks whether or not `react-native-purchases`
// is installed yet (it's an optional native dependency). ---

interface NativeStoreProduct {
  identifier: string;
  priceString: string;
}
interface NativePackage {
  identifier: string;
  product: NativeStoreProduct;
}
interface NativeOffering {
  availablePackages: NativePackage[];
}
interface NativeCustomerInfo {
  entitlements: { active: Record<string, unknown> };
  activeSubscriptions: string[];
}
interface PurchasesModule {
  configure(opts: { apiKey: string; appUserID?: string | null }): void;
  logIn(
    appUserID: string,
  ): Promise<{ customerInfo: NativeCustomerInfo; created: boolean }>;
  getOfferings(): Promise<{
    current: NativeOffering | null;
    all: Record<string, NativeOffering>;
  }>;
  getProducts(productIds: string[]): Promise<NativeStoreProduct[]>;
  purchasePackage(
    pkg: NativePackage,
  ): Promise<{ customerInfo: NativeCustomerInfo }>;
  purchaseStoreProduct(
    product: NativeStoreProduct,
  ): Promise<{ customerInfo: NativeCustomerInfo }>;
  getCustomerInfo(): Promise<NativeCustomerInfo>;
  restorePurchases(): Promise<NativeCustomerInfo>;
  showManageSubscriptions(): Promise<void>;
}

/** Lazily require the native module. Returns null on web / Expo Go / when the
 *  package isn't installed, so callers can degrade gracefully. */
function loadPurchases(): PurchasesModule | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-purchases");
    return (mod?.default ?? mod) as PurchasesModule;
  } catch {
    return null;
  }
}

/** Whether native IAP is usable on this build: a store platform, the module is
 *  linked, and a RevenueCat key is configured. When false, the membership UI
 *  should not present a native purchase CTA. */
export function isNativeBillingAvailable(): boolean {
  return !!REVENUECAT_API_KEY && loadPurchases() !== null;
}

let configuredForUser: string | null = null;

/** Configure the SDK once and associate purchases with the Supabase user id
 *  (so the RevenueCat webhook can resolve `app_user_id` -> our `user_id`).
 *  Safe to call repeatedly; only reconfigures when the user changes. */
export async function configureNativeBilling(userId: string): Promise<boolean> {
  const Purchases = loadPurchases();
  if (!Purchases || !REVENUECAT_API_KEY) return false;
  if (configuredForUser === userId) return true;

  if (configuredForUser === null) {
    // `appUserID` set here means RevenueCat never mints an anonymous id for
    // this session — the very first purchase is already tied to our user.
    Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
  } else {
    await Purchases.logIn(userId);
  }
  configuredForUser = userId;
  return true;
}

export interface NativePurchaseResult {
  /** Entitlement is active on the returned customer info. */
  success: boolean;
  /** User dismissed the native purchase sheet — not an error to surface. */
  cancelled: boolean;
}

function isUserCancelled(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { userCancelled?: boolean }).userCancelled === true
  );
}

function hasCuratorEntitlement(info: NativeCustomerInfo): boolean {
  return !!info.entitlements.active[CURATOR_ENTITLEMENT_ID];
}

/**
 * Buy the given store product through IAP. `storeProductId` is the App Store /
 * Play product identifier for the chosen plan (see `PLAN_STORE_PRODUCT_IDS`).
 * Prefers a matching RevenueCat Offering package (so promotional/intro pricing
 * configured in the dashboard applies) and falls back to a direct product buy.
 */
export async function purchaseNativePlan(
  storeProductId: string,
): Promise<NativePurchaseResult> {
  const Purchases = loadPurchases();
  if (!Purchases) {
    throw new Error("In-app purchases aren't available on this device.");
  }

  try {
    const pkg = await findPackageForProduct(Purchases, storeProductId);
    const { customerInfo } = pkg
      ? await Purchases.purchasePackage(pkg)
      : await Purchases.purchaseStoreProduct(
          await resolveStoreProduct(Purchases, storeProductId),
        );
    return { success: hasCuratorEntitlement(customerInfo), cancelled: false };
  } catch (err) {
    if (isUserCancelled(err)) return { success: false, cancelled: true };
    throw err instanceof Error
      ? err
      : new Error("The purchase could not be completed.");
  }
}

async function findPackageForProduct(
  Purchases: PurchasesModule,
  storeProductId: string,
): Promise<NativePackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    const pools = [
      offerings.current,
      ...Object.values(offerings.all ?? {}),
    ].filter((o): o is NativeOffering => !!o);
    for (const offering of pools) {
      const match = offering.availablePackages.find(
        (p) => p.product.identifier === storeProductId,
      );
      if (match) return match;
    }
  } catch {
    // Offerings misconfigured — fall back to a direct product lookup.
  }
  return null;
}

async function resolveStoreProduct(
  Purchases: PurchasesModule,
  storeProductId: string,
): Promise<NativeStoreProduct> {
  const products = await Purchases.getProducts([storeProductId]);
  const product = products.find((p) => p.identifier === storeProductId);
  if (!product) {
    throw new Error(
      `Product "${storeProductId}" isn't available on the store yet.`,
    );
  }
  return product;
}

/** Restore prior purchases (required by App Store review; wire to a
 *  "Restore purchases" affordance). Returns whether Curator is now active. */
export async function restoreNativePurchases(): Promise<boolean> {
  const Purchases = loadPurchases();
  if (!Purchases) return false;
  const info = await Purchases.restorePurchases();
  return hasCuratorEntitlement(info);
}

/** Whether the current customer has an active Curator entitlement per the
 *  store (source of truth for gating on-device before the webhook lands). */
export async function nativeHasActiveCurator(): Promise<boolean> {
  const Purchases = loadPurchases();
  if (!Purchases) return false;
  try {
    return hasCuratorEntitlement(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

/** Open the native subscription-management sheet (App Store / Play), the IAP
 *  equivalent of the Stripe billing portal. Users cancel/change plans there. */
export async function showNativeManageSubscriptions(): Promise<void> {
  const Purchases = loadPurchases();
  if (!Purchases) {
    throw new Error("Subscription management isn't available on this device.");
  }
  await Purchases.showManageSubscriptions();
}

/** Localized store price strings keyed by store product id, for rendering the
 *  plan picker with real (currency-correct) prices instead of hardcoded copy.
 *  Returns an empty map when unavailable. */
export async function getNativeProductPrices(
  storeProductIds: string[],
): Promise<Record<string, string>> {
  const Purchases = loadPurchases();
  if (!Purchases || storeProductIds.length === 0) return {};
  try {
    const products = await Purchases.getProducts(storeProductIds);
    return Object.fromEntries(products.map((p) => [p.identifier, p.priceString]));
  } catch {
    return {};
  }
}
