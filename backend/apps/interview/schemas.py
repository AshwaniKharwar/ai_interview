import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# --- Profile & Gap Analysis Models ---

class ExperienceHighlight(BaseModel):
    company: str
    title: str
    duration: str
    key_highlights: List[str] = Field(default_factory=list)


class CandidateProfile(BaseModel):
    name: str = "Candidate"
    seniority_level: str = "Mid-Level"
    primary_domains: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    experience: List[ExperienceHighlight] = Field(default_factory=list)
    education: str = ""


class JobProfile(BaseModel):
    job_title: str
    company_name: Optional[str] = None
    department: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    seniority_target: str = "Senior"
    key_responsibilities: List[str] = Field(default_factory=list)


class StrongAlignment(BaseModel):
    skill_or_domain: str
    evidence: str
    confidence: str = "HIGH"


class PotentialGap(BaseModel):
    skill_or_domain: str
    jd_requirement: str
    resume_status: str
    priority: str = "MEDIUM"


class UnverifiedClaim(BaseModel):
    claim: str
    verification_goal: str
    suggested_stage: str = "technical_deep_dive"


class GapAnalysis(BaseModel):
    match_score: int = Field(default=75, ge=0, le=100)
    strong_alignments: List[StrongAlignment] = Field(default_factory=list)
    potential_gaps: List[PotentialGap] = Field(default_factory=list)
    unverified_claims: List[UnverifiedClaim] = Field(default_factory=list)


# --- Blueprint & Rubric Models ---

class InterviewProbingRubric(BaseModel):
    expected_signals: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)


class InterviewStage(BaseModel):
    stage_id: str
    title: str
    duration_minutes: int
    min_turns: int = 2
    max_turns: int = 6
    objective: str
    transition_criteria: str
    focus_areas: List[str] = Field(default_factory=list)
    starter_questions: List[str] = Field(default_factory=list)
    follow_up_probes: List[str] = Field(default_factory=list)
    probing_rubric: Optional[InterviewProbingRubric] = None


class InterviewBlueprint(BaseModel):
    total_duration_minutes: int = 30
    difficulty_level: str = "medium"
    interviewer_persona: str = "rigorous_collaborative"
    stages: List[InterviewStage] = Field(default_factory=list)
    system_prompt_context: Optional[str] = None


# --- Combined Extraction Result ---

class ExtractionAndBlueprintResult(BaseModel):
    candidate_profile: CandidateProfile
    job_profile: JobProfile
    gap_analysis: GapAnalysis
    blueprint: InterviewBlueprint


# --- API Payloads ---

class ResumeUploadResponse(BaseModel):
    resume_file_url: str
    raw_text: str
    is_sparse: bool
    char_count: int


class InterviewCreateRequest(BaseModel):
    job_title: str
    company_name: Optional[str] = None
    job_description_raw: str
    resume_file_url: Optional[str] = None
    resume_raw_text: Optional[str] = None
    duration_minutes: int = 30
    difficulty_level: str = "medium"
    interviewer_persona: str = "rigorous_collaborative"


class InterviewResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    job_title: str
    company_name: Optional[str] = None
    job_description_raw: str
    resume_file_url: Optional[str] = None
    resume_download_url: Optional[str] = None
    resume_raw_text: Optional[str] = None
    parsed_jd_json: Optional[JobProfile] = None
    parsed_resume_json: Optional[CandidateProfile] = None
    gap_analysis_json: Optional[GapAnalysis] = None
    blueprint_json: Optional[InterviewBlueprint] = None
    duration_minutes: int
    difficulty_level: str
    interviewer_persona: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    turns: Optional[List["InterviewTurnResponse"]] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewTurnResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    turn_index: int
    stage_id: str
    question_text: str
    answer_transcript: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    latency_ms: Optional[int] = None
    was_interrupted: bool = False
    turn_evaluation_json: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    error_message: Optional[str] = None
    has_blueprint: bool


class BlueprintUpdateRequest(BaseModel):
    blueprint: InterviewBlueprint


class StageRegenerateRequest(BaseModel):
    user_instructions: Optional[str] = None

