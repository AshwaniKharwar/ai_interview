import json
from typing import Optional
from core.config import settings
from apps.interview.schemas import (
    CandidateProfile,
    ExperienceHighlight,
    ExtractionAndBlueprintResult,
    GapAnalysis,
    InterviewBlueprint,
    InterviewProbingRubric,
    InterviewStage,
    JobProfile,
    PotentialGap,
    StrongAlignment,
    UnverifiedClaim,
)


def _build_fallback_result(
    resume_text: str,
    jd_text: str,
    job_title: str,
    duration_minutes: int,
    difficulty: str,
    persona: str,
) -> ExtractionAndBlueprintResult:
    """Deterministic fallback synthesizer when GEMINI_API_KEY is not set."""
    # Heuristic candidate profile
    candidate = CandidateProfile(
        name="Candidate",
        seniority_level="Senior" if "senior" in resume_text.lower() else "Mid-Level",
        primary_domains=["Software Engineering", "Backend Development"],
        skills=["Python", "PostgreSQL", "REST APIs", "Docker", "Git"],
        experience=[
            ExperienceHighlight(
                company="Recent Company",
                title="Software Engineer",
                duration="2021 - Present",
                key_highlights=["Developed core backend services and APIs."],
            )
        ],
        education="Computer Science / Engineering Degree",
    )

    # Heuristic job profile
    job = JobProfile(
        job_title=job_title,
        required_skills=["Backend Engineering", "Databases", "System Design"],
        preferred_skills=["Distributed Systems", "Cloud Platforms"],
        seniority_target="Senior",
        key_responsibilities=[
            "Design, build, and maintain efficient, scalable backend architectures.",
            "Collaborate with engineering teams to ensure high code quality.",
        ],
    )

    # Heuristic gap analysis
    gap = GapAnalysis(
        match_score=80,
        strong_alignments=[
            StrongAlignment(
                skill_or_domain="Backend Engineering & APIs",
                evidence="Strong foundational experience evident across past positions.",
                confidence="HIGH",
            )
        ],
        potential_gaps=[
            PotentialGap(
                skill_or_domain="High Scale System Design",
                jd_requirement="Demonstrated experience designing high throughput distributed systems.",
                resume_status="Resume mentions backend development; probe for scale limits and throughput.",
                priority="HIGH",
            )
        ],
        unverified_claims=[
            UnverifiedClaim(
                claim="Designed and maintained scalable production services",
                verification_goal="Evaluate candidate's architectural decision-making, concurrency, and failure mitigation strategies.",
                suggested_stage="technical_deep_dive",
            )
        ],
    )

    # Proportional stage durations
    warmup_mins = max(3, int(duration_minutes * 0.15))
    tech_mins = max(10, int(duration_minutes * 0.50))
    behav_mins = max(5, int(duration_minutes * 0.25))
    wrap_mins = max(2, duration_minutes - (warmup_mins + tech_mins + behav_mins))

    stages = [
        InterviewStage(
            stage_id="warmup_background",
            title="Introduction & Career Journey",
            duration_minutes=warmup_mins,
            min_turns=2,
            max_turns=4,
            objective="Verify background, review career highlights, and establish rapport.",
            transition_criteria="Candidate has summarized their core engineering background and most impactful project.",
            focus_areas=["Past career progression", "Overview of primary technical stack"],
            starter_questions=[
                f"Welcome! To get started, could you introduce yourself and walk me through your recent engineering work?"
            ],
            follow_up_probes=[
                "What was the most challenging technical project you led in that role?"
            ],
            probing_rubric=InterviewProbingRubric(
                expected_signals=["Clear communication", "Explicit ownership of projects"],
                red_flags=["Overly vague descriptions", "Cannot articulate personal contribution"],
            ),
        ),
        InterviewStage(
            stage_id="technical_deep_dive",
            title="System Architecture & Problem Solving",
            duration_minutes=tech_mins,
            min_turns=4,
            max_turns=10,
            objective="Deeply evaluate system design trade-offs, scaling limits, and technical edge cases.",
            transition_criteria="Candidate has addressed scalability, concurrency, data storage trade-offs, and failure recovery.",
            focus_areas=["Scalability & Concurrency", "Database Architecture", "Failure Mitigation"],
            starter_questions=[
                f"For the {job_title} role, how would you architect a resilient, high-throughput service that handles sudden 10x traffic spikes?"
            ],
            follow_up_probes=[
                "How do you handle database write bottlenecks and consistency under high concurrency?",
                "If a critical downstream dependency fails, what circuit breaking or fallback mechanisms do you employ?",
            ],
            probing_rubric=InterviewProbingRubric(
                expected_signals=[
                    "Understands CAP trade-offs, caching, indexing, and asynchronous messaging",
                    "Articulates concrete bottleneck mitigation strategies",
                ],
                red_flags=[
                    "Proposes single points of failure",
                    "Ignores database concurrency issues and network partitions",
                ],
            ),
        ),
        InterviewStage(
            stage_id="behavioral_leadership",
            title="Collaboration, Ownership & Conflict",
            duration_minutes=behav_mins,
            min_turns=2,
            max_turns=5,
            objective="Evaluate communication, mentorship, and resolution of technical disagreements.",
            transition_criteria="Candidate has provided a structured STAR example of resolving a technical conflict.",
            focus_areas=["Technical disagreements", "Mentorship and ownership"],
            starter_questions=[
                "Can you tell me about a time you strongly disagreed with a team member's architectural decision? How did you navigate the conversation?"
            ],
            follow_up_probes=[
                "What compromise did you reach, and how did it impact the final delivery?"
            ],
            probing_rubric=InterviewProbingRubric(
                expected_signals=["Constructive conflict resolution", "Data-driven decision making", "Empathy"],
                red_flags=["Blaming teammates", "Rigid refusal to compromise"],
            ),
        ),
        InterviewStage(
            stage_id="wrap_up",
            title="Candidate Questions & Wrap-Up",
            duration_minutes=wrap_mins,
            min_turns=1,
            max_turns=3,
            objective="Allow candidate to ask questions about the team and conclude smoothly.",
            transition_criteria="Candidate has asked their questions or confirmed they are ready to finish.",
            starter_questions=[
                "We have a few minutes left. What questions do you have for me about the team, the tech stack, or the company?"
            ],
        ),
    ]

    system_prompt = (
        f"You are an expert technical interviewer conducting a {duration_minutes}-minute interview for a {job_title} role. "
        f"Interviewer persona: {persona}. Difficulty: {difficulty}. "
        f"Probe candidate background, challenge architectural assumptions constructively, and maintain professional rigor."
    )

    blueprint = InterviewBlueprint(
        total_duration_minutes=duration_minutes,
        difficulty_level=difficulty,
        interviewer_persona=persona,
        stages=stages,
        system_prompt_context=system_prompt,
    )

    return ExtractionAndBlueprintResult(
        candidate_profile=candidate,
        job_profile=job,
        gap_analysis=gap,
        blueprint=blueprint,
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
    """Invokes Gemini 2.0 Flash structured outputs to parse the resume, JD,
    compute skill gap analysis, and generate a dynamic interview blueprint.
    Falls back gracefully if GEMINI_API_KEY is not configured.
    """
    if not settings.GEMINI_API_KEY:
        return _build_fallback_result(
            resume_text=resume_text,
            jd_text=jd_text,
            job_title=job_title,
            duration_minutes=duration_minutes,
            difficulty=difficulty,
            persona=persona,
        )

    from google import genai
    from google.genai import types

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
        updated = current_stage.model_copy(deep=True)
        if user_instructions:
            updated.focus_areas.append(f"Custom focus: {user_instructions}")
            updated.starter_questions = [
                f"Regarding {user_instructions}: could you describe your hands-on experience and approach?"
            ]
        return updated

    from google import genai
    from google.genai import types

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
