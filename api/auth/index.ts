import { supabase } from "@/lib/supabase";
import { authRedirectUrl, createAuthCodeExchanger } from "@/lib/authRedirect";
import { emailSchema } from "@/lib/authValidation";
import { reportedAgeSchema } from "@/lib/ageAccess";
import { POLICY_VERSION } from "@/lib/policies";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

function redirectTo(path: "auth/callback" | "reset-password") {
  return authRedirectUrl(path, Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined);
}

export const completeAuthCallback = createAuthCodeExchanger(async (code) => {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error("This link expired or was opened on a different device. Start again on this device.");
  return data;
});

// 1. Raw Supabase Auth Functions
export const signUpWithEmail = async ({ email, password, username, age, accepted }: { email: string; password: string; username: string; age: number; accepted: boolean }) => {
  reportedAgeSchema.parse(age);
  if (!accepted) throw new Error("Please accept the terms and community standards.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo("auth/callback"),
      data: {
        username: username,
        reported_age: age,
        accepted_policy_version: POLICY_VERSION,
      },
    },
  });
  if (error) throw error;
  return data;
};

export const signInWithEmail = async ({ email, password }: { email: string; password: string }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
};

/** Deep link OAuth providers redirect back to. */
export const OAUTH_REDIRECT_URL = "showoff:///auth/callback";

export type OAuthProvider = "google" | "discord" | "apple";

/**
 * Signs in with an OAuth provider already configured on the Supabase
 * project (Auth -> Providers). `skipBrowserRedirect` keeps the SDK from
 * attempting a web-only redirect and instead hands back the provider URL
 * to open in an in-app browser session, matching the pattern already
 * used for Stripe Checkout (see api/memberships).
 */
export const signInWithOAuthProvider = async (provider: OAuthProvider) => {
  const redirectUrl = redirectTo("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(`Could not start ${provider} sign-in.`);

  if (Platform.OS === "web") {
    window.location.assign(data.url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectUrl,
  );

  if (result.type !== "success" || !result.url) {
    return null;
  }

  return completeAuthCallback(result.url);
};

/** Deep link the recovery email redirects back to (see app/(auth)/reset-password). */
export const PASSWORD_RESET_REDIRECT_URL = "showoff:///reset-password";

export const requestPasswordReset = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo("reset-password"),
  });
  if (error) throw error;
};

export const resendConfirmation = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: emailSchema.parse(email.trim()),
    options: { emailRedirectTo: redirectTo("auth/callback") },
  });
  if (error) throw new Error("Could not resend confirmation. Wait a minute and try again.");
};

export const updatePassword = async (password: string) => {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
};

// TanStack Query Hooks (Mutations)
// We use mutations because these actions change server state.

export const useSignUp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signUpWithEmail,
    onSuccess: () => {
      // Refresh user data or session state
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
};

export const useSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signInWithEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
};

export const useSignInWithOAuth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signInWithOAuthProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
};

/**
 * Permanently deletes the current account via the delete-account Edge
 * Function, then clears local session + cache.
 */
export const useDeleteAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || data?.deleted !== true) {
        throw new Error("Deletion could not finish. Please retry. Some data may already have been removed.");
      }
      // Server already removed the user; drop the local session.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw new Error("Your account was deleted. Restart the app to clear the local session.");
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
};

export const useRequestPasswordReset = () => {
  return useMutation({
    mutationFn: requestPasswordReset,
  });
};

export const useUpdatePassword = () => {
  return useMutation({
    mutationFn: updatePassword,
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
      useAuthStore.getState().signOut();
    },
  });
};
