export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const COOKIE_KEYS = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
} as const;

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  AUTH_CALLBACK: "/auth/callback",
  INTERVIEW_NEW: "/interview/new",
  INTERVIEW_GENERATING: (id: string) => `/interview/${id}/generating`,
  INTERVIEW_PREPARE: (id: string) => `/interview/${id}/prepare`,
  INTERVIEW_ROOM: (id: string) => `/interview/${id}/room`,
} as const;
