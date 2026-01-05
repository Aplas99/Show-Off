import { useAuthStore } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { session, setSession, loading } = useAuthStore((state) => state);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // 1. Check for an initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 2. Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (session && inAuthGroup) {
      console.log("AuthInitializer check:", { inAuthGroup, segments, session });
      router.replace("/(tabs)/discover");
    } else if (!session && !inAuthGroup) {
      console.log("AuthInitializer check:", { inAuthGroup, segments, session });
      router.replace("/(auth)/signin");
    }
  }, [session, loading, navigationState]);

  return <>{children}</>;
}
