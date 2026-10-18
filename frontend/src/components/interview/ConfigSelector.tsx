"use client";

import React from "react";
import { Clock, UserCheck, Flame } from "lucide-react";

interface ConfigSelectorProps {
  durationMinutes: number;
  setDurationMinutes: (val: number) => void;
  difficultyLevel: string;
  setDifficultyLevel: (val: string) => void;
  interviewerPersona: string;
  setInterviewerPersona: (val: string) => void;
}

const DURATIONS = [
  {
    minutes: 15,
    title: "15 Minutes",
    desc: "Fast-paced screening covering core background & top project",
  },
  {
    minutes: 30,
    title: "30 Minutes (Standard)",
    desc: "Balanced technical architecture deep-dive & behavioral alignment",
  },
  {
    minutes: 45,
    title: "45 Minutes",
    desc: "In-depth system design, edge cases, failure recovery & leadership",
  },
];

const DIFFICULTIES = [
  {
    level: "easy",
    title: "Foundational",
    desc: "Core concepts, language fundamentals, and direct project walkthroughs",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    level: "medium",
    title: "Professional",
    desc: "Scalability, concurrency, distributed patterns, and trade-off evaluation",
    badgeColor: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  },
  {
    level: "hard",
    title: "Bar Raiser",
    desc: "Complex distributed failure modes, network partitions, and deep edge cases",
    badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
];

const PERSONAS = [
  {
    persona: "rigorous_collaborative",
    title: "Rigorous & Collaborative",
    desc: "Probing and thorough on architectural trade-offs, with a constructive peer mindset",
    icon: UserCheck,
  },
  {
    persona: "supportive_mentor",
    title: "Supportive Mentor",
    desc: "Encouraging tone with gentle nudges, ideal for exploratory or mock practice",
    icon: Clock,
  },
  {
    persona: "bar_raiser_architect",
    title: "Bar Raiser Architect",
    desc: "Zero fluff, high expectations, pressure-testing edge cases and scale limits",
    icon: Flame,
  },
];

export function ConfigSelector({
  durationMinutes,
  setDurationMinutes,
  difficultyLevel,
  setDifficultyLevel,
  interviewerPersona,
  setInterviewerPersona,
}: ConfigSelectorProps) {
  return (
    <div className="space-y-8">
      {/* Duration Options */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Interview Duration
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DURATIONS.map((dur) => {
            const isSelected = durationMinutes === dur.minutes;
            return (
              <button
                key={dur.minutes}
                type="button"
                onClick={() => setDurationMinutes(dur.minutes)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-100">
                    {dur.title}
                  </span>
                  <Clock
                    className={`h-4 w-4 ${
                      isSelected ? "text-indigo-400" : "text-slate-500"
                    }`}
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {dur.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Difficulty Level */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Difficulty & Rigor Level
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DIFFICULTIES.map((diff) => {
            const isSelected = difficultyLevel === diff.level;
            return (
              <button
                key={diff.level}
                type="button"
                onClick={() => setDifficultyLevel(diff.level)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-sm text-slate-100">
                    {diff.title}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${diff.badgeColor}`}
                  >
                    {diff.level}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {diff.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Persona Selector */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Interviewer Persona & Style
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PERSONAS.map((p) => {
            const isSelected = interviewerPersona === p.persona;
            const Icon = p.icon;
            return (
              <button
                key={p.persona}
                type="button"
                onClick={() => setInterviewerPersona(p.persona)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-semibold text-sm text-slate-100">
                    {p.title}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {p.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
