"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { uploadResumeApi } from "@/lib/api";
import { ResumeUploadResponse } from "@/types/interview";

interface ResumeUploaderProps {
  onUploadSuccess: (data: ResumeUploadResponse) => void;
  onClear: () => void;
  uploadedData: ResumeUploadResponse | null;
}

export function ResumeUploader({
  onUploadSuccess,
  onClear,
  uploadedData,
}: ResumeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setErrorMessage(null);

    // Validate size (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage("File exceeds 10MB maximum size limit.");
      return;
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "doc"].includes(ext)) {
      setErrorMessage("Unsupported file format. Please upload a PDF or Word document (.docx).");
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadResumeApi(file);
      result.filename = file.name;
      onUploadSuccess(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload and parse resume.";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {!uploadedData ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            isDragging
              ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
              : "border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
              {isUploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
              ) : (
                <UploadCloud className="h-7 w-7" />
              )}
            </div>

            <div>
              <p className="font-semibold text-slate-100 text-base">
                {isUploading ? "Uploading & Parsing Resume..." : "Click or drag & drop candidate resume"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports PDF or DOCX up to 10MB. Stored securely in Cloudflare R2.
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-[11px] text-slate-300 border border-slate-700/60 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Prompt Injection Guard & XML Delimiters Enforced</span>
            </div>
          </div>
        </div>
      ) : (
        /* Uploaded State Card */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">
                    {uploadedData.filename || "Resume Document"}
                  </p>
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Parsed & Stored in R2
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {uploadedData.char_count.toLocaleString()} characters extracted
                  {uploadedData.is_sparse && " (sparse text detected)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                {showPreview ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide Text Preview
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    Show Text Preview
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClear}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
                title="Remove resume"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Extracted Text Preview Accordion */}
          {showPreview && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 max-h-64 overflow-y-auto text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-indigo-600">
              {uploadedData.raw_text}
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
            <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>
              Secure Private Bucket. Access is granted only through short-lived presigned URLs.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
