import Cookies from "js-cookie";
import { COOKIE_KEYS } from "./constants";
import { TokenResponse } from "@/types/auth";

const isProduction = process.env.NODE_ENV === "production";

export function getAccessToken(): string | undefined {
  return Cookies.get(COOKIE_KEYS.ACCESS_TOKEN);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(COOKIE_KEYS.REFRESH_TOKEN);
}

export function setTokens(tokens: TokenResponse): void {
  // Convert expires_in (seconds) to days for js-cookie
  const accessExpiresInDays = tokens.expires_in / (60 * 60 * 24);
  const refreshExpiresInDays = 7; // Backend default is 7 days

  Cookies.set(COOKIE_KEYS.ACCESS_TOKEN, tokens.access_token, {
    expires: accessExpiresInDays,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  });

  Cookies.set(COOKIE_KEYS.REFRESH_TOKEN, tokens.refresh_token, {
    expires: refreshExpiresInDays,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  });
}

export function clearTokens(): void {
  Cookies.remove(COOKIE_KEYS.ACCESS_TOKEN, { path: "/" });
  Cookies.remove(COOKIE_KEYS.REFRESH_TOKEN, { path: "/" });
}
