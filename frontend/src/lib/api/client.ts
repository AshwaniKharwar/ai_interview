import { API_BASE_URL } from "../constants";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "../cookies";
import { TokenResponse } from "@/types/auth";

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

export interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string> | Headers;
  skipAuth?: boolean;
}

/**
 * HttpClient provides a resilient HTTP transport layer adhering to SRP and DIP:
 * - Manages base URL configuration
 * - Handles automatic Bearer token injection
 * - Handles 401 Unauthorized automatic token refresh retry queue
 */
export class HttpClient {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(private readonly baseUrl: string = API_BASE_URL) {}

  private async getValidToken(forceRefresh = false): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!forceRefresh) {
      const currentToken = getAccessToken();
      if (currentToken) return currentToken;
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          clearTokens();
          return null;
        }

        const newTokens: TokenResponse = await response.json();
        setTokens(newTokens);
        return newTokens.access_token;
      } catch {
        clearTokens();
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    let sentToken: string | null = null;
    if (!options.skipAuth) {
      sentToken = await this.getValidToken();
      if (sentToken) {
        headers.set("Authorization", `Bearer ${sentToken}`);
      }
    }

    // Do not set Content-Type if body is FormData (let browser calculate multipart boundary)
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    // Handle 401 Unauthorized - attempt token refresh and single retry
    if (response.status === 401 && !options.skipAuth) {
      const currentToken = getAccessToken();
      const refreshedToken =
        currentToken && currentToken !== sentToken
          ? currentToken
          : await this.getValidToken(true);

      if (refreshedToken) {
        headers.set("Authorization", `Bearer ${refreshedToken}`);
        response = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
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

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export const httpClient = new HttpClient();
