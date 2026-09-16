import { useAuthStore } from "@/hooks/useAuthStore";
import { protectedMediaSource } from "@/lib/protectedMedia";
import { Image as ExpoImage, type ImageProps } from "expo-image";

export function Image(props: ImageProps) {
  const session = useAuthStore((state) => state.session);
  const original = props.source;
  const uri = typeof original === "string" ? original : original && typeof original === "object" && !Array.isArray(original) && "uri" in original ? original.uri : undefined;
  const protectedSource = uri && process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_ANON_KEY
    ? protectedMediaSource(uri, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_ANON_KEY, session?.access_token) : null;
  if (!protectedSource) return <ExpoImage {...props} />;
  return <ExpoImage {...props} key={`${session?.user.id ?? "anon"}:${uri}`} source={protectedSource}
    cachePolicy="none" recyclingKey={`${session?.user.id ?? "anon"}:${uri}`} />;
}
