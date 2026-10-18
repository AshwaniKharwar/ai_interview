"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Play,
  CheckCircle2,
  Layers,
  FileDown,
  UserCheck,
  AlertCircle,
  Loader2,
  Info,
} from "lucide-react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { StageCard } from "@/components/interview/StageCard";
import { RegenerateModal } from "@/components/interview/RegenerateModal";
import { GapAnalysisCard } from "@/components/interview/GapAnalysisCard";
import { DeviceTester } from "@/components/interview/DeviceTester";
import {
  getInterviewSessionApi,
  regenerateStageApi,
  updateBlueprintApi,
} from "@/lib/api";
import {
  InterviewBlueprint,
  InterviewSession,
  InterviewStage,
} from "@/types/interview";
import { ROUTES } from "@/lib/constants";

function PrepareStudioContent() {
  const routeParams = useParams();
  const sessionId = routeParams.id as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [blueprint, setBlueprint] = useState<InterviewBlueprint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Single-stage regeneration modal state
  const [targetStage, setTargetStage] = useState<InterviewStage | null>(null);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getInterviewSessionApi(sessionId);
        setSession(data);
        if (data.blueprint_json) {
          setBlueprint(data.blueprint_json);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load session details.";
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [sessionId]);

  const handleUpdateStage = (updatedStage: InterviewStage) => {
    if (!blueprint) return;
    const stages = blueprint.stages.map((s) =>
      s.stage_id === updatedStage.stage_id ? updatedStage : s
    );
    setBlueprint({ ...blueprint, stages });
    setSaveSuccess(false);
  };

  const handleSaveBlueprint = async () => {
    if (!blueprint) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updated = await updateBlueprintApi(sessionId, blueprint);
      setSession(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save blueprint modifications.";
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRegenerate = (stage: InterviewStage) => {
    setTargetStage(stage);
    setIsRegenerateModalOpen(true);
  };

  const handleRunRegeneration = async (stageId: string, instructions: string) => {
    const updated = await regenerateStageApi(sessionId, stageId, instructions);
    setSession(updated);
    if (updated.blueprint_json) {
      setBlueprint(updated.blueprint_json);
    }
  };

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Loading interview blueprint studio...</p>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (!session || !blueprint) {
    return (
      <AuthenticatedLayout>
        <div className="py-16 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-100">Blueprint Not Available</h2>
          <p className="text-xs text-slate-400">
            {errorMessage || "The requested blueprint has not finished generating or does not exist."}
          </p>
          <Link
            href={ROUTES.DASHBOARD}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </AuthenticatedLayout>
    );
  }

  const candidate = session.parsed_resume_json;

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        {/* Sticky Top Action Banner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm backdrop-blur-md sticky top-0 z-30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={ROUTES.DASHBOARD}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-100">
                  {session.job_title}
                </h1>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {session.difficulty_level}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {session.company_name || "Target Organization"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {blueprint.total_duration_minutes} min total duration • {blueprint.stages.length} dynamic stages
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 animate-in fade-in duration-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Blueprint Saved
              </span>
            )}

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveBlueprint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Save Changes</span>
            </button>

            <Link
              href={ROUTES.INTERVIEW_ROOM(sessionId)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.02]"
              title="Enter Phase 2 Live Voice Room"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Enter Interview Room</span>
            </Link>
          </div>
        </div>

        {/* Error notification if any */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Grid: Left Stage Timeline, Right Context & Peripherals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Stage Timeline & Probing Editor (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  Interview Stages & Probing Rubric
                </h2>
                <p className="text-xs text-slate-400">
                  Stages are executed sequentially by the AI interviewer with budgeted turns.
                </p>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                {blueprint.stages.length} stages
              </span>
            </div>

            {/* Stage Cards List */}
            <div className="space-y-4">
              {blueprint.stages.map((stage, idx) => (
                <StageCard
                  key={stage.stage_id}
                  stage={stage}
                  stageIndex={idx}
                  onUpdateStage={handleUpdateStage}
                  onOpenRegenerate={handleOpenRegenerate}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Candidate Profile, Gap Analysis & Peripherals (1 col) */}
          <div className="space-y-6">
            {/* Candidate Summary Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-indigo-400" />
                  <h4 className="text-sm font-semibold text-slate-100">
                    Candidate Profile
                  </h4>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-indigo-400 border border-slate-700">
                  {candidate?.seniority_level || "Extracted"}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block">Name:</span>
                  <span className="font-semibold text-slate-200">
                    {candidate?.name || "Candidate"}
                  </span>
                </div>

                {candidate?.skills && candidate.skills.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-[11px] block mb-1">
                      Detected Skills:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.slice(0, 10).map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] border border-slate-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {session.resume_download_url && (
                  <div className="pt-2">
                    <a
                      href={session.resume_download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Download Original Resume (Presigned R2)
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Gap Analysis Card */}
            <GapAnalysisCard gapAnalysis={session.gap_analysis_json} />

            {/* A/V Peripherals Tester */}
            <DeviceTester />

            {/* Phase 2 Live Engine Readiness Note */}
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-start gap-3 text-xs text-indigo-300 leading-relaxed">
              <Info className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-200">Live Voice Gateway</p>
                <p className="mt-0.5 text-slate-400 text-[11px]">
                  When you click &ldquo;Enter Interview Room&rdquo;, the system prompt bundle compiled from this blueprint will be streamed to the Phase 2 live WebSocket conversational engine.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Regeneration Modal */}
      <RegenerateModal
        stage={targetStage}
        isOpen={isRegenerateModalOpen}
        onClose={() => {
          setIsRegenerateModalOpen(false);
          setTargetStage(null);
        }}
        onRegenerate={handleRunRegeneration}
      />
    </AuthenticatedLayout>
  );
}

export default function PrepareStudioPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Loading blueprint studio...</p>
          </div>
        </AuthenticatedLayout>
      }
    >
      <PrepareStudioContent />
    </Suspense>
  );
}
