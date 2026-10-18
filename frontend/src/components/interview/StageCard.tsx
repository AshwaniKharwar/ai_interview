"use client";

import React, { useState } from "react";
import {
  Clock,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Edit2,
  Check,
} from "lucide-react";
import { InterviewStage } from "@/types/interview";

interface StageCardProps {
  stage: InterviewStage;
  stageIndex: number;
  onUpdateStage: (updatedStage: InterviewStage) => void;
  onOpenRegenerate: (stage: InterviewStage) => void;
}

export function StageCard({
  stage,
  stageIndex,
  onUpdateStage,
  onOpenRegenerate,
}: StageCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [newQuestionInput, setNewQuestionInput] = useState("");
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  const handleStartEdit = (idx: number, currentText: string) => {
    setEditingQuestionIdx(idx);
    setQuestionText(currentText);
  };

  const handleSaveEdit = (idx: number) => {
    const updated = [...stage.starter_questions];
    updated[idx] = questionText;
    onUpdateStage({ ...stage, starter_questions: updated });
    setEditingQuestionIdx(null);
  };

  const handleDeleteQuestion = (idx: number) => {
    const updated = stage.starter_questions.filter((_, i) => i !== idx);
    onUpdateStage({ ...stage, starter_questions: updated });
  };

  const handleAddQuestion = () => {
    if (!newQuestionInput.trim()) return;
    onUpdateStage({
      ...stage,
      starter_questions: [...stage.starter_questions, newQuestionInput.trim()],
    });
    setNewQuestionInput("");
    setIsAddingQuestion(false);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xs transition-all hover:border-slate-700/80">
      {/* Stage Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
            {stageIndex + 1}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-slate-100">
                {stage.title}
              </h3>
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                <Clock className="h-3 w-3 text-indigo-400" />
                {stage.duration_minutes} mins
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                <Layers className="h-3 w-3 text-indigo-400" />
                {stage.min_turns}–{stage.max_turns} turns
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{stage.objective}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenRegenerate(stage)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            Regenerate Stage
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-5 space-y-5 border-t border-slate-800/80 pt-5">
          {/* Focus Areas */}
          {stage.focus_areas && stage.focus_areas.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Targeted Focus Areas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stage.focus_areas.map((area, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/60"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Starter Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
                Primary Probing Questions ({stage.starter_questions.length})
              </p>
              {!isAddingQuestion && (
                <button
                  type="button"
                  onClick={() => setIsAddingQuestion(true)}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Question
                </button>
              )}
            </div>

            <div className="space-y-2">
              {stage.starter_questions.map((q, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200"
                >
                  <span className="font-semibold text-indigo-400 shrink-0 mt-0.5">
                    Q{idx + 1}.
                  </span>
                  {editingQuestionIdx === idx ? (
                    <div className="flex-1 space-y-2">
                      <textarea
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        rows={2}
                        className="w-full p-2 rounded-lg bg-slate-900 border border-indigo-500/50 text-xs text-slate-100 focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(idx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-medium"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingQuestionIdx(null)}
                          className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="flex-1 leading-relaxed text-slate-200">{q}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(idx, q)}
                          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                          title="Edit question"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {stage.starter_questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(idx)}
                            className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title="Delete question"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {isAddingQuestion && (
                <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-500/40 space-y-2">
                  <textarea
                    autoFocus
                    value={newQuestionInput}
                    onChange={(e) => setNewQuestionInput(e.target.value)}
                    placeholder="Enter custom starter question for this stage..."
                    rows={2}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddQuestion}
                      className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium"
                    >
                      Save Question
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingQuestion(false);
                        setNewQuestionInput("");
                      }}
                      className="px-3 py-1 rounded-md bg-slate-800 text-slate-400 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rubric: Expected Signals & Red Flags */}
          {stage.probing_rubric && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Expected Positive Signals</span>
                </div>
                <ul className="space-y-1 text-xs text-slate-300">
                  {stage.probing_rubric.expected_signals.map((sig, i) => (
                    <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-emerald-400/80">•</span>
                      <span>{sig}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Red Flags & Warning Signs</span>
                </div>
                <ul className="space-y-1 text-xs text-slate-300">
                  {stage.probing_rubric.red_flags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-rose-400/80">•</span>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
