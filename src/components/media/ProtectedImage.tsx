import { useAuthStore } from "@/hooks/useAuthStore";
import { protectedMediaSource } from "@/lib/protectedMedia";
import { Image as ExpoImage, type ImageProps } from "expo-image";

export function Image(props: ImageProps) {
  const session = useAuthStore((state) => state.session);
  const viewerId = session?.user.id;
  const original = props.source;
  const uri = typeof original === "string" ? original : original && typeof original === "object" && !Array.isArray(original) && "uri" in original ? original.uri : undefined;
  const protectedSource = uri && process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_ANON_KEY
    ? protectedMediaSource(uri, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_ANON_KEY, session?.access_token, viewerId) : null;
  if (!protectedSource) return <ExpoImage {...props} />;
  // Memory only: galleries and lists stop refetching on every render, while
  // nothing private is written to disk. AuthInitializer clears the memory
  // cache when the signed-in user changes.
  return <ExpoImage {...props} key={protectedSource.cacheKey} source={protectedSource}
    cachePolicy="memory" recyclingKey={protectedSource.cacheKey} />;
}
