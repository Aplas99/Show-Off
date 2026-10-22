import { Platform, Share } from "react-native";

/**
 * Public site origin (the Cloudflare web build), e.g. https://showoff.app.
 * Share links point there so recipients without the app get the web page;
 * phones with the app installed open it instead through iOS universal links
 * and Android app links (configured from the same variable in app.config.ts).
 */
export function normalizeSiteOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildShowcaseShareUrl(showcaseId: string, origin: string | null): string {
  const id = encodeURIComponent(showcaseId);
  // Dev builds without EXPO_PUBLIC_SITE_URL only; app.config.ts refuses
  // production builds that lack it.
  return origin ? `${origin}/s/${id}` : `showoff:///s/${id}`;
}

export function getShowcaseShareUrl(showcaseId: string): string {
  const origin = Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : normalizeSiteOrigin(process.env.EXPO_PUBLIC_SITE_URL);
  return buildShowcaseShareUrl(showcaseId, origin);
}

/** Opens the native share sheet (or copies on web). Resolves "copied" on web. */
export async function shareShowcaseLink(showcaseId: string): Promise<"shared" | "copied"> {
  const url = getShowcaseShareUrl(showcaseId);
  if (Platform.OS === "web") {
    await navigator.clipboard.writeText(url);
    return "copied";
  }
  // iOS shares `url` as its own attachment; putting it in `message` as well
  // makes many apps paste the link twice. Android only reads `message`.
  await Share.share(Platform.OS === "ios"
    ? { message: "View my Show Off showcase", url }
    : { message: `View my Show Off showcase: ${url}` });
  return "shared";
}
