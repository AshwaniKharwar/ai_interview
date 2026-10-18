/**
 * Gapless Audio Queue Player using Web Audio API.
 * Sequentially schedules incoming 24kHz PCM chunks with sub-millisecond precision
 * and provides instant flush upon candidate barge-in/interruption.
 */
export class GaplessAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private nextScheduledTime: number = 0;
  private activeNodes: Set<AudioBufferSourceNode> = new Set();
  private sampleRate: number = 24000;
  private onPlaybackComplete?: () => void;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  /**
   * Initializes or resumes the AudioContext on candidate user gesture.
   */
  public async init(audioContext?: AudioContext): Promise<void> {
    if (!this.audioCtx) {
      this.audioCtx = audioContext || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    if (!this.analyser) {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
    }

    if (!this.gainNode) {
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
  }

  public setPlaybackCompleteCallback(cb: () => void): void {
    this.onPlaybackComplete = cb;
  }

  /**
   * Enqueues and schedules a base64-encoded PCM16 chunk for sequential gapless playback.
   */
  public async queueBase64Chunk(base64Data: string): Promise<void> {
    if (!this.audioCtx || !this.gainNode) {
      await this.init();
    }

    if (!this.audioCtx || !this.gainNode) return;

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    try {
      // Decode base64 to binary byte array
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit signed PCM (little-endian) to 32-bit float audio buffer safely
      const sampleCount = Math.floor(len / 2);
      if (sampleCount === 0) return;

      const float32Samples = new Float32Array(sampleCount);
      const dataView = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Samples[i] = int16 / 32768.0;
      }

      const audioBuffer = this.audioCtx.createBuffer(
        1,
        float32Samples.length,
        this.sampleRate
      );
      audioBuffer.getChannelData(0).set(float32Samples);

      // Precision back-to-back scheduling
      const currentTime = this.audioCtx.currentTime;
      const startTime = Math.max(currentTime + 0.01, this.nextScheduledTime);

      const sourceNode = this.audioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.gainNode);

      this.activeNodes.add(sourceNode);
      this.nextScheduledTime = startTime + audioBuffer.duration;

      sourceNode.onended = () => {
        this.activeNodes.delete(sourceNode);
        if (this.activeNodes.size === 0 && this.onPlaybackComplete) {
          this.onPlaybackComplete();
        }
      };

      sourceNode.start(startTime);
    } catch (err) {
      console.error("Failed to decode and queue audio chunk:", err);
    }
  }

  /**
   * Instantly stops and clears all scheduled audio chunks when an interrupt occurs.
   */
  public flush(): void {
    for (const node of this.activeNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // Node may already have finished
      }
    }
    this.activeNodes.clear();
    if (this.audioCtx) {
      this.nextScheduledTime = this.audioCtx.currentTime;
    } else {
      this.nextScheduledTime = 0;
    }
  }

  /**
   * Returns current frequency spectrum data for visualizer.
   */
  public getFrequencyData(array: Uint8Array<ArrayBuffer>): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  /**
   * Calculates overall playback volume level (0.0 to 1.0).
   */
  public getAudioLevel(): number {
    if (!this.analyser) return 0;
    const buffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.analyser.getByteFrequencyData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    return Math.min(1.0, sum / (buffer.length * 128));
  }

  public get isPlaying(): boolean {
    return this.activeNodes.size > 0;
  }

  public async close(): Promise<void> {
    this.flush();
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      await this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
