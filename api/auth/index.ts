import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";

// 1. Raw Supabase Auth Functions
export const signUpWithEmail = async ({ email, password, username }: { email: string; password: string; username: string }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/** Deep link OAuth providers redirect back to. */
export const OAUTH_REDIRECT_URL = "showoff://auth/callback";

export type OAuthProvider = "google" | "discord";

/**
 * Signs in with an OAuth provider already configured on the Supabase
 * project (Auth -> Providers). `skipBrowserRedirect` keeps the SDK from
 * attempting a web-only redirect and instead hands back the provider URL
 * to open in an in-app browser session, matching the pattern already
 * used for Stripe Checkout (see api/memberships).
 */
export const signInWithOAuthProvider = async (provider: OAuthProvider) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(`Could not start ${provider} sign-in.`);

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    OAUTH_REDIRECT_URL,
  );

  if (result.type !== "success" || !result.url) {
    throw new Error("Sign-in was cancelled.");
  }

  const redirectUrl = new URL(result.url);
  const code = redirectUrl.searchParams.get("code");
  if (!code) {
    const errorDescription = redirectUrl.searchParams.get("error_description");
    throw new Error(errorDescription || "Sign-in did not return an auth code.");
  }

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return sessionData;
};

/** Deep link the recovery email redirects back to (see app/(auth)/reset-password). */
export const PASSWORD_RESET_REDIRECT_URL = "showoff://reset-password";

export const requestPasswordReset = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });
  if (error) throw error;
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
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw new Error(error.message);
      // Server already removed the user; drop the local session.
      await supabase.auth.signOut().catch(() => undefined);
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
      queryClient.invalidateQueries({ queryKey: ["user"] });
      // You could also clear the cache entirely here
      queryClient.clear();
    },
  });
};
