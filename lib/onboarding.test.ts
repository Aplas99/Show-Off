import type { Session } from "@supabase/supabase-js";
import {
  mapReserveUsernameError,
  needsUsernameOnboarding,
  resolveAuthRedirect,
  validateUsername,
} from "./onboarding";

function makeSession(provider: "email" | "google" | "discord"): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: `user-${provider}`,
      aud: "authenticated",
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

const atOnboarding = {
  inAuthGroup: false,
  inOnboardingGroup: true,
  inPublicGroup: false,
  isResettingPassword: false,
};
const atAuth = {
  inAuthGroup: true,
  inOnboardingGroup: false,
  inPublicGroup: false,
  isResettingPassword: false,
};
const atTabs = {
  inAuthGroup: false,
  inOnboardingGroup: false,
  inPublicGroup: false,
  isResettingPassword: false,
};

describe("validateUsername", () => {
  it("accepts letters, digits, and underscores within 3-20 chars", () => {
    expect(validateUsername("card_fan99").valid).toBe(true);
    expect(validateUsername("abc").valid).toBe(true);
    expect(validateUsername("A".repeat(20)).valid).toBe(true);
  });

  it("rejects short, long, and special-character names", () => {
    expect(validateUsername("ab").valid).toBe(false);
    expect(validateUsername("A".repeat(21)).valid).toBe(false);
    expect(validateUsername("bad name").valid).toBe(false);
    expect(validateUsername("nice-try").valid).toBe(false);
    expect(validateUsername("émil").valid).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateUsername("  valid_name  ").valid).toBe(true);
  });
});

describe("needsUsernameOnboarding", () => {
  it("is true when the profile row is missing (OAuth first login)", () => {
    expect(needsUsernameOnboarding(null)).toBe(true);
    expect(needsUsernameOnboarding(undefined)).toBe(true);
  });

  it("is true for null or blank usernames", () => {
    expect(needsUsernameOnboarding({ username: null })).toBe(true);
    expect(needsUsernameOnboarding({ username: "" })).toBe(true);
    expect(needsUsernameOnboarding({ username: "   " })).toBe(true);
  });

  it("is false for a real username (returning user)", () => {
    expect(needsUsernameOnboarding({ username: "collector_1" })).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it.each(["email", "google", "discord"] as const)(
    "routes a fresh %s signup without a username to onboarding, not Discover",
    (provider) => {
      const destination = resolveAuthRedirect({
        session: makeSession(provider),
        needsUsername: true,
        ...atAuth,
      });
      expect(destination).toEqual({ route: "/onboarding/choose-username" });
    },
  );

  it.each(["email", "google", "discord"] as const)(
    "routes a returning %s user with a username straight to Discover",
    (provider) => {
      const destination = resolveAuthRedirect({
        session: makeSession(provider),
        needsUsername: false,
        ...atAuth,
      });
      expect(destination).toEqual({ route: "/(tabs)/discover" });
    },
  );

  it("holds position while the username check is still loading", () => {
    expect(
      resolveAuthRedirect({
        session: makeSession("google"),
        needsUsername: null,
        ...atAuth,
      }),
    ).toBeNull();
  });

  it("keeps an incomplete profile on the onboarding screen without looping", () => {
    expect(
      resolveAuthRedirect({
        session: makeSession("discord"),
        needsUsername: true,
        ...atOnboarding,
      }),
    ).toBeNull();
  });

  it("moves the user off onboarding once the username is reserved", () => {
    expect(
      resolveAuthRedirect({
        session: makeSession("email"),
        needsUsername: false,
        ...atOnboarding,
      }),
    ).toEqual({ route: "/(tabs)/discover" });
  });

  it("kicks an incomplete profile out of the main tabs into onboarding", () => {
    expect(
      resolveAuthRedirect({
        session: makeSession("email"),
        needsUsername: true,
        ...atTabs,
      }),
    ).toEqual({ route: "/onboarding/choose-username" });
  });

  it("sends signed-out users to sign in, leaving public routes alone", () => {
    expect(
      resolveAuthRedirect({ session: null, needsUsername: null, ...atTabs }),
    ).toEqual({ route: "/(auth)/signin" });
    expect(
      resolveAuthRedirect({
        session: null,
        needsUsername: null,
        inAuthGroup: false,
        inOnboardingGroup: false,
        inPublicGroup: true,
        isResettingPassword: false,
      }),
    ).toBeNull();
  });

  it("never redirects during password recovery", () => {
    expect(
      resolveAuthRedirect({
        session: makeSession("email"),
        needsUsername: true,
        inAuthGroup: true,
        inOnboardingGroup: false,
        inPublicGroup: false,
        isResettingPassword: true,
      }),
    ).toBeNull();
  });
});

describe("mapReserveUsernameError", () => {
  it("maps duplicate usernames to friendly copy", () => {
    expect(mapReserveUsernameError(new Error("username_taken"))).toBe(
      "That username is already taken. Try another.",
    );
  });

  it("maps invalid formats to the rules", () => {
    expect(mapReserveUsernameError(new Error("username_invalid"))).toContain(
      "3-20 characters",
    );
  });

  it("falls back to a generic retry message", () => {
    expect(mapReserveUsernameError(new Error("network request failed"))).toBe(
      "Couldn't save your username. Please try again.",
    );
  });
});
