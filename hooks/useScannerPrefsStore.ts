import { z } from "zod";
import { create } from "zustand";

/**
 * Scanner controls that survive closing the camera. Shared by every TCG
 * scanner so Torch behaves the same in each game; Foil/Promo only feed games
 * whose recognition pipeline understands scan hints (currently Pokémon).
 */
export interface ScannerPrefs {
  torch: boolean;
  foil: boolean;
  promo: boolean;
}

export type ScannerPref = keyof ScannerPrefs;

const STORAGE_KEY = "scanner-prefs";

const DEFAULT_SCANNER_PREFS: ScannerPrefs = { torch: false, foil: false, promo: false };

// Each field falls back on its own so one bad value can't reset the rest.
const scannerPrefsSchema = z.object({
  torch: z.boolean().catch(false),
  foil: z.boolean().catch(false),
  promo: z.boolean().catch(false),
});

export function parseScannerPrefs(raw: string | undefined): ScannerPrefs {
  if (!raw) return { ...DEFAULT_SCANNER_PREFS };
  try {
    return scannerPrefsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCANNER_PREFS };
  }
}

interface SyncStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

function createStorage(): SyncStorage {
  try {
    // MMKV is a native module — only works in dev builds, not Expo Go.
    // v4 exposes a factory; the old `new MMKV()` class constructor is gone.
    const { createMMKV } = require("react-native-mmkv");
    return createMMKV({ id: "scanner-prefs" }) as SyncStorage;
  } catch {
    // Fallback: in-memory store (Expo Go / Jest)
    const mem = new Map<string, string>();
    return {
      getString: (key: string) => mem.get(key),
      set: (key: string, value: string) => mem.set(key, value),
    };
  }
}

const storage = createStorage();

interface ScannerPrefsState extends ScannerPrefs {
  toggle: (pref: ScannerPref) => void;
}

export const useScannerPrefsStore = create<ScannerPrefsState>((set, get) => ({
  ...parseScannerPrefs(storage.getString(STORAGE_KEY)),
  toggle: (pref) => {
    const { torch, foil, promo } = get();
    const next: ScannerPrefs = { torch, foil, promo, [pref]: !get()[pref] };
    storage.set(STORAGE_KEY, JSON.stringify(next));
    set(next);
  },
}));
