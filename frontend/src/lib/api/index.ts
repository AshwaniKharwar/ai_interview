export { HttpClient, httpClient, ApiError, type RequestOptions } from "./client";
export { AuthApiService, authApi } from "./services/auth.service";
export { InterviewApiService, interviewApi } from "./services/interview.service";
export { LiveSessionApiService, liveSessionApi } from "./services/live-session.service";

import { authApi } from "./services/auth.service";
import { interviewApi } from "./services/interview.service";
import { httpClient } from "./client";

// Backward-compatible function delegates
export const fetchUserProfile = authApi.fetchUserProfile.bind(authApi);
export const refreshTokensApi = authApi.refreshTokens.bind(authApi);
export const logoutApi = authApi.logout.bind(authApi);

export const uploadResumeApi = interviewApi.uploadResume.bind(interviewApi);
export const createInterviewApi = interviewApi.createInterview.bind(interviewApi);
export const generateBlueprintApi = interviewApi.generateBlueprint.bind(interviewApi);
export const getInterviewStatusApi = interviewApi.getInterviewStatus.bind(interviewApi);
export const getInterviewSessionApi = interviewApi.getInterviewSession.bind(interviewApi);
export const listInterviewsApi = interviewApi.listInterviews.bind(interviewApi);
export const updateBlueprintApi = interviewApi.updateBlueprint.bind(interviewApi);
export const regenerateStageApi = interviewApi.regenerateStage.bind(interviewApi);

export const apiFetch = httpClient.request.bind(httpClient);
