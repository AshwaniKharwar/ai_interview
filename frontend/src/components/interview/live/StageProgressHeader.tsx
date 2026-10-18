"use client";

import React from "react";
import { Clock, Layers } from "lucide-react";
import { ActiveStageInfo, InterviewStage } from "@/types/interview";

interface StageProgressHeaderProps {
  stages: InterviewStage[];
  activeStage: ActiveStageInfo | null;
  timeRemainingSeconds: number;
}

export function StageProgressHeader({
  stages,
  activeStage,
  timeRemainingSeconds,
}: StageProgressHeaderProps) {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  const currentStageIndex = activeStage?.stage_index ?? 0;

  return (
    <header className="w-full bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-6 py-3.5">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Stage Progression Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {stages.map((stg, idx) => {
            const isActive = idx === currentStageIndex;
            const isCompleted = idx < currentStageIndex;

            return (
              <div
                key={stg.stage_id || idx}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                    : isCompleted
                    ? "bg-slate-800/80 text-slate-400 border border-slate-700/50"
                    : "bg-slate-950/40 text-slate-600 border border-slate-800/50"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? "bg-indigo-500 text-white"
                      : isCompleted
                      ? "bg-slate-700 text-slate-300"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {idx + 1}
                </span>
                <span>{stg.title}</span>
              </div>
            );
          })}
        </div>

        {/* Turn Counter & Countdown Timer */}
        <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
          {activeStage && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              <span>
                Stage {currentStageIndex + 1} of {stages.length || 4}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200">
            <Clock className="h-4 w-4 text-emerald-400 animate-pulse" />
            <span className="font-mono text-sm tracking-wider">
              {formatTime(timeRemainingSeconds)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
