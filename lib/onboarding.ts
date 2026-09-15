import type { Session } from "@supabase/supabase-js";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export interface UsernameValidation {
  valid: boolean;
  reason?: string;
}

/** Client-side mirror of reserve_username()'s format rule. */
export function validateUsername(raw: string): UsernameValidation {
  const username = raw.trim();
  if (username.length < 3) {
    return { valid: false, reason: "Username must be at least 3 characters." };
  }
  if (username.length > 20) {
    return { valid: false, reason: "Username must be 20 characters or fewer." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      reason: "Only letters, numbers, and underscores are allowed.",
    };
  }
  return { valid: true };
}

/**
 * Whether a signed-in user still needs the choose-username onboarding step.
 * A missing profile row (OAuth first login) counts as needing onboarding.
 */
export function needsUsernameOnboarding(
  profile: { username: string | null } | null | undefined,
): boolean {
  return !profile || !profile.username || profile.username.trim() === "";
}

export type PostAuthDestination =
  | { route: "/onboarding/choose-username" }
  | { route: "/(tabs)/discover" }
  | { route: "/(auth)/signin" }
  | null;

/**
 * Central post-auth routing decision, shared by every signup/signin method
 * (email, Google, Discord — the provider never changes the outcome, only the
 * session/username state does).
 *
 * Returns null when the user is already somewhere they're allowed to be.
 */
export function resolveAuthRedirect({
  session,
  needsUsername,
  inAuthGroup,
  inOnboardingGroup,
  inPublicGroup,
  isResettingPassword,
}: {
  session: Session | null;
  /** null = unknown (still loading) — never redirect on unknown. */
  needsUsername: boolean | null;
  inAuthGroup: boolean;
  inOnboardingGroup: boolean;
  inPublicGroup: boolean;
  isResettingPassword: boolean;
}): PostAuthDestination {
  if (inPublicGroup) return null;
  if (!session) {
    if (inAuthGroup || inPublicGroup) return null;
    return { route: "/(auth)/signin" };
  }

  if (isResettingPassword) return null;

  // Signed in but username state unknown — hold position until known.
  if (needsUsername === null) return null;

  if (needsUsername) {
    return inOnboardingGroup ? null : { route: "/onboarding/choose-username" };
  }

  // Complete profile: keep out of auth screens and finished onboarding.
  if (inAuthGroup || inOnboardingGroup) return { route: "/(tabs)/discover" };
  return null;
}

/** Maps reserve_username RPC errors to user-facing copy. */
export function mapReserveUsernameError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("username_taken")) {
    return "That username is already taken. Try another.";
  }
  if (message.includes("username_invalid")) {
    return "Usernames are 3-20 characters: letters, numbers, and underscores.";
  }
  return "Couldn't save your username. Please try again.";
}
