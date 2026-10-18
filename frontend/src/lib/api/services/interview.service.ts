import { HttpClient, httpClient } from "../client";
import {
  InterviewBlueprint,
  InterviewCreateRequest,
  InterviewSession,
  InterviewStatusResponse,
  ResumeUploadResponse,
} from "@/types/interview";

export class InterviewApiService {
  constructor(private readonly client: HttpClient = httpClient) {}

  /**
   * Uploads a resume document (PDF or DOCX) to backend and Cloudflare R2
   */
  public async uploadResume(file: File): Promise<ResumeUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    return this.client.post<ResumeUploadResponse>("/interviews/upload-resume", formData);
  }

  /**
   * Creates a new interview session in DRAFT state
   */
  public async createInterview(
    payload: InterviewCreateRequest
  ): Promise<InterviewSession> {
    return this.client.post<InterviewSession>("/interviews/", payload);
  }

  /**
   * Initiates asynchronous LLM extraction and blueprint generation in background
   */
  public async generateBlueprint(sessionId: string): Promise<InterviewStatusResponse> {
    return this.client.post<InterviewStatusResponse>(
      `/interviews/${sessionId}/generate-blueprint`
    );
  }

  /**
   * Polls the current status of the interview session
   */
  public async getInterviewStatus(sessionId: string): Promise<InterviewStatusResponse> {
    return this.client.get<InterviewStatusResponse>(`/interviews/${sessionId}/status`);
  }

  /**
   * Retrieves full interview session details (profiles, gap analysis, blueprint)
   */
  public async getInterviewSession(sessionId: string): Promise<InterviewSession> {
    return this.client.get<InterviewSession>(`/interviews/${sessionId}`);
  }

  /**
   * Lists the authenticated user's interview sessions ordered by recent creation
   */
  public async listInterviews(): Promise<InterviewSession[]> {
    return this.client.get<InterviewSession[]>("/interviews/");
  }

  /**
   * Updates the interview blueprint with customized stage configurations
   */
  public async updateBlueprint(
    sessionId: string,
    blueprint: InterviewBlueprint
  ): Promise<InterviewSession> {
    return this.client.put<InterviewSession>(`/interviews/${sessionId}/blueprint`, {
      blueprint,
    });
  }

  /**
   * Regenerates a single stage in the blueprint with custom AI prompt instructions
   */
  public async regenerateStage(
    sessionId: string,
    stageId: string,
    userInstructions?: string
  ): Promise<InterviewSession> {
    return this.client.post<InterviewSession>(
      `/interviews/${sessionId}/stages/${stageId}/regenerate`,
      {
        user_instructions: userInstructions || null,
      }
    );
  }
}

export const interviewApi = new InterviewApiService();
