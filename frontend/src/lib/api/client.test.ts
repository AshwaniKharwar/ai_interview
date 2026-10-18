import { describe, it, expect, beforeEach, mock } from "bun:test";
import { HttpClient, ApiError } from "./client";

describe("HttpClient Token Refresh", () => {
  const baseUrl = "https://api.test";

  beforeEach(() => {
    mock.restore();
  });

  it("refreshes token on 401 and retries request with new token", async () => {
    let accessToken = "expired-token";
    let refreshToken = "valid-refresh-token";
    const newAccessToken = "new-access-token";

    // Mock cookie functions
    mock.module("../cookies", () => ({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setTokens: (tokens: { access_token: string; refresh_token: string }) => {
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
      },
      clearTokens: () => {
        accessToken = "";
        refreshToken = "";
      },
    }));

    let requestCount = 0;
    let refreshCount = 0;

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/auth/refresh")) {
        refreshCount++;
        return new Response(
          JSON.stringify({
            access_token: newAccessToken,
            refresh_token: "new-refresh-token",
            token_type: "bearer",
            expires_in: 1800,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/test-endpoint")) {
        requestCount++;
        const authHeader = (init?.headers as Headers)?.get("Authorization");
        if (authHeader === "Bearer expired-token") {
          return new Response(JSON.stringify({ detail: "Token expired" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (authHeader === `Bearer ${newAccessToken}`) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const client = new HttpClient(baseUrl);
    const result = await client.get<{ success: boolean }>("/test-endpoint");

    expect(result).toEqual({ success: true });
    expect(requestCount).toBe(2);
    expect(refreshCount).toBe(1);
    expect(accessToken).toBe(newAccessToken);
  });

  it("handles concurrent 401 requests with a single refresh call", async () => {
    let accessToken = "expired-token";
    let refreshToken = "valid-refresh-token";
    const newAccessToken = "new-access-token";

    mock.module("../cookies", () => ({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setTokens: (tokens: { access_token: string; refresh_token: string }) => {
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
      },
      clearTokens: () => {
        accessToken = "";
        refreshToken = "";
      },
    }));

    let refreshCount = 0;

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/auth/refresh")) {
        refreshCount++;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            access_token: newAccessToken,
            refresh_token: "new-refresh-token",
            token_type: "bearer",
            expires_in: 1800,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const authHeader = (init?.headers as Headers)?.get("Authorization");
      if (authHeader === "Bearer expired-token") {
        return new Response(JSON.stringify({ detail: "Token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (authHeader === `Bearer ${newAccessToken}`) {
        return new Response(JSON.stringify({ endpoint: urlStr }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const client = new HttpClient(baseUrl);
    const [res1, res2] = await Promise.all([
      client.get("/test-1"),
      client.get("/test-2"),
    ]);

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(refreshCount).toBe(1);
  });

  it("clears tokens and throws ApiError if refresh fails", async () => {
    let accessToken = "expired-token";
    let refreshToken = "invalid-refresh-token";
    let tokensCleared = false;

    mock.module("../cookies", () => ({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setTokens: () => {},
      clearTokens: () => {
        tokensCleared = true;
        accessToken = "";
        refreshToken = "";
      },
    }));

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/auth/refresh")) {
        return new Response(JSON.stringify({ detail: "Invalid refresh token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Token expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new HttpClient(baseUrl);

    await expect(client.get("/test-fail")).rejects.toThrow(ApiError);
    expect(tokensCleared).toBe(true);
  });
});
