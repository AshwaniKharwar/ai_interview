"use client";

import React from "react";
import { LiveSessionState } from "@/types/interview";

interface AudioVisualizerProps {
  state: LiveSessionState;
  volumeLevel: number; // 0.0 to 1.0
}

export function AudioVisualizer({ state, volumeLevel }: AudioVisualizerProps) {
  // Normalize scale and glow
  const scale = 1 + Math.min(0.45, volumeLevel * 0.45);
  const glowOpacity = Math.min(0.9, 0.25 + volumeLevel * 0.65);

  const getTheme = () => {
    switch (state) {
      case "AI_SPEAKING":
        return {
          glow: "from-indigo-500/40 via-purple-500/30 to-transparent",
          core: "bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/50",
          border: "border-indigo-400/50",
          ring: "border-indigo-500/20",
          bars: "bg-indigo-400",
        };
      case "LISTENING":
        return {
          glow: "from-emerald-500/40 via-teal-500/30 to-transparent",
          core: "bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/50",
          border: "border-emerald-400/50",
          ring: "border-emerald-500/20",
          bars: "bg-emerald-400",
        };
      case "PROCESSING":
        return {
          glow: "from-amber-500/40 via-orange-500/30 to-transparent",
          core: "bg-gradient-to-tr from-amber-600 to-amber-500 shadow-amber-500/50 animate-pulse",
          border: "border-amber-400/50",
          ring: "border-amber-500/20",
          bars: "bg-amber-400",
        };
      case "INTERRUPT_FLUSH":
        return {
          glow: "from-rose-500/40 via-red-500/30 to-transparent",
          core: "bg-gradient-to-tr from-rose-600 to-red-500 shadow-rose-500/50",
          border: "border-rose-400/50",
          ring: "border-rose-500/20",
          bars: "bg-rose-400",
        };
      default:
        return {
          glow: "from-slate-700/30 via-slate-800/20 to-transparent",
          core: "bg-slate-800 shadow-slate-900/50",
          border: "border-slate-700",
          ring: "border-slate-800/30",
          bars: "bg-slate-600",
        };
    }
  };

  const theme = getTheme();

  return (
    <div className="relative flex flex-col items-center justify-center p-8">
      {/* Outer Glow Halo */}
      <div
        className={`absolute h-64 w-64 rounded-full bg-gradient-radial ${theme.glow} blur-3xl transition-all duration-150 pointer-events-none`}
        style={{
          opacity: glowOpacity,
          transform: `scale(${scale * 1.3})`,
        }}
      />

      {/* Concentric Decorative Rings */}
      <div
        className={`absolute h-56 w-56 rounded-full border ${theme.ring} animate-spin-slow transition-all duration-300 pointer-events-none`}
        style={{
          transform: `scale(${scale * 1.15})`,
        }}
      />
      <div
        className={`absolute h-48 w-48 rounded-full border border-dashed ${theme.ring} animate-reverse-spin transition-all duration-300 pointer-events-none`}
      />

      {/* Main Core Orb */}
      <div
        className={`relative h-32 w-32 rounded-full ${theme.core} border-2 ${theme.border} shadow-2xl flex items-center justify-center transition-all duration-100 ease-out`}
        style={{
          transform: `scale(${scale})`,
        }}
      >
        {/* Dynamic Voice Energy Frequency Bars Inside Orb */}
        <div className="flex items-center gap-1.5 h-10">
          {[0.4, 0.7, 1.0, 0.8, 0.5].map((factor, idx) => {
            const barHeight = Math.max(6, Math.min(36, volumeLevel * 40 * factor + 6));
            return (
              <span
                key={idx}
                className={`w-1.5 rounded-full ${theme.bars} transition-all duration-75`}
                style={{ height: `${barHeight}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
