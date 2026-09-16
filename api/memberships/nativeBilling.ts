// Native purchases are the only new-purchase channel for this release.
import { Platform } from "react-native";
import { useAuthStore } from "@/hooks/useAuthStore";

export const CURATOR_ENTITLEMENT_ID = "curator";
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

interface StoreProduct {
  identifier: string;
  priceString: string;
  subscriptionPeriod: string | null;
}
interface StorePackage { identifier: string; product: StoreProduct }
interface CustomerInfo { entitlements: { active: Record<string, unknown> } }
interface PurchasesModule {
  configure(options: { apiKey: string; appUserID: string }): void;
  logIn(userId: string): Promise<unknown>;
  getOfferings(): Promise<{ current: { availablePackages: StorePackage[] } | null }>;
  purchasePackage(pkg: StorePackage): Promise<{ customerInfo: CustomerInfo }>;
  getCustomerInfo(): Promise<CustomerInfo>;
  restorePurchases(): Promise<CustomerInfo>;
  showManageSubscriptions(): Promise<void>;
}

function loadPurchases(): PurchasesModule | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("react-native-purchases");
    return module.default ?? module;
  } catch {
    return null;
  }
}

export function isNativeBillingAvailable(): boolean {
  return !!API_KEY && !!loadPurchases();
}

let configuredUser: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
// Serialize identity changes with store operations so two mounted paywalls or
// an account switch cannot attribute a purchase/restore to the previous user.
function withBillingUser<T>(userId: string, action: (sdk: PurchasesModule) => Promise<T>): Promise<T> {
  const operation = queue.then(async () => {
    const sdk = loadPurchases();
    if (!sdk || !API_KEY) throw new Error("Store purchases are unavailable in this build.");
    const checkUser = () => {
      if (useAuthStore.getState().user?.id !== userId) {
        throw new Error("Your account changed. Reopen Membership to continue.");
      }
    };
    checkUser();
    if (configuredUser === null) sdk.configure({ apiKey: API_KEY, appUserID: userId });
    else if (configuredUser !== userId) await sdk.logIn(userId);
    configuredUser = userId;
    checkUser();
    const result = await action(sdk);
    checkUser();
    return result;
  });
  queue = operation.catch(() => undefined);
  return operation;
}

export interface StorePrice { price: string; interval: "month" | "year" }
const displayedPrices = new Map<string, StorePrice>();
function readPrice(product: StoreProduct): StorePrice | null {
  const interval = product.subscriptionPeriod === "P1M" ? "month"
    : product.subscriptionPeriod === "P1Y" ? "year" : null;
  return interval && product.priceString ? { price: product.priceString, interval } : null;
}

export async function getNativeProductPrices(userId: string, ids: string[]): Promise<Record<string, StorePrice>> {
  return withBillingUser(userId, async (sdk) => {
    const offering = (await sdk.getOfferings()).current;
    const prices: Record<string, StorePrice> = {};
    for (const id of ids) displayedPrices.delete(`${userId}:${id}`);
    for (const pkg of offering?.availablePackages ?? []) {
      const price = readPrice(pkg.product);
      if (ids.includes(pkg.product.identifier) && price) {
        prices[pkg.product.identifier] = price;
        displayedPrices.set(`${userId}:${pkg.product.identifier}`, price);
      }
    }
    return prices;
  });
}

export interface NativePurchaseResult { success: boolean; cancelled: boolean }
export async function purchaseNativePlan(userId: string, productId: string): Promise<NativePurchaseResult> {
  return withBillingUser(userId, async (sdk) => {
    if ((await sdk.getCustomerInfo()).entitlements.active[CURATOR_ENTITLEMENT_ID]) {
      throw new Error("This store account already has Curator. Restore purchases or manage your existing subscription.");
    }
    // Only the current offering is sellable. Retired founding plans must not be
    // recovered from old offerings or a direct product lookup.
    const pkg = (await sdk.getOfferings()).current?.availablePackages.find((entry) => entry.product.identifier === productId);
    const current = pkg && readPrice(pkg.product);
    const shown = displayedPrices.get(`${userId}:${productId}`);
    if (!pkg || !current || !shown || current.price !== shown.price || current.interval !== shown.interval) {
      throw new Error("This offer changed or is unavailable. Refresh store prices before purchasing.");
    }
    if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen Membership to continue.");
    try {
      const { customerInfo } = await sdk.purchasePackage(pkg);
      return { success: !!customerInfo.entitlements.active[CURATOR_ENTITLEMENT_ID], cancelled: false };
    } catch (error) {
      if (typeof error === "object" && error !== null && "userCancelled" in error && error.userCancelled === true) {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  });
}

export async function restoreNativePurchases(userId: string): Promise<boolean> {
  return withBillingUser(userId, async (sdk) => !!(await sdk.restorePurchases()).entitlements.active[CURATOR_ENTITLEMENT_ID]);
}

export async function showNativeManageSubscriptions(userId: string): Promise<void> {
  return withBillingUser(userId, (sdk) => sdk.showManageSubscriptions());
}
