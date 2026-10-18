"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { generateBlueprintApi, getInterviewStatusApi } from "@/lib/api";
import { InterviewStatusResponse } from "@/types/interview";
import { ROUTES } from "@/lib/constants";

interface StepItem {
  id: number;
  label: string;
  description: string;
}

const STEPS: StepItem[] = [
  {
    id: 1,
    label: "Candidate Profile Ingestion",
    description: "Parsing technical domains, projects, and seniority indicators",
  },
  {
    id: 2,
    label: "Job Description Decomposition",
    description: "Extracting must-have skills, role expectations, and target level",
  },
  {
    id: 3,
    label: "Multi-Dimensional Gap Analysis",
    description: "Identifying strong alignments, skill deficits, and unverified claims",
  },
  {
    id: 4,
    label: "Dynamic Blueprint Synthesis",
    description: "Generating stage durations, turn budgets, and rubric expectations",
  },
];

function GeneratingContent() {
  const router = useRouter();
  const routeParams = useParams();
  const sessionId = routeParams.id as string;

  const [statusData, setStatusData] = useState<InterviewStatusResponse | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Progressive simulated timer to advance through the intermediate visual steps
  useEffect(() => {
    const t1 = setTimeout(() => setActiveStep((prev) => Math.max(prev, 2)), 1800);
    const t2 = setTimeout(() => setActiveStep((prev) => Math.max(prev, 3)), 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Polling loop for status endpoint
  useEffect(() => {
    let isCancelled = false;

    const checkStatus = async () => {
      try {
        const res = await getInterviewStatusApi(sessionId);
        if (isCancelled) return;

        setStatusData(res);

        if (res.status === "BLUEPRINT_READY") {
          setActiveStep(4);
          // Wait briefly for user to see completed state, then push
          setTimeout(() => {
            if (!isCancelled) {
              router.push(ROUTES.INTERVIEW_PREPARE(sessionId));
            }
          }, 1200);
        } else if (res.status.startsWith("FAILED")) {
          setErrorMessage(
            res.error_message ||
              "An error occurred while analyzing the documents and generating the blueprint."
          );
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to poll blueprint status.";
          setErrorMessage(msg);
        }
      }
    };

    // Immediate first check
    checkStatus();

    // Poll every 1.5s
    const pollInterval = setInterval(checkStatus, 1500);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [sessionId, router]);

  const handleRetry = async () => {
    setErrorMessage(null);
    setIsRetrying(true);
    try {
      await generateBlueprintApi(sessionId);
      setActiveStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed.";
      setErrorMessage(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const isFailed = statusData?.status.startsWith("FAILED") || Boolean(errorMessage);
  const isComplete = statusData?.status === "BLUEPRINT_READY";

  return (
    <AuthenticatedLayout>
      <div className="max-w-2xl mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-600/20 relative">
            <Cpu className="h-8 w-8 animate-pulse" />
            <div className="absolute -inset-1 rounded-3xl bg-indigo-500/20 blur-md -z-10" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              {isComplete
                ? "Blueprint Ready!"
                : isFailed
                ? "Generation Interrupted"
                : "Synthesizing AI Blueprint"}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {isComplete
                ? "Extraction and gap analysis complete. Redirecting to review studio..."
                : isFailed
                ? "Failed to complete blueprint analysis. Please review the error below."
                : "Gemini is analyzing resume projects against role expectations in real-time."}
            </p>
          </div>
        </div>

        {/* Error Card */}
        {isFailed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3 text-rose-300 text-xs">
            <div className="flex items-center gap-2 font-semibold text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Generation Error</span>
            </div>
            <p className="leading-relaxed font-mono">
              {errorMessage || statusData?.error_message}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isRetrying}
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md transition-all"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                <span>Retry Generation</span>
              </button>
              <Link
                href={ROUTES.DASHBOARD}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Stepper Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8 space-y-6 shadow-sm">
          {STEPS.map((step) => {
            const isStepDone =
              isComplete ||
              (activeStep > step.id && !isFailed) ||
              (activeStep === 4 && step.id <= 3);
            const isStepCurrent = activeStep === step.id && !isComplete && !isFailed;

            return (
              <div key={step.id} className="flex items-start gap-4">
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                    isStepDone
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : isStepCurrent
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "bg-slate-800 text-slate-500 border border-slate-700/60"
                  }`}
                >
                  {isStepDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isStepCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-sm font-semibold ${
                        isStepDone
                          ? "text-slate-200"
                          : isStepCurrent
                          ? "text-indigo-300"
                          : "text-slate-500"
                      }`}
                    >
                      {step.label}
                    </p>
                    {isStepCurrent && (
                      <span className="text-[10px] uppercase font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 animate-pulse">
                        Analyzing...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info & Direct Bypass Link if already ready */}
        {isComplete && (
          <div className="text-center">
            <Link
              href={ROUTES.INTERVIEW_PREPARE(sessionId)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/25 transition-all"
            >
              <span>Continue to Prepare Studio</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}

export default function GeneratingPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Loading generation workspace...</p>
          </div>
        </AuthenticatedLayout>
      }
    >
      <GeneratingContent />
    </Suspense>
  );
}
