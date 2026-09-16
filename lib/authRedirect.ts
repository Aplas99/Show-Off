export function authRedirectUrl(path: "auth/callback" | "reset-password", webOrigin?: string) {
  if (!webOrigin) return `showoff:///${path}`;
  const origin = new URL(webOrigin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
    throw new Error("Authentication requires a secure website address.");
  }
  return `${origin.origin}/${path}`;
}

export function readAuthCode(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("error") || parsed.searchParams.has("error_description")) {
    throw new Error("Sign-in could not finish. Please try again.");
  }
  const code = parsed.searchParams.get("code");
  if (!code) throw new Error("This sign-in link is missing its code. Request a new link.");
  return code;
}

/** A browser result and a deep-link route can deliver the same one-use code. */
export function createAuthCodeExchanger<T>(exchange: (code: string) => Promise<T>) {
  const exchanges = new Map<string, Promise<T>>();
  return async (url: string): Promise<T> => {
    const code = readAuthCode(url);
    const existing = exchanges.get(code);
    if (existing) return existing;
    const request = exchange(code);
    exchanges.set(code, request);
    if (exchanges.size > 16) exchanges.delete(exchanges.keys().next().value!);
    return request;
  };
}
