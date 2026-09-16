export function protectedMediaSource(uri: string, supabaseUrl: string, anonKey: string, accessToken?: string) {
  let url: URL;
  try { url = new URL(uri); } catch { return null; }
  const base = new URL(supabaseUrl);
  if (url.origin !== base.origin || url.username || url.password) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated)\/(item-images|post-media)\/(.+)$/);
  if (!match) return null;
  // Only send credentials to our exact storage origin and endpoint.
  return {
    uri: `${base.origin}/storage/v1/object/authenticated/${match[1]}/${match[2]}`,
    headers: { Authorization: `Bearer ${accessToken || anonKey}`, apikey: anonKey, "Cache-Control": "no-store" },
  };
}
