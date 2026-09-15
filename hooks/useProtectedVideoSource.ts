import { useAuthStore } from "@/hooks/useAuthStore";
import { protectedMediaSource } from "@/lib/protectedMedia";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export function useProtectedVideoSource(uri: string) {
  const token = useAuthStore((state) => state.session?.access_token);
  const source = useMemo(() => process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_ANON_KEY
    ? protectedMediaSource(uri, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_ANON_KEY, token) : null, [uri, token]);
  const [webBlob, setWebBlob] = useState<{ key: string; url: string } | null>(null);
  const key = `${uri}:${token ?? "anon"}`;
  useEffect(() => {
    if (Platform.OS !== "web" || !source) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetch(source.uri, { headers: source.headers, signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Video unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setWebBlob({ key, url: objectUrl });
      }).catch(() => { if (!controller.signal.aborted) setWebBlob(null); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, key]);
  if (!source) return uri;
  if (Platform.OS === "web") return webBlob?.key === key ? webBlob.url : null;
  return { ...source, useCaching: false };
}
