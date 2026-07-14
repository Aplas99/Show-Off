import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import "react-native-url-polyfill/auto";

// SecureStore warns above 2048 bytes and can fail to persist larger values
// on some devices; Supabase sessions regularly exceed that. Values larger
// than CHUNK_SIZE are split across `${key}.0`, `${key}.1`, ... with a
// chunk-count marker stored at the base key. Session JSON always starts
// with "{", so the marker prefix can never collide with real values.
const CHUNK_SIZE = 1800;
const CHUNK_MARKER = "__chunked__:";

async function nativeGetItem(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key);
  if (value === null || !value.startsWith(CHUNK_MARKER)) return value;

  const count = Number(value.slice(CHUNK_MARKER.length));
  if (!Number.isInteger(count) || count <= 0) return null;

  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(`${key}.${i}`),
    ),
  );
  if (chunks.some((chunk) => chunk === null)) return null;
  return chunks.join("");
}

async function nativeRemoveItem(key: string): Promise<void> {
  const existing = await SecureStore.getItemAsync(key);
  if (existing?.startsWith(CHUNK_MARKER)) {
    const count = Number(existing.slice(CHUNK_MARKER.length));
    if (Number.isInteger(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(`${key}.${i}`),
        ),
      );
    }
  }
  await SecureStore.deleteItemAsync(key);
}

async function nativeSetItem(key: string, value: string): Promise<void> {
  // Clear any stale chunks from a previous (possibly larger) value first.
  await nativeRemoveItem(key);

  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(
      `${key}.${i}`,
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    );
  }
  // Write the marker last so a partially-written value is never readable.
  await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
}

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    if (process.env.EXPO_OS === "web") {
      return typeof window !== "undefined" &&
        typeof window.localStorage?.getItem === "function"
        ? window.localStorage.getItem(key)
        : null;
    }
    return nativeGetItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (process.env.EXPO_OS === "web") {
      if (
        typeof window !== "undefined" &&
        typeof window.localStorage?.setItem === "function"
      ) {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    await nativeSetItem(key, value);
  },
  removeItem: async (key: string) => {
    if (process.env.EXPO_OS === "web") {
      if (
        typeof window !== "undefined" &&
        typeof window.localStorage?.removeItem === "function"
      ) {
        window.localStorage.removeItem(key);
      }
      return;
    }
    await nativeRemoveItem(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and " +
      "EXPO_PUBLIC_ANON_KEY in your .env file (see .env.example), then " +
      "restart the dev server.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase only refreshes tokens while the app is foregrounded; without
// this, a long-backgrounded app resumes with an expired session.
if (process.env.EXPO_OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
