export type InterviewStatus =
  | "DRAFT"
  | "PARSING"
  | "BLUEPRINT_GENERATING"
  | "BLUEPRINT_READY"
  | "FAILED_EXTRACTION"
  | "FAILED_GENERATION"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EVALUATED";

export interface ExperienceHighlight {
  company: string;
  title: string;
  duration: string;
  key_highlights: string[];
}

export interface CandidateProfile {
  name: string;
  seniority_level: string;
  primary_domains: string[];
  skills: string[];
  experience: ExperienceHighlight[];
  education: string;
}

export interface JobProfile {
  job_title: string;
  company_name?: string | null;
  department?: string | null;
  required_skills: string[];
  preferred_skills: string[];
  seniority_target: string;
  key_responsibilities: string[];
}

export interface StrongAlignment {
  skill_or_domain: string;
  evidence: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | string;
}

export interface PotentialGap {
  skill_or_domain: string;
  jd_requirement: string;
  resume_status: string;
  priority: "HIGH" | "MEDIUM" | "LOW" | string;
}

export interface UnverifiedClaim {
  claim: string;
  verification_goal: string;
  suggested_stage: string;
}

export interface GapAnalysis {
  match_score: number;
  strong_alignments: StrongAlignment[];
  potential_gaps: PotentialGap[];
  unverified_claims: UnverifiedClaim[];
}

export interface InterviewProbingRubric {
  expected_signals: string[];
  red_flags: string[];
}

export interface InterviewStage {
  stage_id: string;
  title: string;
  duration_minutes: number;
  min_turns: number;
  max_turns: number;
  objective: string;
  transition_criteria: string;
  focus_areas: string[];
  starter_questions: string[];
  follow_up_probes: string[];
  probing_rubric?: InterviewProbingRubric | null;
}

export interface InterviewBlueprint {
  total_duration_minutes: number;
  difficulty_level: string;
  interviewer_persona: string;
  stages: InterviewStage[];
  system_prompt_context?: string | null;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  job_title: string;
  company_name?: string | null;
  job_description_raw: string;
  resume_file_url?: string | null;
  resume_download_url?: string | null;
  resume_raw_text?: string | null;
  parsed_jd_json?: JobProfile | null;
  parsed_resume_json?: CandidateProfile | null;
  gap_analysis_json?: GapAnalysis | null;
  blueprint_json?: InterviewBlueprint | null;
  duration_minutes: number;
  difficulty_level: string;
  interviewer_persona: string;
  status: InterviewStatus;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeUploadResponse {
  resume_file_url: string;
  raw_text: string;
  is_sparse: boolean;
  char_count: number;
  filename?: string;
}

export interface InterviewCreateRequest {
  job_title: string;
  company_name?: string;
  job_description_raw: string;
  resume_file_url?: string;
  resume_raw_text?: string;
  duration_minutes?: number;
  difficulty_level?: string;
  interviewer_persona?: string;
}

export interface InterviewStatusResponse {
  id: string;
  status: InterviewStatus;
  error_message?: string | null;
  has_blueprint: boolean;
}

export interface InterviewTurn {
  id: string;
  session_id: string;
  turn_index: number;
  stage_id: string;
  question_text: string;
  answer_transcript?: string | null;
  started_at: string;
  ended_at?: string | null;
  latency_ms?: number | null;
  was_interrupted: boolean;
  turn_evaluation_json?: Record<string, unknown> | null;
}

export type LiveSessionState =
  | "INIT"
  | "AI_SPEAKING"
  | "LISTENING"
  | "PROCESSING"
  | "INTERRUPT_FLUSH"
  | "COMPLETED";

export interface TranscriptEntry {
  id: string;
  speaker: "ai" | "candidate";
  text: string;
  isFinal: boolean;
  timestamp: number;
  stageId?: string;
}

export interface ActiveStageInfo {
  stage_id: string;
  title: string;
  stage_index: number;
  total_stages: number;
  turn_in_stage?: number;
  max_turns: number;
  min_turns?: number;
  duration_minutes: number;
  time_remaining_seconds: number;
}

