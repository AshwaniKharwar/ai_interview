"use client";

import React, { useEffect, useState } from "react";
import { Mic, Headphones, Volume2, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

interface DeviceCheckModalProps {
  isOpen: boolean;
  onJoin: () => void;
  isConnecting?: boolean;
  errorMessage?: string | null;
}

export function DeviceCheckModal({
  isOpen,
  onJoin,
  isConnecting = false,
  errorMessage,
}: DeviceCheckModalProps) {
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [testedAudio, setTestedAudio] = useState(false);

  // Quick mic check
  useEffect(() => {
    if (!isOpen) return;

    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        setHasMicPermission(true);
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(s);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const update = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          setMicLevel(Math.min(100, Math.round((sum / (data.length * 128)) * 100)));
          animId = requestAnimationFrame(update);
        };
        update();
      })
      .catch(() => {
        setHasMicPermission(false);
      });

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close().catch(() => {});
    };
  }, [isOpen]);

  const playTestTone = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTestedAudio(true);
    } catch {
      // AudioContext policy
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-6 text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Audio & Equipment Setup</h2>
            <p className="text-xs text-slate-400">
              Ensure clear audio transmission for real-time AI speech interaction.
            </p>
          </div>
        </div>

        {/* Headphone Advisory Alert */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
          <Headphones className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Headphones Recommended: </span>
            Using headphones or a headset prevents speaker feedback and eliminates false barge-in
            interruptions during natural dialogue.
          </div>
        </div>

        {/* Equipment Check Sections */}
        <div className="space-y-3.5">
          {/* Microphone Check */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mic className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-medium text-slate-300">Microphone Input</span>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  hasMicPermission
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : hasMicPermission === false
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {hasMicPermission ? "Connected" : hasMicPermission === false ? "Permission Denied" : "Detecting..."}
              </span>
            </div>

            {/* Level meter */}
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-75"
                style={{ width: `${micLevel}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Speak into your microphone to verify the volume meter responds.
            </p>
          </div>

          {/* Speaker Check */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Volume2 className="h-4 w-4 text-indigo-400" />
              <div>
                <div className="text-xs font-medium text-slate-300">Speaker Output</div>
                <div className="text-[11px] text-slate-500">
                  {testedAudio ? "Audio tested successfully" : "Test playback clarity"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={playTestTone}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Play Tone
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onJoin}
          disabled={isConnecting || hasMicPermission === false}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting to Voice Gateway...</span>
            </>
          ) : (
            <>
              <span>Enter Interview Room</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
