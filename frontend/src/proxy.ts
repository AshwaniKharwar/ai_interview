import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_KEYS, ROUTES } from "./lib/constants";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get(COOKIE_KEYS.ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_KEYS.REFRESH_TOKEN)?.value;
  const isAuthenticated = Boolean(accessToken || refreshToken);

  // If user tries to access /dashboard without authentication, redirect to /login
  if (pathname.startsWith(ROUTES.DASHBOARD)) {
    if (!isAuthenticated) {
      const loginUrl = new URL(ROUTES.LOGIN, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If authenticated user visits /login, redirect to /dashboard
  if (pathname === ROUTES.LOGIN) {
    if (isAuthenticated) {
      const dashboardUrl = new URL(ROUTES.DASHBOARD, request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
  ],
};
