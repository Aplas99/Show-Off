export function protectedMediaSource(uri: string, supabaseUrl: string, anonKey: string, accessToken?: string, viewerId?: string) {
  let url: URL;
  try { url = new URL(uri); } catch { return null; }
  const base = new URL(supabaseUrl);
  if (url.origin !== base.origin || url.username || url.password) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated)\/(item-images|post-media)\/(.+)$/);
  if (!match) return null;
  const authenticatedUri = `${base.origin}/storage/v1/object/authenticated/${match[1]}/${match[2]}`;
  // Only send credentials to our exact storage origin and endpoint.
  return {
    uri: authenticatedUri,
    headers: { Authorization: `Bearer ${accessToken || anonKey}`, apikey: anonKey, "Cache-Control": "no-store" },
    // Scoped to the viewer so one account never reads another's cached copy
    // of media it may not be allowed to see. Excludes the token, which rotates.
    cacheKey: `${viewerId ?? "anon"}:${authenticatedUri}`,
  };
}
