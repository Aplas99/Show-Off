// expo-web-browser and expo-secure-store (via @/lib/supabase) ship
// untranspiled ESM that ts-jest can't parse.
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

import {
  isActiveMembershipStatus,
  subscriptionRowSchema,
} from "@/api/memberships";

describe("isActiveMembershipStatus", () => {
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

  it("rejects an unrecognized tier", () => {
    expect(
      subscriptionRowSchema.safeParse({ ...validRow, tier: "platinum" }).success,
    ).toBe(false);
  });
});
