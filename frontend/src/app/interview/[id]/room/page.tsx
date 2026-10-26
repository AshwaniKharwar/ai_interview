"use client";

import React, { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { DeviceCheckModal } from "@/components/interview/live/DeviceCheckModal";
import { StageProgressHeader } from "@/components/interview/live/StageProgressHeader";
import { AudioVisualizer } from "@/components/interview/live/AudioVisualizer";
import { ConversationalStatusBadge } from "@/components/interview/live/ConversationalStatusBadge";
import { LiveTranscript } from "@/components/interview/live/LiveTranscript";
import { InterviewControls } from "@/components/interview/live/InterviewControls";
import { useLiveInterview } from "@/hooks/useLiveInterview";
import { ROUTES } from "@/lib/constants";

function InterviewRoomContent() {
  const routeParams = useParams();
  const sessionId = routeParams.id as string;
  const [showSetupModal, setShowSetupModal] = useState(true);

  const {
    session,
    connectionState,
    liveState,
    activeStage,
    transcripts,
    interimCandidateText,
    isMuted,
    volumeLevel,
    timeRemaining,
    errorMessage,
    isComplete,
    joinSession,
    toggleMute,
    finishAnswer,
    sendTextMessage,
    endSession,
  } = useLiveInterview(sessionId);

  const handleJoin = async () => {
    await joinSession();
    setShowSetupModal(false);
  };

  const stages = session?.blueprint_json?.stages || [];

  return (
    <AuthenticatedLayout>
      {/* Pre-flight Equipment & Audio Check Modal */}
      <DeviceCheckModal
        isOpen={showSetupModal && connectionState === "idle"}
        onJoin={handleJoin}
        isConnecting={connectionState === "connecting"}
        errorMessage={errorMessage}
      />

      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto overflow-hidden">
        {/* Stage Progress Header */}
        <StageProgressHeader
          stages={stages}
          activeStage={activeStage}
          timeRemainingSeconds={timeRemaining}
        />

        {/* Global Error Alert Banner */}
        {errorMessage && connectionState === "error" && (
          <div className="m-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleJoin}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Session Completed View */}
        {isComplete ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-3xl bg-slate-900/80 border border-slate-800 p-8 text-center space-y-6 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-100">Interview Completed!</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your spoken responses have been recorded and transcribed.
                  The AI scoring and evaluation engine will synthesize your comprehensive report.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link
                  href={ROUTES.DASHBOARD}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
                >
                  Return to Dashboard
                </Link>
                <Link
                  href={ROUTES.INTERVIEW_PREPARE(sessionId)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                >
                  Review Blueprint
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Live Two-Way Interaction View */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
            {/* Left Panel: Audio Visualizer & Conversational State (5 cols) */}
            <div className="lg:col-span-5 flex flex-col items-center justify-between rounded-2xl bg-slate-900/30 border border-slate-800/80 p-6 backdrop-blur-sm relative overflow-hidden">
              {/* Target Role & Stage Info */}
              <div className="w-full text-center space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {session?.job_title || "Live Interview"}
                </span>
                <h3 className="text-sm font-semibold text-slate-200">
                  {activeStage?.title || "Warmup & Overview"}
                </h3>
              </div>

              {/* Dynamic 3D Glowing Orb Visualizer */}
              <div className="my-auto">
                <AudioVisualizer state={liveState} volumeLevel={volumeLevel} />
              </div>

              {/* Conversational Status Badge */}
              <div className="w-full">
                <ConversationalStatusBadge state={liveState} />
              </div>
            </div>

            {/* Right Panel: Auto-Scrolling Live Transcript (7 cols) */}
            <div className="lg:col-span-7 h-full min-h-[300px]">
              <LiveTranscript
                transcripts={transcripts}
                interimCandidateText={interimCandidateText}
              />
            </div>
          </div>
        )}

        {/* Bottom Action Controls Bar */}
        {!isComplete && (
          <InterviewControls
            state={liveState}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onFinishAnswer={finishAnswer}
            onSendTextMessage={sendTextMessage}
            onEndSession={endSession}
          />
        )}
      </div>
    </AuthenticatedLayout>
  );
}

export default function InterviewRoomPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Loading interview room...</p>
          </div>
        </AuthenticatedLayout>
      }
    >
      <InterviewRoomContent />
    </Suspense>
  );
}
