"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AuthContextType, TokenResponse, User } from "@/types/auth";
import { API_BASE_URL, ROUTES } from "@/lib/constants";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/lib/cookies";
import { fetchUserProfile, logoutApi, refreshTokensApi } from "@/lib/api";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Load user profile from stored token on mount
  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      const token = getAccessToken();
      const refreshToken = getRefreshToken();

      if (token) {
        setAccessToken(token);
        try {
          const profile = await fetchUserProfile(token);
          if (isMounted) {
            setUser(profile);
            setIsLoading(false);
          }
          return;
        } catch {
          // Token might be expired, attempt refresh below
        }
      }

      if (refreshToken) {
        try {
          const newTokens = await refreshTokensApi(refreshToken);
          setTokens(newTokens);
          if (isMounted) {
            setAccessToken(newTokens.access_token);
            const profile = await fetchUserProfile(newTokens.access_token);
            setUser(profile);
            setIsLoading(false);
          }
          return;
        } catch {
          clearTokens();
        }
      }

      if (isMounted) {
        setUser(null);
        setAccessToken(null);
        setIsLoading(false);
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const loginWithGoogle = useCallback(() => {
    // Navigate to external backend OAuth endpoint
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${API_BASE_URL}/auth/google/login?redirect=true`);
  }, []);

  const setSessionFromTokens = useCallback(
    async (tokens: TokenResponse) => {
      setTokens(tokens);
      setAccessToken(tokens.access_token);
      try {
        const profile = await fetchUserProfile(tokens.access_token);
        setUser(profile);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      setUser(null);
      setAccessToken(null);
      return false;
    }

    try {
      const newTokens = await refreshTokensApi(refreshToken);
      setTokens(newTokens);
      setAccessToken(newTokens.access_token);
      const profile = await fetchUserProfile(newTokens.access_token);
      setUser(profile);
      return true;
    } catch {
      clearTokens();
      setUser(null);
      setAccessToken(null);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    const token = accessToken || getAccessToken();
    if (token) {
      await logoutApi(token);
    }
    clearTokens();
    setUser(null);
    setAccessToken(null);
    router.push(ROUTES.LOGIN);
  }, [accessToken, router]);

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated: Boolean(user && accessToken),
    loginWithGoogle,
    logout,
    setSessionFromTokens,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
