import { useAuthStore } from "@/hooks/useAuthStore";
import { membershipQueryOptions } from "@/api/memberships";
import { needsUsernameOnboarding, resolveAuthRedirect } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { hasAcceptedCurrentPolicy } from "@/lib/policies";
import { useQueryClient } from "@tanstack/react-query";
import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { session, setSession, loading, needsUsername, setNeedsUsername, needsSafety, setNeedsSafety } =
    useAuthStore((state) => state);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const queryClient = useQueryClient();
  const [profileError, setProfileError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 1. Check for an initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 2. Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (useAuthStore.getState().session?.user.id !== session?.user.id) queryClient.clear();
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession, queryClient]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    // One shared membership load when a session is established or restored.
    // Screens consume the cached result without polling on navigation.
    void queryClient.ensureQueryData(membershipQueryOptions(userId)).catch(() => undefined);
  }, [session?.user?.id, queryClient]);

  // 3. After any signup/signin method establishes a session, check whether
  // the profile has a username yet (OAuth first logins may not even have a
  // profile row). The result drives onboarding routing below.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || (needsUsername !== null && needsSafety !== null)) return;

    let cancelled = false;
    setProfileError(false);
    (async () => {
      const { data, error } = await supabase
        .from("profile")
        .select("username, reported_age, accepted_policy_version")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Keep access closed on profile errors and provide a retry.
        setProfileError(true);
        return;
      }
      setNeedsUsername(needsUsernameOnboarding(data));
      setNeedsSafety(!data || data.reported_age == null || !hasAcceptedCurrentPolicy(data.accepted_policy_version));
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, needsUsername, setNeedsUsername, needsSafety, setNeedsSafety, attempt]);

  useEffect(() => {
    if (loading || !navigationState?.key) return;
    if ((segments as string[]).includes("callback")) return;
    if (segments[0] === "legal") return;
    if (session && needsSafety && segments[0] !== "s" && !(segments as string[]).includes("reset-password")) {
      if (!(segments as string[]).includes("safety")) router.replace("/onboarding/safety");
      return;
    }
    if (session && needsSafety === null) return;

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
  }, [session, loading, navigationState, needsUsername, needsSafety, segments, router]);

  const publicOrOnboarding = segments[0] === "legal" || segments[0] === "s" || segments[0] === "onboarding" || segments[0] === "(auth)";
  if (session && needsSafety !== false && !publicOrOnboarding) {
    return <>{children}<View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0e0e0e" }}>
      {profileError ? <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={{ padding: 16 }}>
        <Text style={{ color: "#FFFFFF" }}>Could not load your account. Tap to retry.</Text>
      </TouchableOpacity> : <ActivityIndicator accessibilityLabel="Checking account access" />}
    </View></>;
  }
  return <>{children}</>;
}
