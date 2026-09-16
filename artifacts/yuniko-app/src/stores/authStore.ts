import { create } from "zustand";

export type AuthUser = { id: string; username?: string };

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  status: "idle" | "loading" | "authenticated" | "anonymous" | "error";
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthState["status"]) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "idle",
  setSession: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  clearSession: () => set({ user: null, accessToken: null, status: "anonymous" }),
  setStatus: (status) => set({ status }),
}));
