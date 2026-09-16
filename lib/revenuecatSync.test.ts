import { defaultStorePlans, parseStorePlans, revenuecatSyncUsers, verifiedMembershipSnapshot } from "./revenuecatSync";

const now = Date.parse("2026-09-15T12:00:00Z");
const future = "2026-10-15T12:00:00Z";
const past = "2026-09-14T12:00:00Z";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
function response() {
  return {
    request_date_ms: now,
    subscriber: {
      entitlements: { curator: { product_identifier: "curator_monthly", expires_date: future, grace_period_expires_date: null as string | null } },
      subscriptions: { curator_monthly: {
        store: "app_store", is_sandbox: false, expires_date: future,
        grace_period_expires_date: null as string | null,
        unsubscribe_detected_at: null as string | null, refunded_at: null as string | null,
        period_type: "normal",
      } },
    },
  };
}
const parse = (body: unknown) => verifiedMembershipSnapshot(body, defaultStorePlans, false, now);

it("grants only a verified current store entitlement", () => {
  expect(parse(response())).toMatchObject({ status: "active", plan_id: "curator_monthly", current_period_end: future.replace("Z", ".000Z") });
});
it("keeps access until the paid period ends after cancellation", () => {
  const body = response();
  body.subscriber.subscriptions.curator_monthly.unsubscribe_detected_at = past;
  expect(parse(body)).toMatchObject({ status: "active", cancel_at_period_end: true });
});
it.each(["expired", "refunded", "sandbox", "wrong store", "wrong product", "missing expiry"])("rejects %s access", (reason) => {
  const body = response();
  const subscription = body.subscriber.subscriptions.curator_monthly;
  if (reason === "expired") subscription.expires_date = past;
  if (reason === "refunded") subscription.refunded_at = past;
  if (reason === "sandbox") subscription.is_sandbox = true;
  if (reason === "wrong store") subscription.store = "stripe";
  if (reason === "wrong product") body.subscriber.entitlements.curator.product_identifier = "unknown";
  if (reason === "missing expiry") subscription.expires_date = null as unknown as string;
  expect(parse(body).status).toBe("canceled");
});
it("respects a provider-confirmed grace period on both entitlement and subscription", () => {
  const body = response();
  body.subscriber.entitlements.curator.expires_date = past;
  body.subscriber.entitlements.curator.grace_period_expires_date = future;
  body.subscriber.subscriptions.curator_monthly.expires_date = past;
  body.subscriber.subscriptions.curator_monthly.grace_period_expires_date = future;
  expect(parse(body).status).toBe("active");
  body.subscriber.subscriptions.curator_monthly.grace_period_expires_date = null;
  expect(parse(body).status).toBe("canceled");
});
it("rejects malformed, stale and future-dated provider responses", () => {
  expect(() => parse({ subscriber: {} })).toThrow();
  expect(() => parse({ ...response(), request_date_ms: now - 360_000 })).toThrow("Stale");
  expect(() => parse({ ...response(), request_date_ms: now + 120_000 })).toThrow("Stale");
});
it("does not use aliases or unknown event types to grant access", () => {
  expect(revenuecatSyncUsers({ event: { type: "NEW_EVENT", app_user_id: userA } }, ["app"], false)).toEqual([]);
  expect(revenuecatSyncUsers({ event: { type: "RENEWAL", app_id: "app", environment: "PRODUCTION", app_user_id: "anonymous", aliases: [userA] } }, ["app"], false)).toEqual([]);
});
it("reconciles both transfer participants without interpreting the transfer as a purchase", () => {
  expect(revenuecatSyncUsers({ event: { type: "TRANSFER", transferred_from: [userA], transferred_to: [userB, userA] } }, ["app"], false)).toEqual([userA, userB]);
});
it("rejects the wrong app and ignores sandbox events on production", () => {
  const event = { type: "RENEWAL", app_id: "app", environment: "SANDBOX", app_user_id: userA };
  expect(revenuecatSyncUsers({ event }, ["app"], false)).toEqual([]);
  expect(revenuecatSyncUsers({ event }, ["app"], true)).toEqual([userA]);
  expect(() => revenuecatSyncUsers({ event }, ["another"], true)).toThrow("Unexpected");
});
it("uses explicit product mappings, including exact Play base plan identifiers", () => {
  expect(parseStorePlans('{"custom:monthly":"curator_monthly"}')).toEqual({ "custom:monthly": "curator_monthly" });
  expect(() => parseStorePlans('{"custom":"unlimited"}')).toThrow();
});
