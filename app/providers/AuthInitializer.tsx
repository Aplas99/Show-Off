import { useAuthStore } from "@/hooks/useAuthStore";
import { needsUsernameOnboarding, resolveAuthRedirect } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { session, setSession, loading, needsUsername, setNeedsUsername } =
    useAuthStore((state) => state);
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

  // 3. After any signup/signin method establishes a session, check whether
  // the profile has a username yet (OAuth first logins may not even have a
  // profile row). The result drives onboarding routing below.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || needsUsername !== null) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profile")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Fail open: don't strand users on a spinner because of a transient
        // profile read error — they can still be routed to onboarding later.
        setNeedsUsername(false);
        return;
      }
      setNeedsUsername(needsUsernameOnboarding(data));
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, needsUsername, setNeedsUsername]);

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const destination = resolveAuthRedirect({
      session,
      needsUsername,
      inAuthGroup: segments[0] === "(auth)",
      inOnboardingGroup: segments[0] === "onboarding",
      // Public showcase links (app/s/[id].tsx) must stay reachable by
      // signed-out visitors — they sit outside every auth-gated segment.
      inPublicGroup: segments[0] === "s",
      // Recovery links sign the user in but must stay on the reset screen.
      isResettingPassword: (segments as string[])[1] === "reset-password",
    });

    if (destination) {
      router.replace(destination.route as any);
    }
  }, [session, loading, navigationState, needsUsername, segments, router]);

  return <>{children}</>;
}
