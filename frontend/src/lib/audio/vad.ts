/**
 * Voice Activity Detector (VAD) with false-positive defense and adaptive silence tolerance.
 * Enforces a 250ms continuous speech duration filter before emitting barge-in interruption
 * and permits 1,200ms - 1,500ms of thinking pause silence before committing the turn.
 */
export interface VADConfig {
  speechThreshold?: number; // RMS energy threshold (default: 0.02)
  minSpeechDurationMs?: number; // False positive filter (default: 250ms)
  silenceDurationMs?: number; // Thinking pause tolerance (default: 1300ms)
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export class VoiceActivityDetector {
  private analyser: AnalyserNode;
  private animationFrameId: number | null = null;
  private isSpeaking = false;
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  private readonly speechThreshold: number;
  private readonly minSpeechDurationMs: number;
  private readonly silenceDurationMs: number;

  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;
  private onVolumeChange?: (volume: number) => void;

  constructor(sourceNode: AudioNode, config: VADConfig = {}) {
    const audioCtx = sourceNode.context as AudioContext;
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.3;

    sourceNode.connect(this.analyser);

    this.speechThreshold = config.speechThreshold ?? 0.018;
    this.minSpeechDurationMs = config.minSpeechDurationMs ?? 250;
    this.silenceDurationMs = config.silenceDurationMs ?? 1300;

    this.onSpeechStart = config.onSpeechStart;
    this.onSpeechEnd = config.onSpeechEnd;
    this.onVolumeChange = config.onVolumeChange;
  }

  public start(): void {
    const timeDomainData = new Float32Array(this.analyser.fftSize);

    const checkAudio = () => {
      this.analyser.getFloatTimeDomainData(timeDomainData);

      // Compute Root Mean Square (RMS) volume
      let sumSquares = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        sumSquares += timeDomainData[i] * timeDomainData[i];
      }
      const rms = Math.sqrt(sumSquares / timeDomainData.length);

      if (this.onVolumeChange) {
        this.onVolumeChange(Math.min(1.0, rms * 8));
      }

      const now = performance.now();

      if (rms >= this.speechThreshold) {
        // Voice detected
        this.silenceStartTime = null;

        if (!this.isSpeaking) {
          if (!this.speechStartTime) {
            this.speechStartTime = now;
          } else if (now - this.speechStartTime >= this.minSpeechDurationMs) {
            // Speech persisted >= 250ms: Valid speech started
            this.isSpeaking = true;
            this.speechStartTime = null;
            if (this.onSpeechStart) {
              this.onSpeechStart();
            }
          }
        }
      } else {
        // Silence detected
        this.speechStartTime = null;

        if (this.isSpeaking) {
          if (!this.silenceStartTime) {
            this.silenceStartTime = now;
          } else if (now - this.silenceStartTime >= this.silenceDurationMs) {
            // Silence persisted >= threshold: Candidate completed speaking
            this.isSpeaking = false;
            this.silenceStartTime = null;
            if (this.onSpeechEnd) {
              this.onSpeechEnd();
            }
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(checkAudio);
    };

    this.animationFrameId = requestAnimationFrame(checkAudio);
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.silenceStartTime = null;
  }
}
