"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Target,
} from "lucide-react";
import { GapAnalysis } from "@/types/interview";

interface GapAnalysisCardProps {
  gapAnalysis: GapAnalysis | null | undefined;
}

export function GapAnalysisCard({ gapAnalysis }: GapAnalysisCardProps) {
  const [activeTab, setActiveTab] = useState<"alignments" | "gaps" | "claims">(
    "alignments"
  );

  if (!gapAnalysis) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center text-xs text-slate-400">
        Gap analysis data unavailable.
      </div>
    );
  }

  const score = gapAnalysis.match_score ?? 70;
  const scoreColor =
    score >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : score >= 60
      ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
      : "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xs space-y-4">
      {/* Header & Match Score Gauge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Role Match & Gap Analysis
            </h4>
            <p className="text-[11px] text-slate-400">
              Candidate Resume vs. Target Job Profile
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${scoreColor}`}
        >
          <span>{score}% Match</span>
        </div>
      </div>

      {/* Segment Tabs */}
      <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("alignments")}
          className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "alignments"
              ? "bg-slate-800 text-slate-100 shadow-xs"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>Strengths ({gapAnalysis.strong_alignments?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("gaps")}
          className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "gaps"
              ? "bg-slate-800 text-slate-100 shadow-xs"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
          <span>Gaps ({gapAnalysis.potential_gaps?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("claims")}
          className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "claims"
              ? "bg-slate-800 text-slate-100 shadow-xs"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
          <span>Probes ({gapAnalysis.unverified_claims?.length || 0})</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {activeTab === "alignments" && (
          <>
            {gapAnalysis.strong_alignments && gapAnalysis.strong_alignments.length > 0 ? (
              gapAnalysis.strong_alignments.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      {item.skill_or_domain}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {item.confidence}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {item.evidence}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                No strong alignments identified.
              </p>
            )}
          </>
        )}

        {activeTab === "gaps" && (
          <>
            {gapAnalysis.potential_gaps && gapAnalysis.potential_gaps.length > 0 ? (
              gapAnalysis.potential_gaps.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      {item.skill_or_domain}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                        item.priority?.toUpperCase() === "HIGH"
                          ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                          : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}
                    >
                      {item.priority} Priority
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <strong className="text-slate-400">Target JD:</strong> {item.jd_requirement}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    <strong className="text-slate-500">Status:</strong> {item.resume_status}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                No critical skill gaps identified.
              </p>
            )}
          </>
        )}

        {activeTab === "claims" && (
          <>
            {gapAnalysis.unverified_claims && gapAnalysis.unverified_claims.length > 0 ? (
              gapAnalysis.unverified_claims.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-300">
                      {item.claim}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                      Stage: {item.suggested_stage}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <strong className="text-slate-400">Verification Goal:</strong>{" "}
                    {item.verification_goal}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                No unverified claims flagged for probing.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
