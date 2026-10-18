import { useCallback, useEffect, useRef, useState } from "react";
import { liveSessionApi } from "@/lib/api";
import { GaplessAudioPlayer } from "@/lib/audio/audio-player";
import { createResamplerWorkletUrl } from "@/lib/audio/pcm-resampler.worklet";
import { VoiceActivityDetector } from "@/lib/audio/vad";
import { getAccessToken } from "@/lib/cookies";
import {
  ActiveStageInfo,
  InterviewSession,
  LiveSessionState,
  TranscriptEntry,
} from "@/types/interview";

export function useLiveInterview(sessionId: string) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "connected" | "error" | "closed"
  >("idle");
  const [liveState, setLiveState] = useState<LiveSessionState>("INIT");
  const [activeStage, setActiveStage] = useState<ActiveStageInfo | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interimCandidateText, setInterimCandidateText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(1800);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Audio & Hardware Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<GaplessAudioPlayer | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const liveStateRef = useRef<LiveSessionState>("INIT");

  // Keep liveStateRef in sync with liveState
  useEffect(() => {
    liveStateRef.current = liveState;
  }, [liveState]);

  // Load session metadata on mount
  useEffect(() => {
    let isMounted = true;
    liveSessionApi
      .getSession(sessionId)
      .then((data) => {
        if (isMounted) {
          setSession(data);
          setTimeRemaining(data.duration_minutes * 60);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(err.message || "Failed to load session details.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  // Main join function triggered by user gesture
  const joinSession = useCallback(async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage(null);

      // 1. Initialize AudioContext under candidate click event
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // 2. Initialize Gapless Audio Player
      const player = new GaplessAudioPlayer(24000);
      await player.init(audioCtx);
      audioPlayerRef.current = player;

      // 3. Capture microphone with hardware AEC and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 4. Load AudioWorklet for 16kHz PCM downsampling
      const workletUrl = createResamplerWorkletUrl();
      await audioCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const resamplerNode = new AudioWorkletNode(audioCtx, "pcm-resampler-processor");
      sourceNode.connect(resamplerNode);
      workletNodeRef.current = resamplerNode;

      // 5. Connect WebSocket
      const wsUrl = liveSessionApi.getLiveWebSocketUrl(sessionId);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      // Stream binary PCM frames from AudioWorklet to WebSocket only when AI is listening
      resamplerNode.port.onmessage = (e) => {
        if (
          ws.readyState === WebSocket.OPEN &&
          !isMuted &&
          liveStateRef.current === "LISTENING"
        ) {
          ws.send(e.data);
        }
      };

      // 6. Setup Voice Activity Detector (VAD)
      const vad = new VoiceActivityDetector(sourceNode, {
        speechThreshold: 0.016,
        minSpeechDurationMs: 250, // 250ms false positive defense
        silenceDurationMs: 1300, // 1.3s thinking pause tolerance
        onSpeechStart: () => {
          if (liveStateRef.current === "AI_SPEAKING") {
            // Barge-in detected! Instantly flush audio player
            player.flush();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "interrupt", timestamp: Date.now() }));
            }
            setLiveState("INTERRUPT_FLUSH");
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "speech_started", timestamp: Date.now() }));
          }
        },
        onSpeechEnd: () => {
          if (
            ws.readyState === WebSocket.OPEN &&
            liveStateRef.current === "LISTENING"
          ) {
            ws.send(JSON.stringify({ type: "speech_stopped", timestamp: Date.now() }));
          }
        },
        onVolumeChange: (vol) => {
          if (liveStateRef.current === "LISTENING") {
            setVolumeLevel(vol);
          }
        },
      });
      vad.start();
      vadRef.current = vad;

      // Monitor AI playback audio level for visualizer
      const monitorInterval = setInterval(() => {
        if (liveStateRef.current === "AI_SPEAKING" && player.isPlaying) {
          setVolumeLevel(player.getAudioLevel());
        }
      }, 50);

      // 7. WebSocket Handlers
      ws.onopen = () => {
        setConnectionState("connected");
        const token = getAccessToken();
        if (token) {
          ws.send(JSON.stringify({ type: "auth", token }));
        }
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "auth_success") {
            if (data.active_stage) {
              setActiveStage(data.active_stage);
            }
            // Signal ready to begin stage 0 opening greeting
            ws.send(JSON.stringify({ type: "client_ready" }));
          } else if (data.type === "ai_audio_chunk") {
            if (data.data) {
              await player.queueBase64Chunk(data.data);
            }
          } else if (data.type === "transcript_update") {
            const speaker = data.speaker as "ai" | "candidate";
            const text = data.text as string;
            const isFinal = Boolean(data.is_final);

            if (speaker === "candidate") {
              if (isFinal) {
                setTranscripts((prev) => [
                  ...prev,
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    speaker: "candidate",
                    text,
                    isFinal: true,
                    timestamp: Date.now(),
                  },
                ]);
                setInterimCandidateText("");
              } else {
                setInterimCandidateText(text);
              }
            } else if (speaker === "ai") {
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === "ai" && !last.isFinal) {
                  // Update current streaming AI turn
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...last,
                      text,
                      isFinal,
                    },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    speaker: "ai",
                    text,
                    isFinal,
                    timestamp: Date.now(),
                  },
                ];
              });
            }
          } else if (data.type === "state_change") {
            const nextState = data.state as LiveSessionState;
            setLiveState(nextState);
            if (data.time_remaining_seconds !== undefined) {
              setTimeRemaining(data.time_remaining_seconds);
            }
            if (data.current_stage) {
              setActiveStage((prev) =>
                prev
                  ? {
                      ...prev,
                      stage_id: data.current_stage,
                      stage_index: data.stage_index ?? prev.stage_index,
                      total_stages: data.total_stages ?? prev.total_stages,
                    }
                  : null
              );
            }
          } else if (data.type === "stage_transition") {
            setActiveStage((prev) =>
              prev
                ? {
                    ...prev,
                    stage_id: data.new_stage,
                    title: data.title,
                    stage_index: prev.stage_index + 1,
                  }
                : null
            );
          } else if (data.type === "interrupt_ack") {
            player.flush();
          } else if (data.type === "session_completed") {
            setIsComplete(true);
            setLiveState("COMPLETED");
          } else if (data.type === "error") {
            setErrorMessage(data.message || "An unexpected error occurred in live session.");
            if (data.fatal) {
              setConnectionState("error");
            }
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        setConnectionState("error");
        setErrorMessage("Connection error occurred. Please verify network and credentials.");
      };

      ws.onclose = (event) => {
        clearInterval(monitorInterval);
        if (event.code !== 1000) {
          setConnectionState("closed");
        }
      };
    } catch (err) {
      console.error("Error joining live interview session:", err);
      setConnectionState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to access microphone or connect."
      );
    }
  }, [sessionId, isMuted]);

  // Toggle mic mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  // Manual "Finish Answer" button
  const finishAnswer = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "finish_answer" }));
    }
  }, []);

  // Text message fallback
  const sendTextMessage = useCallback((text: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && text.trim()) {
      socketRef.current.send(JSON.stringify({ type: "text_message", text: text.trim() }));
    }
  }, []);

  // End interview session
  const endSession = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "end_session" }));
    }
  }, []);

  // Teardown and cleanup on unmount
  useEffect(() => {
    return () => {
      vadRef.current?.stop();
      audioPlayerRef.current?.close();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close(1000, "Component unmounted");
      }
    };
  }, []);

  return {
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
  };
}
