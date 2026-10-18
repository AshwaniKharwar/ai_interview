"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  ArrowRight,
  Loader2,
  Calendar,
  Layers,
  Award,
} from "lucide-react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { listInterviewsApi } from "@/lib/api";
import { InterviewSession } from "@/types/interview";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      try {
        const data = await listInterviewsApi();
        setSessions(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load interviews.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }
    loadSessions();
  }, []);

  const totalSessions = sessions.length;
  const readyBlueprints = sessions.filter((s) => s.status === "BLUEPRINT_READY").length;
  const scores = sessions
    .map((s) => s.gap_analysis_json?.match_score)
    .filter((score): score is number => typeof score === "number");
  const avgMatchScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <AuthenticatedLayout>
      <div className="space-y-8">
        {/* Welcome & Primary CTA Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Welcome back, {user?.full_name?.split(" ")[0] || "Candidate"}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your interview sessions, role blueprints, and gap analyses.
            </p>
          </div>

          <Link
            href={ROUTES.INTERVIEW_NEW}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="h-4.5 w-4.5" />
            <span>Start New Interview</span>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Sessions
              </span>
              <Layers className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-3xl font-bold text-slate-100 mt-2">{totalSessions}</p>
            <p className="text-xs text-slate-500 mt-1">Recorded interview setups</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Blueprints Ready
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-slate-100 mt-2">{readyBlueprints}</p>
            <p className="text-xs text-slate-500 mt-1">Ready for live interview room</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Avg Role Match
              </span>
              <Award className="h-4 w-4 text-violet-400" />
            </div>
            <p className="text-3xl font-bold text-slate-100 mt-2">
              {avgMatchScore !== null ? `${avgMatchScore}%` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">Cross-role candidate alignment</p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Sessions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100">
              Interview Sessions & Blueprints
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {sessions.length} recorded
            </span>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Loading interview sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-4">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <FileText className="h-8 w-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-semibold text-slate-200">
                  No interview sessions yet
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload your candidate resume and target job description to generate a tailored, multi-stage AI interview blueprint with probing rubrics.
                </p>
              </div>
              <Link
                href={ROUTES.INTERVIEW_NEW}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/20 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span>Create Your First Interview</span>
              </Link>
            </div>
          ) : (
            /* Sessions Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((session) => {
                const matchScore = session.gap_analysis_json?.match_score;
                const isReady = session.status === "BLUEPRINT_READY";
                const isGenerating =
                  session.status === "BLUEPRINT_GENERATING" || session.status === "PARSING";

                return (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xs hover:border-slate-700 transition-all flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-base text-slate-100">
                            {session.job_title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {session.company_name || "Target Organization"}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                            isReady
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : isGenerating
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse"
                              : session.status.startsWith("FAILED")
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {session.status.replace("_", " ")}
                        </span>
                      </div>

                      {/* Metadata Row */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-indigo-400" />
                          {session.duration_minutes}m ({session.difficulty_level})
                        </span>

                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-500" />
                          {new Date(session.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>

                        {matchScore !== undefined && (
                          <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                            {matchScore}% Match
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom CTA */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {session.blueprint_json?.stages?.length || 0} stages configured
                      </span>

                      {isReady ? (
                        <Link
                          href={ROUTES.INTERVIEW_PREPARE(session.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          <span>Review & Prepare</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : isGenerating ? (
                        <Link
                          href={ROUTES.INTERVIEW_GENERATING(session.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>View Progress</span>
                        </Link>
                      ) : (
                        <Link
                          href={ROUTES.INTERVIEW_GENERATING(session.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                        >
                          <span>Details</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
