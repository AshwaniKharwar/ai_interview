"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  CheckCircle2,
  AlertCircle,
  Activity,
  RefreshCw,
} from "lucide-react";

export function DeviceTester() {
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const requestHardwareAccess = async () => {
    setErrorMessage(null);
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;
      setHasPermissions(true);
      setVideoActive(true);
      setAudioActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Initialize Web Audio API for live mic meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize to percentage 0 - 100
        const percentage = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(percentage);
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      setHasPermissions(false);
      setErrorMessage(
        "Camera or microphone access was denied or unavailable. Please enable permissions in your browser."
      );
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoActive(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioActive(audioTrack.enabled);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => null);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-400" />
          <h4 className="text-sm font-semibold text-slate-100">
            A/V Hardware Readiness Check
          </h4>
        </div>
        <span className="text-[11px] text-slate-400">Pre-Interview Diagnostics</span>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {hasPermissions ? (
        <div className="space-y-4">
          {/* Video Preview */}
          <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                !videoActive ? "hidden" : "block"
              }`}
            />
            {!videoActive && (
              <div className="flex flex-col items-center gap-2 text-slate-500 text-xs">
                <VideoOff className="h-8 w-8" />
                <span>Camera feed is muted</span>
              </div>
            )}

            {/* Quick Action Overlay Controls */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-xs p-1.5 rounded-full border border-slate-700/80 shadow-md">
              <button
                type="button"
                onClick={toggleAudio}
                className={`p-2 rounded-full transition-colors ${
                  audioActive
                    ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "bg-rose-500 text-white"
                }`}
                title={audioActive ? "Mute Microphone" : "Unmute Microphone"}
              >
                {audioActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={toggleVideo}
                className={`p-2 rounded-full transition-colors ${
                  videoActive
                    ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "bg-rose-500 text-white"
                }`}
                title={videoActive ? "Turn Off Camera" : "Turn On Camera"}
              >
                {videoActive ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Microphone Live Level Meter */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-indigo-400" />
                Live Microphone Volume:
              </span>
              <span className="font-mono text-[11px] text-slate-300">
                {audioActive ? `${audioLevel}%` : "Muted"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  audioLevel > 70
                    ? "bg-rose-500"
                    : audioLevel > 30
                    ? "bg-emerald-500"
                    : "bg-indigo-500"
                }`}
                style={{ width: `${audioActive ? audioLevel : 0}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Audio & Video peripherals verified for Phase 2 Live Session</span>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 px-4 space-y-3 rounded-xl bg-slate-950/60 border border-slate-800">
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Test your camera and microphone to ensure real-time audio/video streaming works properly in the live interview room.
          </p>
          <button
            type="button"
            onClick={requestHardwareAccess}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/25 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Test Camera & Microphone</span>
          </button>
        </div>
      )}
    </div>
  );
}
