"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Radio, Loader2 } from "lucide-react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ROUTES } from "@/lib/constants";

function InterviewRoomPlaceholderContent() {
  const routeParams = useParams();
  const sessionId = routeParams.id as string;

  return (
    <AuthenticatedLayout>
      <div className="max-w-2xl mx-auto py-16 text-center space-y-6">
        <div className="h-20 w-20 mx-auto rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-600/20">
          <Radio className="h-10 w-10 animate-pulse text-indigo-400" />
        </div>

        <div className="space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            Phase 2: Live Engine Handoff
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Live Voice Interview Room
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            The interview blueprint and dynamic probing rubrics from Phase 1 are locked and ready.
            The real-time bidirectional WebSocket gateway (STT/TTS bridge, Silero VAD, and Gemini Live Voice) will connect here in Phase 2.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-4">
          <Link
            href={ROUTES.INTERVIEW_PREPARE(sessionId)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Blueprint Review</span>
          </Link>
          <Link
            href={ROUTES.DASHBOARD}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
          >
            <Sparkles className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </Link>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

export default function InterviewRoomPlaceholderPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Entering room...</p>
          </div>
        </AuthenticatedLayout>
      }
    >
      <InterviewRoomPlaceholderContent />
    </Suspense>
  );
}
