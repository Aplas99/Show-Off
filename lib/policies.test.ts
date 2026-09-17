import { hasAcceptedCurrentPolicy, POLICY_VERSION } from "@/lib/policies";

describe("policy acceptance", () => {
  it("keeps the existing policy version for new accounts", () => {
    expect(POLICY_VERSION).toBe("2026-09-15");
  });

  it("does not send previously accepted accounts back to onboarding", () => {
    expect(hasAcceptedCurrentPolicy("2026-09-15")).toBe(true);
    expect(hasAcceptedCurrentPolicy("2026-09-16")).toBe(true);
  });

  it("requires onboarding when acceptance is missing or for another version", () => {
    expect(hasAcceptedCurrentPolicy(null)).toBe(false);
    expect(hasAcceptedCurrentPolicy("2026-09-14")).toBe(false);
  });
});
