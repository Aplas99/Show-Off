const mockState = { user: { id: "user-a" } };
const mockSdk = {
  configure: jest.fn(), logIn: jest.fn().mockResolvedValue({}),
  getOfferings: jest.fn(), getCustomerInfo: jest.fn(),
  purchasePackage: jest.fn(), restorePurchases: jest.fn(),
  showManageSubscriptions: jest.fn().mockResolvedValue(undefined),
};
jest.mock("react-native", () => ({ Platform: { OS: "ios", select: () => "public-test-key" } }));
jest.mock("@/hooks/useAuthStore", () => ({ useAuthStore: { getState: () => mockState } }));
jest.mock("react-native-purchases", () => ({ default: mockSdk }), { virtual: true });

const monthly = { identifier: "monthly", product: { identifier: "curator_monthly", priceString: "$5.99", subscriptionPeriod: "P1M" } };
const customer = (active: boolean) => ({ entitlements: { active: active ? { curator: {} } : {} } });

function loadBilling() {
  let billing!: typeof import("./nativeBilling");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    billing = require("./nativeBilling");
  });
  return billing;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.user = { id: "user-a" };
  mockSdk.getOfferings.mockResolvedValue({ current: { availablePackages: [monthly] } });
  mockSdk.getCustomerInfo.mockResolvedValue(customer(false));
  mockSdk.purchasePackage.mockResolvedValue({ customerInfo: customer(true) });
  mockSdk.restorePurchases.mockResolvedValue(customer(true));
});

it("only sells a currently offered product after showing its store price", async () => {
  const billing = loadBilling();
  await expect(billing.purchaseNativePlan("user-a", "curator_monthly")).rejects.toThrow("Refresh");
  expect(mockSdk.purchasePackage).not.toHaveBeenCalled();
  await expect(billing.getNativeProductPrices("user-a", ["curator_monthly"])).resolves.toEqual({ curator_monthly: { price: "$5.99", interval: "month" } });
  await expect(billing.purchaseNativePlan("user-a", "curator_monthly")).resolves.toEqual({ success: true, cancelled: false });
});

it("blocks changed prices and retired offers", async () => {
  const billing = loadBilling();
  await billing.getNativeProductPrices("user-a", ["curator_monthly"]);
  mockSdk.getOfferings.mockResolvedValue({ current: { availablePackages: [{ ...monthly, product: { ...monthly.product, priceString: "$7.99" } }] } });
  await expect(billing.purchaseNativePlan("user-a", "curator_monthly")).rejects.toThrow("changed");
  mockSdk.getOfferings.mockResolvedValue({ current: null });
  await expect(billing.purchaseNativePlan("user-a", "curator_monthly")).rejects.toThrow("unavailable");
  expect(mockSdk.purchasePackage).not.toHaveBeenCalled();
});

it("does not advertise products with unsupported subscription periods", async () => {
  mockSdk.getOfferings.mockResolvedValue({ current: { availablePackages: [{ ...monthly, product: { ...monthly.product, subscriptionPeriod: null } }] } });
  await expect(loadBilling().getNativeProductPrices("user-a", ["curator_monthly"])).resolves.toEqual({});
});

it("prevents another purchase when the store already has Curator", async () => {
  mockSdk.getCustomerInfo.mockResolvedValue(customer(true));
  await expect(loadBilling().purchaseNativePlan("user-a", "curator_monthly")).rejects.toThrow("already has Curator");
  expect(mockSdk.purchasePackage).not.toHaveBeenCalled();
});

it("treats purchase-sheet cancellation as cancellation", async () => {
  const billing = loadBilling();
  await billing.getNativeProductPrices("user-a", ["curator_monthly"]);
  mockSdk.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
  await expect(billing.purchaseNativePlan("user-a", "curator_monthly")).resolves.toEqual({ success: false, cancelled: true });
});

it("configures the signed-in account before restore and switches identity for the next user", async () => {
  const billing = loadBilling();
  await billing.restoreNativePurchases("user-a");
  expect(mockSdk.configure).toHaveBeenCalledWith({ apiKey: "public-test-key", appUserID: "user-a" });
  mockState.user.id = "user-b";
  await billing.restoreNativePurchases("user-b");
  expect(mockSdk.logIn).toHaveBeenCalledWith("user-b");
  await expect(billing.restoreNativePurchases("user-a")).rejects.toThrow("account changed");
  expect(mockSdk.restorePurchases).toHaveBeenCalledTimes(2);
});

it("serializes account changes behind a pending store operation", async () => {
  const billing = loadBilling();
  let finish!: (info: ReturnType<typeof customer>) => void;
  mockSdk.restorePurchases.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = billing.restoreNativePurchases("user-a");
  const rejected = expect(first).rejects.toThrow("account changed");
  await Promise.resolve();
  mockState.user.id = "user-b";
  const second = billing.restoreNativePurchases("user-b");
  expect(mockSdk.logIn).not.toHaveBeenCalled();
  finish(customer(true));
  await rejected;
  await expect(second).resolves.toBe(true);
  expect(mockSdk.logIn).toHaveBeenCalledWith("user-b");
});
