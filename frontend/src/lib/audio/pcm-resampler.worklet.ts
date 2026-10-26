/**
 * AudioWorklet processor script content for real-time downsampling
 * of microphone input from context sample rate (typically 44.1kHz or 48kHz)
 * to 16,000Hz 16-bit linear PCM mono.
 */
export const PCM_RESAMPLER_WORKLET_CODE = `
class PCMResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const channelData = input[0];
    const sourceSampleRate = sampleRate;

    if (sourceSampleRate === this.targetSampleRate) {
      this.phase = 0;
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      return true;
    }

    // Linear interpolation downsampling tracking phase across quantum boundaries
    const ratio = sourceSampleRate / this.targetSampleRate;
    let srcIndex = this.phase;
    const outputSamples = [];

    while (srcIndex < channelData.length) {
      const iFloor = Math.floor(srcIndex);
      const iCeil = Math.min(channelData.length - 1, iFloor + 1);
      const frac = srcIndex - iFloor;

      const sample = channelData[iFloor] * (1 - frac) + channelData[iCeil] * frac;
      outputSamples.push(Math.max(-1, Math.min(1, sample)));
      srcIndex += ratio;
    }

    this.phase = srcIndex - channelData.length;

    if (outputSamples.length > 0) {
      const pcm16 = new Int16Array(outputSamples.length);
      for (let i = 0; i < outputSamples.length; i++) {
        const s = outputSamples[i];
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-resampler-processor", PCMResamplerProcessor);
`;

/**
 * Creates an object URL for loading the AudioWorklet processor safely in browser.
 */
export function createResamplerWorkletUrl(): string {
  const blob = new Blob([PCM_RESAMPLER_WORKLET_CODE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
