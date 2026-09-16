import { conservativeAge, reportedAgeSchema } from "./ageAccess";

describe("self-reported age", () => {
  it.each([12, -1, 13.5, 121, NaN])("rejects invalid/underage value %s", (age) => {
    expect(reportedAgeSchema.safeParse(age).success).toBe(false);
  });
  it("accepts the minimum and adults", () => {
    expect(reportedAgeSchema.parse(13)).toBe(13);
    expect(reportedAgeSchema.parse(18)).toBe(18);
  });
  it("does not grant 18+ access until a full recording anniversary", () => {
    expect(conservativeAge(17, "2025-09-15", new Date("2026-09-14"))).toBe(17);
    expect(conservativeAge(17, "2025-09-15", new Date("2026-09-15"))).toBe(18);
  });
  it("fails closed for unknown, invalid, and future recording dates", () => {
    expect(conservativeAge(null, null)).toBeNull();
    expect(conservativeAge(18, "invalid")).toBeNull();
    expect(conservativeAge(18, "2030-01-01", new Date("2026-01-01"))).toBeNull();
  });
});
