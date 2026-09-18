import {
  MEMBERSHIP_UPLOAD_LIMITS_BYTES,
  PLAN_STORE_PRODUCT_IDS,
  getActiveBillingProvider,
  getMembershipUploadLimitBytes,
  hasUnexpiredMembership,
  isActiveMembershipStatus,
  membershipQueryOptions,
  subscriptionRowSchema,
} from "@/api/memberships";

// expo-web-browser and expo-secure-store (via @/lib/supabase) ship
// untranspiled ESM that ts-jest can't parse. react-native is likewise flow/ESM
// (pulled in transitively via api/memberships/nativeBilling.ts); the node test
// env only needs Platform, which resolves native billing to "unavailable" here.
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));
jest.mock("react-native", () => ({
  Platform: { OS: "web", select: () => undefined },
}));

describe("isActiveMembershipStatus", () => {
  it("requires a future expiration as well as an active status", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    expect(hasUnexpiredMembership({ status: "active", current_period_end: "2026-10-15T12:00:00Z" }, now)).toBe(true);
    for (const end of [null, "invalid", "2026-09-15T12:00:00Z", "2026-08-15T12:00:00Z"]) {
      expect(hasUnexpiredMembership({ status: "active", current_period_end: end }, now)).toBe(false);
    }
    expect(hasUnexpiredMembership({ status: "canceled", current_period_end: "2026-10-15T12:00:00Z" }, now)).toBe(false);
  });
  it("treats active and trialing as paid", () => {
    expect(isActiveMembershipStatus("active")).toBe(true);
    expect(isActiveMembershipStatus("trialing")).toBe(true);
  });

  it("treats lapsed or missing statuses as free", () => {
    expect(isActiveMembershipStatus("canceled")).toBe(false);
    expect(isActiveMembershipStatus("past_due")).toBe(false);
    expect(isActiveMembershipStatus("incomplete")).toBe(false);
    expect(isActiveMembershipStatus("")).toBe(false);
    expect(isActiveMembershipStatus(null)).toBe(false);
    expect(isActiveMembershipStatus(undefined)).toBe(false);
  });
});

describe("subscriptionRowSchema", () => {
  const validRow = {
    id: "sub_123",
    user_id: "8a35f8de-3b31-4a35-9c5e-40f5f0d3a111",
    status: "active",
    price_id: "price_123",
    cancel_at_period_end: false,
    current_period_end: "2026-08-13T00:00:00.000Z",
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
  };

  it("parses a valid subscription row", () => {
    const result = subscriptionRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("sub_123");
      expect(result.data.cancel_at_period_end).toBe(false);
    }
  });

  it("allows nullable price and period end", () => {
    const result = subscriptionRowSchema.safeParse({
      ...validRow,
      price_id: null,
      current_period_end: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects rows missing required fields", () => {
    const { status: _status, ...missingStatus } = validRow;
    expect(subscriptionRowSchema.safeParse(missingStatus).success).toBe(false);
    expect(subscriptionRowSchema.safeParse({ ...validRow, id: "" }).success).toBe(
      false,
    );
    expect(
      subscriptionRowSchema.safeParse({
        ...validRow,
        cancel_at_period_end: "no",
      }).success,
    ).toBe(false);
  });

  it("defaults tier to collector and provider to stripe when absent", () => {
    const result = subscriptionRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tier).toBe("collector");
      expect(result.data.provider).toBe("stripe");
      expect(result.data.plan_id).toBeNull();
    }
  });

  it("accepts an explicit curator tier", () => {
    const result = subscriptionRowSchema.safeParse({
      ...validRow,
      tier: "curator",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tier).toBe("curator");
    }
  });

  it("accepts a founding curator plan", () => {
    const result = subscriptionRowSchema.safeParse({
      ...validRow,
      tier: "curator",
      plan_id: "founding_curator",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan_id).toBe("founding_curator");
    }
  });

  it("rejects an unrecognized tier or plan", () => {
    expect(
      subscriptionRowSchema.safeParse({ ...validRow, tier: "platinum" }).success,
    ).toBe(false);
    expect(
      subscriptionRowSchema.safeParse({ ...validRow, plan_id: "vip" }).success,
    ).toBe(false);
  });
});

describe("membership upload limits", () => {
  it("allows 5MB for free members", () => {
    expect(getMembershipUploadLimitBytes({ isPaidUser: false })).toBe(
      MEMBERSHIP_UPLOAD_LIMITS_BYTES.free,
    );
  });

  it("allows 10MB for Founding Curator", () => {
    expect(
      getMembershipUploadLimitBytes({
        isPaidUser: true,
        tier: "curator",
        planId: "founding_curator",
      }),
    ).toBe(MEMBERSHIP_UPLOAD_LIMITS_BYTES.foundingCurator);
  });

  it("allows 100MB for monthly and annual Curator", () => {
    for (const planId of ["curator_monthly", "curator_annual"] as const) {
      expect(
        getMembershipUploadLimitBytes({
          isPaidUser: true,
          tier: "curator",
          planId,
        }),
      ).toBe(MEMBERSHIP_UPLOAD_LIMITS_BYTES.curator);
    }
  });
});

describe("membership query timing", () => {
  it("keeps the sign-in result cached until a member action refreshes it", () => {
    const options = membershipQueryOptions("member-1");
    expect(options.queryKey).toEqual(["membership", "current", "member-1"]);
    expect(options.staleTime).toBe(Infinity);
    expect(options.gcTime).toBe(Infinity);
    expect(options.retry).toBe(0);
    expect(options.refetchOnMount).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnReconnect).toBe(false);
    expect(options.refetchInterval).toBeUndefined();
  });
});

describe("billing provider routing", () => {
  it("disables purchases when native billing is unavailable", () => {
    // Web and unconfigured builds must never fall back to Stripe.
    expect(getActiveBillingProvider()).toBeNull();
  });

  it("maps every plan to a store product id", () => {
    expect(PLAN_STORE_PRODUCT_IDS.founding_curator).toBeTruthy();
    expect(PLAN_STORE_PRODUCT_IDS.curator_monthly).toBeTruthy();
    expect(PLAN_STORE_PRODUCT_IDS.curator_annual).toBeTruthy();
  });
});
