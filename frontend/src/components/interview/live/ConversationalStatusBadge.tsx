"use client";

import React from "react";
import { Volume2, Mic, Sparkles, CheckCircle2, RotateCw } from "lucide-react";
import { LiveSessionState } from "@/types/interview";

interface ConversationalStatusBadgeProps {
  state: LiveSessionState;
}

export function ConversationalStatusBadge({ state }: ConversationalStatusBadgeProps) {
  const getBadgeConfig = () => {
    switch (state) {
      case "AI_SPEAKING":
        return {
          icon: <Volume2 className="h-4 w-4 animate-bounce text-indigo-400" />,
          label: "AI Interviewer Speaking",
          subtext: "Feel free to speak to interrupt at any time",
          bg: "bg-indigo-500/15 border-indigo-500/30 text-indigo-300",
        };
      case "LISTENING":
        return {
          icon: <Mic className="h-4 w-4 animate-pulse text-emerald-400" />,
          label: "Listening to your response...",
          subtext: "Speak naturally; pauses up to 1.5s are welcome",
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
        };
      case "PROCESSING":
        return {
          icon: <Sparkles className="h-4 w-4 animate-spin text-amber-400" />,
          label: "Synthesizing follow-up...",
          subtext: "Evaluating response against stage rubrics",
          bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        };
      case "INTERRUPT_FLUSH":
        return {
          icon: <RotateCw className="h-4 w-4 animate-spin text-rose-400" />,
          label: "Barge-in Registered",
          subtext: "Flushing AI playback...",
          bg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        };
      case "COMPLETED":
        return {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
          label: "Interview Completed",
          subtext: "Session concluded successfully",
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
        };
      default:
        return {
          icon: <Sparkles className="h-4 w-4 text-slate-400" />,
          label: "Initializing Connection",
          subtext: "Setting up real-time pipes",
          bg: "bg-slate-800 border-slate-700 text-slate-400",
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div
        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold shadow-sm transition-all duration-200 ${config.bg}`}
      >
        {config.icon}
        <span>{config.label}</span>
      </div>
      <p className="text-[11px] text-slate-400">{config.subtext}</p>
    </div>
  );
}
