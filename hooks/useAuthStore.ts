import { type Session, type User } from "@supabase/supabase-js";
import { create } from "zustand";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Whether the signed-in user still needs the choose-username onboarding
   * step. null = unknown (not yet checked for this session).
   */
  needsUsername: boolean | null;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setNeedsUsername: (needsUsername: boolean | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  needsUsername: null,
  setSession: (session) =>
    set((state) => ({
      session,
      user: session?.user ?? null,
      loading: false,
      // Reset the onboarding flag when the signed-in user changes.
      needsUsername:
        session?.user?.id === state.session?.user?.id
          ? state.needsUsername
          : null,
    })),
  setLoading: (loading) => set({ loading }),
  setNeedsUsername: (needsUsername) => set({ needsUsername }),
  signOut: () =>
    set({ session: null, user: null, loading: false, needsUsername: null }),
}));
