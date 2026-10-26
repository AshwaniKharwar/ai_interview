"use client";

import React, { useEffect, useRef } from "react";
import { Bot, User as UserIcon, MessageSquare } from "lucide-react";
import { TranscriptEntry } from "@/types/interview";

interface LiveTranscriptProps {
  transcripts: TranscriptEntry[];
  interimCandidateText?: string;
}

export function LiveTranscript({
  transcripts,
  interimCandidateText,
}: LiveTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as messages stream in
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcripts, interimCandidateText]);

  return (
    <div className="flex flex-col h-full rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <MessageSquare className="h-4 w-4 text-indigo-400" />
          <span>Live Conversation History</span>
        </div>
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          STT & TTS Stream
        </span>
      </div>

      {/* Transcript Log */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto space-y-4 text-xs scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        {transcripts.length === 0 && !interimCandidateText && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6 space-y-2">
            <Bot className="h-8 w-8 text-slate-600 animate-pulse" />
            <p className="text-xs">The interview session is starting.</p>
            <p className="text-[11px] text-slate-600">
              Spoken conversation turns and interim transcripts will appear here in real time.
            </p>
          </div>
        )}

        {transcripts.map((entry) => {
          const isAi = entry.speaker === "ai";

          return (
            <div
              key={entry.id}
              className={`flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150 ${
                isAi ? "items-start" : "items-start flex-row-reverse"
              }`}
            >
              {/* Speaker Avatar */}
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isAi
                    ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-400"
                    : "bg-emerald-600/20 border border-emerald-500/30 text-emerald-400"
                }`}
              >
                {isAi ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                  isAi
                    ? "bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-sm"
                    : "bg-indigo-600/30 text-indigo-100 border border-indigo-500/40 rounded-tr-sm"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-[11px] text-slate-300">
                    {isAi ? "AI Interviewer" : "You"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{entry.text}</p>
              </div>
            </div>
          );
        })}

        {/* Interim Speech Preview (Candidate currently speaking) */}
        {interimCandidateText && (
          <div className="flex gap-3 items-start flex-row-reverse animate-in fade-in duration-100">
            <div className="h-7 w-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <UserIcon className="h-4 w-4 animate-pulse" />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed bg-emerald-950/20 text-emerald-200/80 border border-dashed border-emerald-500/40">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Transcribing live speech...</span>
              </div>
              <p className="italic">{interimCandidateText}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
