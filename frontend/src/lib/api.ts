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

import {
  InterviewBlueprint,
  InterviewCreateRequest,
  InterviewSession,
  InterviewStatusResponse,
  ResumeUploadResponse,
} from "@/types/interview";

/**
 * Uploads a resume document (PDF or DOCX) to backend and Cloudflare R2
 */
export async function uploadResumeApi(file: File): Promise<ResumeUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<ResumeUploadResponse>("/interviews/upload-resume", {
    method: "POST",
    body: formData,
  });
}

/**
 * Creates a new interview session in DRAFT state
 */
export async function createInterviewApi(
  payload: InterviewCreateRequest
): Promise<InterviewSession> {
  return apiFetch<InterviewSession>("/interviews/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Initiates asynchronous LLM extraction and blueprint generation
 */
export async function generateBlueprintApi(
  sessionId: string
): Promise<InterviewStatusResponse> {
  return apiFetch<InterviewStatusResponse>(`/interviews/${sessionId}/generate-blueprint`, {
    method: "POST",
  });
}

/**
 * Polls the current status of the interview session
 */
export async function getInterviewStatusApi(
  sessionId: string
): Promise<InterviewStatusResponse> {
  return apiFetch<InterviewStatusResponse>(`/interviews/${sessionId}/status`);
}

/**
 * Retrieves the full session details including profiles, gap analysis, and blueprint
 */
export async function getInterviewSessionApi(
  sessionId: string
): Promise<InterviewSession> {
  return apiFetch<InterviewSession>(`/interviews/${sessionId}`);
}

/**
 * Lists the authenticated user's interview sessions ordered by recent creation
 */
export async function listInterviewsApi(): Promise<InterviewSession[]> {
  return apiFetch<InterviewSession[]>("/interviews/");
}

/**
 * Updates the interview blueprint with customized stage configurations
 */
export async function updateBlueprintApi(
  sessionId: string,
  blueprint: InterviewBlueprint
): Promise<InterviewSession> {
  return apiFetch<InterviewSession>(`/interviews/${sessionId}/blueprint`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ blueprint }),
  });
}

/**
 * Regenerates a single stage in the blueprint with custom AI prompt instructions
 */
export async function regenerateStageApi(
  sessionId: string,
  stageId: string,
  userInstructions?: string
): Promise<InterviewSession> {
  return apiFetch<InterviewSession>(
    `/interviews/${sessionId}/stages/${stageId}/regenerate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_instructions: userInstructions || null,
      }),
    }
  );
}
