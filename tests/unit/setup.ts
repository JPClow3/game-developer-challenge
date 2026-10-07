import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill AudioContext for JSDOM test environment if not present
if (typeof window !== 'undefined') {
  if (!window.AudioContext && !(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) {
    class MockAudioNode {
      connect = vi.fn().mockReturnThis();
      disconnect = vi.fn();
    }

    class MockGainNode extends MockAudioNode {
      gain = {
        value: 1,
        setValueAtTime: vi.fn((val: number) => {
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError("Failed to execute 'setValueAtTime' on 'AudioParam': The provided float value is non-finite.");
          }
        }),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      };
    }

    class MockAudioBufferSourceNode extends MockAudioNode {
      buffer: AudioBuffer | null = null;
      loop = false;
      playbackRate = { value: 1 };
      start = vi.fn();
      stop = vi.fn();
      onended: (() => void) | null = null;
    }

    class MockAudioContext {
      state: AudioContextState = 'suspended';
      sampleRate = 44100;
      currentTime = 0;
      destination = new MockAudioNode();
      resume = vi.fn().mockImplementation(async () => {
        this.state = 'running';
      });
      suspend = vi.fn().mockImplementation(async () => {
        this.state = 'suspended';
      });
      close = vi.fn().mockImplementation(async () => {
        this.state = 'closed';
      });
      createGain = vi.fn().mockImplementation(() => new MockGainNode());
      createBufferSource = vi.fn().mockImplementation(() => new MockAudioBufferSourceNode());
      decodeAudioData = vi.fn().mockImplementation(async () => {
        return {
          duration: 1.0,
          length: 44100,
          numberOfChannels: 2,
          sampleRate: 44100,
          getChannelData: vi.fn(() => new Float32Array(44100)),
        } as unknown as AudioBuffer;
      });
    }

    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
    });
  }

  // Mock Assets.load for JSDOM unit test environment
  try {
    const { Assets, Texture } = await import('pixi.js');
    vi.spyOn(Assets, 'load').mockImplementation((async () => {
      return Texture.EMPTY;
    }) as any);
  } catch {
    // PixiJS not loaded
  }

}
