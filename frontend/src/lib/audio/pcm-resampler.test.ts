import { describe, expect, it } from "bun:test";
import { PCM_RESAMPLER_WORKLET_CODE } from "./pcm-resampler.worklet";

interface MockProcessorInstance {
  port: {
    postMessage: (buf: ArrayBuffer) => void;
  };
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, unknown>
  ) => boolean;
}

type MockProcessorConstructor = new () => MockProcessorInstance;

describe("PCMResamplerProcessor Worklet Code", () => {
  it("contains valid JavaScript syntax and registers processor", () => {
    // Should be able to parse as valid JavaScript
    expect(() => new Function(PCM_RESAMPLER_WORKLET_CODE)()).toThrow(); // throws ReferenceError on execution because AudioWorkletProcessor is undefined in node/bun
    
    // Verify by simulating the AudioWorklet global scope
    const mockAudioWorkletScope = {
      AudioWorkletProcessor: class {
        port = { postMessage: () => {} };
      },
      registerProcessor: (name: string, processorCls: unknown) => {
        expect(name).toBe("pcm-resampler-processor");
        expect(processorCls).toBeDefined();
      },
      sampleRate: 48000,
    };

    const fn = new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      "sampleRate",
      PCM_RESAMPLER_WORKLET_CODE
    );

    expect(() => {
      fn(
        mockAudioWorkletScope.AudioWorkletProcessor,
        mockAudioWorkletScope.registerProcessor,
        mockAudioWorkletScope.sampleRate
      );
    }).not.toThrow();
  });

  it("accurately resamples 48kHz audio into 16kHz across multiple 128-sample blocks without sample loss", () => {
    let registeredProcessorClass: MockProcessorConstructor | null = null;

    const mockAudioWorkletScope = {
      AudioWorkletProcessor: class {
        port = {
          postMessage: () => {},
        };
      },
      registerProcessor: (name: string, processorCls: unknown) => {
        registeredProcessorClass = processorCls as MockProcessorConstructor;
      },
      sampleRate: 48000,
    };

    const fn = new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      "sampleRate",
      PCM_RESAMPLER_WORKLET_CODE
    );
    fn(
      mockAudioWorkletScope.AudioWorkletProcessor,
      mockAudioWorkletScope.registerProcessor,
      mockAudioWorkletScope.sampleRate
    );

    expect(registeredProcessorClass).not.toBeNull();
    const processor = new registeredProcessorClass!();
    const postedBuffers: ArrayBuffer[] = [];
    processor.port.postMessage = (buf: ArrayBuffer) => {
      postedBuffers.push(buf);
    };

    // Simulate 375 blocks of 128 samples = 48,000 samples (1 full second at 48kHz)
    let totalOutputSamples = 0;
    const blockSize = 128;
    const totalBlocks = 375; // 375 * 128 = 48,000 samples

    for (let b = 0; b < totalBlocks; b++) {
      const block = new Float32Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        // Continuous sine wave
        const continuousIndex = b * blockSize + i;
        block[i] = Math.sin((2 * Math.PI * 440 * continuousIndex) / 48000);
      }

      processor.process([[block]], [[]], {});
    }

    for (const buf of postedBuffers) {
      const pcm16 = new Int16Array(buf);
      totalOutputSamples += pcm16.length;
    }

    // 48,000 input samples / 3 (ratio 48k/16k) must yield EXACTLY 16,000 output samples
    expect(totalOutputSamples).toBe(16000);
  });

  it("handles 44.1kHz audio downsampling across quantum boundaries without discarding remainder samples", () => {
    let registeredProcessorClass: MockProcessorConstructor | null = null;

    const mockAudioWorkletScope = {
      AudioWorkletProcessor: class {
        port = {
          postMessage: () => {},
        };
      },
      registerProcessor: (name: string, processorCls: unknown) => {
        registeredProcessorClass = processorCls as MockProcessorConstructor;
      },
      sampleRate: 44100,
    };

    const fn = new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      "sampleRate",
      PCM_RESAMPLER_WORKLET_CODE
    );
    fn(
      mockAudioWorkletScope.AudioWorkletProcessor,
      mockAudioWorkletScope.registerProcessor,
      mockAudioWorkletScope.sampleRate
    );

    expect(registeredProcessorClass).not.toBeNull();
    const processor = new registeredProcessorClass!();
    const postedBuffers: ArrayBuffer[] = [];
    processor.port.postMessage = (buf: ArrayBuffer) => {
      postedBuffers.push(buf);
    };

    // Simulate 350 blocks of 128 samples = 44,800 samples (~1.01587 seconds at 44.1kHz)
    const blockSize = 128;
    const totalBlocks = 350;
    const totalInputSamples = totalBlocks * blockSize; // 44,800

    for (let b = 0; b < totalBlocks; b++) {
      const block = new Float32Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        const continuousIndex = b * blockSize + i;
        block[i] = Math.sin((2 * Math.PI * 440 * continuousIndex) / 44100);
      }

      processor.process([[block]], [[]], {});
    }

    let totalOutputSamples = 0;
    for (const buf of postedBuffers) {
      const pcm16 = new Int16Array(buf);
      totalOutputSamples += pcm16.length;
    }

    // Expected output samples: 44800 / (44100 / 16000) = 44800 / 2.75625 = 16253.968...
    // With continuous phase tracking, totalOutputSamples must be within 1 sample of expected.
    const expected = Math.floor(totalInputSamples / (44100 / 16000));
    expect(Math.abs(totalOutputSamples - expected)).toBeLessThanOrEqual(1);
  });

  it("handles 16kHz direct pass-through correctly", () => {
    let registeredProcessorClass: MockProcessorConstructor | null = null;

    const mockAudioWorkletScope = {
      AudioWorkletProcessor: class {
        port = {
          postMessage: () => {},
        };
      },
      registerProcessor: (name: string, processorCls: unknown) => {
        registeredProcessorClass = processorCls as MockProcessorConstructor;
      },
      sampleRate: 16000,
    };

    const fn = new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      "sampleRate",
      PCM_RESAMPLER_WORKLET_CODE
    );
    fn(
      mockAudioWorkletScope.AudioWorkletProcessor,
      mockAudioWorkletScope.registerProcessor,
      mockAudioWorkletScope.sampleRate
    );

    expect(registeredProcessorClass).not.toBeNull();
    const processor = new registeredProcessorClass!();
    let receivedPcm: Int16Array | null = null;
    processor.port.postMessage = (buf: ArrayBuffer) => {
      receivedPcm = new Int16Array(buf);
    };

    const block = new Float32Array([1.0, -1.0, 0.0, 0.5]);
    processor.process([[block]], [[]], {});

    expect(receivedPcm).not.toBeNull();
    expect(receivedPcm!.length).toBe(4);
    expect(receivedPcm![0]).toBe(32767);
    expect(receivedPcm![1]).toBe(-32768);
    expect(receivedPcm![2]).toBe(0);
    expect(receivedPcm![3]).toBe(Math.floor(0.5 * 32767));
  });
});
