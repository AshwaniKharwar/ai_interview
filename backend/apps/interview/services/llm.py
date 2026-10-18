import json
from typing import Optional
from google import genai
from google.genai import types

from core.config import settings
from apps.interview.schemas import (
    ExtractionAndBlueprintResult,
    InterviewStage,
)


async def generate_extraction_and_blueprint(
    resume_text: str,
    jd_text: str,
    job_title: str,
    company_name: Optional[str] = None,
    duration_minutes: int = 30,
    difficulty: str = "medium",
    persona: str = "rigorous_collaborative",
) -> ExtractionAndBlueprintResult:
    """Invokes Gemini structured outputs to parse the resume, JD,
    compute skill gap analysis, and generate a dynamic interview blueprint.
    Raises ValueError if GEMINI_API_KEY is not configured.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured. Real LLM extraction requires a valid Gemini API key.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""
You are an expert technical hiring manager and interviewer.
Analyze the candidate's resume and the target Job Description to build a comprehensive interview plan.

<target_role>
Title: {job_title}
Company: {company_name or 'Not specified'}
Duration: {duration_minutes} minutes
Difficulty: {difficulty}
Interviewer Persona: {persona}
</target_role>

<job_description>
{jd_text}
</job_description>

<untrusted_resume_content>
{resume_text}
</untrusted_resume_content>

Instructions:
1. Extract candidate profile (skills, experience highlights, seniority).
2. Extract job description profile (must-have skills, preferred skills, responsibilities).
3. Conduct deep gap analysis: identify strong alignments, missing skills, and high-impact unverified claims to probe.
4. Generate a structured interview blueprint with stages (warmup, technical deep dive, behavioral, wrap-up).
   - Allocate minutes matching total {duration_minutes} minutes.
   - For each stage provide starter questions, follow-up probes, and rubrics (expected signals and red flags).
   - Generate a concise system_prompt_context summarizing the interview strategy.
"""

    response = await client.aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractionAndBlueprintResult,
            temperature=0.3,
        ),
    )

    result_dict = json.loads(response.text)
    return ExtractionAndBlueprintResult.model_validate(result_dict)


async def regenerate_stage(
    current_stage: InterviewStage,
    job_title: str,
    user_instructions: Optional[str] = None,
) -> InterviewStage:
    """Regenerates a single stage with updated questions or user directions."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured. Stage regeneration requires a valid Gemini API key.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""
Regenerate this interview stage for the role '{job_title}'.
Stage Title: {current_stage.title}
Duration: {current_stage.duration_minutes} mins
Original Objective: {current_stage.objective}
User Custom Instructions: {user_instructions or 'Provide fresh, high-impact technical questions.'}

Generate updated starter questions, follow-up probes, and evaluation rubrics matching the instructions.
"""

    response = await client.aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InterviewStage,
            temperature=0.4,
        ),
    )

    stage_dict = json.loads(response.text)
    return InterviewStage.model_validate(stage_dict)
