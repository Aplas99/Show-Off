// General-purpose structured debug logging for the item creation & discovery
// pipeline (barcode scanning, product/API search, manual item creation,
// Magic: The Gathering search). Mirrors api/pokemon/cardScanDebug.ts's
// `[CardScan]` pattern but is shared across the non-Pokémon flows so each
// domain doesn't need its own bespoke logger.

const developmentBuild = typeof __DEV__ !== "undefined" && __DEV__;
let enabled =
  developmentBuild && process.env.EXPO_PUBLIC_ACTION_DEBUG !== "false";

export function setActionDebugEnabled(value: boolean) {
  enabled = developmentBuild && value;
}

export function isActionDebugEnabled() {
  return enabled;
}

export interface ActionLogger {
  log(event: string, details?: Record<string, unknown>): void;
  error(event: string, error: unknown): void;
}

/**
 * Creates a namespaced logger, e.g. `createActionLogger("Barcode")` logs as
 * `[Barcode] <event>`. All loggers share the single
 * `EXPO_PUBLIC_ACTION_DEBUG` toggle.
 */
export function createActionLogger(tag: string): ActionLogger {
  return {
    log(event, details) {
      if (!enabled) return;
      if (details) {
        console.log(`[${tag}] ${event}`, details);
      } else {
        console.log(`[${tag}] ${event}`);
      }
    },
    error(event, error) {
      if (!enabled) return;
      // A plain object is structured failure details; log it as-is.
      if (error && typeof error === "object" && !(error instanceof Error)) {
        console.error(`[${tag}] ${event}`, error);
        return;
      }
      console.error(`[${tag}] ${event}`, {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  };
}
