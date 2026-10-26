import { HttpClient, httpClient } from "../client";
import { API_BASE_URL } from "@/lib/constants";
import { getAccessToken } from "@/lib/cookies";
import { InterviewSession } from "@/types/interview";

export class LiveSessionApiService {
  constructor(private readonly client: HttpClient = httpClient) {}

  /**
   * Constructs the authenticated WebSocket URL for the live interview session.
   */
  public getLiveWebSocketUrl(sessionId: string): string {
    const token = getAccessToken();
    const wsBase = API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const url = `${wsBase}/interviews/${sessionId}/live`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  }

  /**
   * Fetches latest session details including current blueprint and status.
   */
  public async getSession(sessionId: string): Promise<InterviewSession> {
    return this.client.get<InterviewSession>(`/interviews/${sessionId}`);
  }
}

export const liveSessionApi = new LiveSessionApiService();
