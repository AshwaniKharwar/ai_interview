import { HttpClient, httpClient } from "../client";
import { TokenResponse, User } from "@/types/auth";

export class AuthApiService {
  constructor(private readonly client: HttpClient = httpClient) {}

  /**
   * Fetch current authenticated user profile
   */
  public async fetchUserProfile(token?: string): Promise<User> {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.client.get<User>("/auth/me", {
      headers,
      skipAuth: Boolean(token),
    });
  }

  /**
   * Request new access & refresh tokens via token string or HttpOnly cookie
   */
  public async refreshTokens(refreshToken?: string): Promise<TokenResponse> {
    return this.client.post<TokenResponse>(
      "/auth/refresh",
      refreshToken ? { refresh_token: refreshToken } : {},
      { skipAuth: true }
    );
  }

  /**
   * Inform backend of user logout
   */
  public async logout(accessToken?: string): Promise<void> {
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      await this.client.post<void>("/auth/logout", undefined, {
        headers,
        skipAuth: Boolean(accessToken),
      });
    } catch {
      // Ignore network errors on logout
    }
  }
}

export const authApi = new AuthApiService();
