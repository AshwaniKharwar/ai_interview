import { API_BASE_URL } from "./constants";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./cookies";
import { TokenResponse, User } from "@/types/auth";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Fetch current user profile with given access token or HttpOnly cookie
 */
export async function fetchUserProfile(token?: string): Promise<User> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      errorData?.detail || "Failed to fetch user profile",
      response.status,
      errorData
    );
  }

  return response.json();
}

/**
 * Request new access & refresh tokens from backend via token string or HttpOnly cookie
 */
export async function refreshTokensApi(refreshToken?: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      errorData?.detail || "Failed to refresh token",
      response.status,
      errorData
    );
  }

  return response.json();
}

/**
 * Inform backend of user logout and clear cookies
 */
export async function logoutApi(accessToken?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers,
      credentials: "include",
    });
  } catch {
    // Ignore network errors on logout
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function getValidToken(): Promise<string | null> {
  const currentToken = getAccessToken();
  if (currentToken) return currentToken;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const newTokens = await refreshTokensApi(refreshToken);
      setTokens(newTokens);
      return newTokens.access_token;
    } catch {
      clearTokens();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authenticated API client wrapper with auto token refresh on 401
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  let token = await getValidToken();

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(url, { credentials: "include", ...options, headers });

  // Handle 401 Unauthorized - attempt token refresh
  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      token = await getValidToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
        response = await fetch(url, { credentials: "include", ...options, headers });
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      errorData?.detail || `API request failed with status ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}
