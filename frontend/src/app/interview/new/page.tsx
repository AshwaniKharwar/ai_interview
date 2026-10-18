"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Briefcase,
  Settings,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ResumeUploader } from "@/components/interview/ResumeUploader";
import { JobDescriptionForm } from "@/components/interview/JobDescriptionForm";
import { ConfigSelector } from "@/components/interview/ConfigSelector";
import { createInterviewApi, generateBlueprintApi } from "@/lib/api";
import { ResumeUploadResponse } from "@/types/interview";
import { ROUTES } from "@/lib/constants";

export default function NewInterviewPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Resume data
  const [uploadedResume, setUploadedResume] = useState<ResumeUploadResponse | null>(null);

  // Step 2: Job Description
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [department, setDepartment] = useState("");
  const [jobDescriptionRaw, setJobDescriptionRaw] = useState("");

  // Step 3: Configuration
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [difficultyLevel, setDifficultyLevel] = useState("medium");
  const [interviewerPersona, setInterviewerPersona] = useState("rigorous_collaborative");

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canAdvanceStep1 = Boolean(uploadedResume);
  const canAdvanceStep2 = Boolean(jobTitle.trim() && jobDescriptionRaw.trim());

  const handleNext = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (!canAdvanceStep1) {
        setErrorMessage("Please upload candidate resume before proceeding.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!canAdvanceStep2) {
        setErrorMessage("Job title and job description are required.");
        return;
      }
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // 1. Create Interview Session in DRAFT state
      const session = await createInterviewApi({
        job_title: jobTitle.trim(),
        company_name: companyName.trim() || undefined,
        job_description_raw: jobDescriptionRaw.trim(),
        resume_file_url: uploadedResume?.resume_file_url,
        resume_raw_text: uploadedResume?.raw_text,
        duration_minutes: durationMinutes,
        difficulty_level: difficultyLevel,
        interviewer_persona: interviewerPersona,
      });

      // 2. Dispatch background task to generate blueprint
      await generateBlueprintApi(session.id);

      // 3. Navigate to Async Generation Loader
      router.push(ROUTES.INTERVIEW_GENERATING(session.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate blueprint generation.";
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header with Back button */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Link
              href={ROUTES.DASHBOARD}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-100">
                Setup Interview Blueprint
              </h1>
              <p className="text-xs text-slate-400">
                Configure candidate context and target role expectations
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            Step {currentStep} of 3
          </span>
        </div>

        {/* Step Indicator Stepper */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border text-left transition-all ${
              currentStep === 1
                ? "border-indigo-500 bg-indigo-500/10 text-white"
                : canAdvanceStep1
                ? "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                : "border-slate-800/40 bg-slate-900/20 text-slate-500"
            }`}
          >
            <div
              className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStep === 1
                  ? "bg-indigo-600 text-white"
                  : canAdvanceStep1
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              1
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">Candidate Resume</p>
              <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                {uploadedResume ? "Uploaded & Parsed" : "PDF / Word upload"}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!canAdvanceStep1}
            onClick={() => setCurrentStep(2)}
            className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border text-left transition-all ${
              currentStep === 2
                ? "border-indigo-500 bg-indigo-500/10 text-white"
                : canAdvanceStep2
                ? "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                : "border-slate-800/40 bg-slate-900/20 text-slate-500"
            }`}
          >
            <div
              className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStep === 2
                  ? "bg-indigo-600 text-white"
                  : canAdvanceStep2
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              2
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">Job Description</p>
              <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                {jobTitle ? jobTitle : "Target role requirements"}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!canAdvanceStep1 || !canAdvanceStep2}
            onClick={() => setCurrentStep(3)}
            className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border text-left transition-all ${
              currentStep === 3
                ? "border-indigo-500 bg-indigo-500/10 text-white"
                : "border-slate-800/40 bg-slate-900/20 text-slate-500"
            }`}
          >
            <div
              className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                currentStep === 3
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              3
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">Configuration</p>
              <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                {durationMinutes}m • {difficultyLevel}
              </p>
            </div>
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Wizard Step Content */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 md:p-8 shadow-sm">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-indigo-400" />
                  Step 1: Upload Candidate Resume
                </h2>
                <p className="text-xs text-slate-400">
                  Upload your resume. Our pipeline extracts your tech skills, project scale, and seniority indicators securely.
                </p>
              </div>

              <ResumeUploader
                uploadedData={uploadedResume}
                onUploadSuccess={(data) => {
                  setUploadedResume(data);
                  setErrorMessage(null);
                }}
                onClear={() => setUploadedResume(null)}
              />
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Briefcase className="h-4.5 w-4.5 text-indigo-400" />
                  Step 2: Target Job Description
                </h2>
                <p className="text-xs text-slate-400">
                  Provide the target job title and full JD. You can select one of the quick presets below to test immediately.
                </p>
              </div>

              <JobDescriptionForm
                jobTitle={jobTitle}
                setJobTitle={setJobTitle}
                companyName={companyName}
                setCompanyName={setCompanyName}
                department={department}
                setDepartment={setDepartment}
                jobDescriptionRaw={jobDescriptionRaw}
                setJobDescriptionRaw={setJobDescriptionRaw}
              />
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Settings className="h-4.5 w-4.5 text-indigo-400" />
                  Step 3: Interview Duration & Persona
                </h2>
                <p className="text-xs text-slate-400">
                  Select interview length, technical difficulty, and AI conversational persona.
                </p>
              </div>

              <ConfigSelector
                durationMinutes={durationMinutes}
                setDurationMinutes={setDurationMinutes}
                difficultyLevel={difficultyLevel}
                setDifficultyLevel={setDifficultyLevel}
                interviewerPersona={interviewerPersona}
                setInterviewerPersona={setInterviewerPersona}
              />
            </div>
          )}
        </div>

        {/* Wizard Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {currentStep > 1 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 hover:scale-[1.01]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Initiating AI Analysis...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Synthesize Blueprint</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
