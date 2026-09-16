const developmentBuild = typeof __DEV__ !== "undefined" && __DEV__;
const enabled =
  developmentBuild && process.env.EXPO_PUBLIC_MEMBERSHIP_DEBUG !== "false";

/**
 * Development-only membership checkout diagnostics. Never log checkout URLs,
 * auth tokens, customer ids, or payment details here.
 */
export const membershipDebug = {
  log(event: string, details?: Record<string, unknown>) {
    if (!enabled) return;
    if (details) {
      console.log(`[Membership] ${event}`, details);
    } else {
      console.log(`[Membership] ${event}`);
    }
  },
  error(event: string, error: unknown, details?: Record<string, unknown>) {
    if (!enabled) return;
    console.error(`[Membership] ${event}`, {
      ...details,
      message: error instanceof Error ? error.message : String(error),
    });
  },
};
