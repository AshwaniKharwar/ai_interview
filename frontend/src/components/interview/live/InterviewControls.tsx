"use client";

import React, { useState } from "react";
import { Mic, MicOff, Send, PhoneOff, Keyboard, CheckCircle, AlertTriangle } from "lucide-react";
import { LiveSessionState } from "@/types/interview";

interface InterviewControlsProps {
  state: LiveSessionState;
  isMuted: boolean;
  onToggleMute: () => void;
  onFinishAnswer: () => void;
  onSendTextMessage: (text: string) => void;
  onEndSession: () => void;
}

export function InterviewControls({
  state,
  isMuted,
  onToggleMute,
  onFinishAnswer,
  onSendTextMessage,
  onEndSession,
}: InterviewControlsProps) {
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (textMessage.trim()) {
      onSendTextMessage(textMessage.trim());
      setTextMessage("");
      setShowTextInput(false);
    }
  };

  const isListening = state === "LISTENING";

  return (
    <div className="w-full bg-slate-900/90 border-t border-slate-800 p-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-3">
        {/* Optional Text Fallback Input Drawer */}
        {showTextInput && (
          <form onSubmit={handleSendText} className="flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <input
              type="text"
              value={textMessage}
              onChange={(e) => setTextMessage(e.target.value)}
              placeholder="Type your answer or technical clarification..."
              className="flex-1 px-4 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              autoFocus
            />
            <button
              type="submit"
              disabled={!textMessage.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        )}

        {/* Main Action Control Bar */}
        <div className="flex items-center justify-between gap-4">
          {/* Left Controls: Mute & Text Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                isMuted
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span className="hidden sm:inline">{isMuted ? "Unmute" : "Mute"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTextInput(!showTextInput)}
              className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
                showTextInput
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
              }`}
              title="Toggle Text Input Fallback"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>

          {/* Center Primary Action: "Finish Answer" Button */}
          <button
            type="button"
            onClick={onFinishAnswer}
            disabled={!isListening}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all shadow-lg ${
              isListening
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 ring-2 ring-emerald-500/50 animate-pulse"
                : "bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed"
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            <span>Finish Answer</span>
          </button>

          {/* Right Action: End Session */}
          <div>
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/30 text-xs font-semibold transition"
            >
              <PhoneOff className="h-4 w-4" />
              <span className="hidden sm:inline">End Interview</span>
            </button>
          </div>
        </div>
      </div>

      {/* End Session Confirmation Dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">End Interview Early?</h3>
                <p className="text-xs text-slate-400">Your completed turns will be saved for scoring.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndSession();
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition"
              >
                Confirm End
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
