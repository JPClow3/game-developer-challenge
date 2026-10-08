import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PixiCanvas } from '@/pixi/PixiCanvas';
import { GameSimulation } from '@/core/simulation/GameSimulation';
import { RENDERER_INIT_TIMEOUT_MS } from '@/game/StartupRecovery';

interface MockGame {
  app: { ticker: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> } };
  isReady: boolean; resolve: () => void; reject: (error: Error) => void;
  handleResize: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>;
}
const mocks = vi.hoisted(() => ({ games: [] as MockGame[] }));
vi.mock('@/pixi/PixiGame', () => ({ PixiGame: class {
  app = { ticker: { stop: vi.fn(), start: vi.fn() } };
  isReady = false;
  resolve!: () => void; reject!: (error: Error) => void;
  handleResize = vi.fn(); destroy = vi.fn();
  constructor() { mocks.games.push(this); }
  init() { return new Promise<void>((resolve, reject) => {
    this.resolve = () => { this.isReady = true; resolve(); }; this.reject = reject;
  }); }
} }));

const settings = { swapped: false, toggleFire: false, muted: false, volume: .8 };
let sim: GameSimulation;
let frames: FrameRequestCallback[];
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mocks.games.length = 0; frames = [];
  sim = new GameSimulation();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); sim.destroy(); consoleError.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Renderer lifetime boundaries', () => {
  it('does not announce ready when the timed-out view finishes before a retry', async () => {
    vi.useFakeTimers(); const status = vi.fn();
    render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    act(() => { vi.advanceTimersByTime(RENDERER_INIT_TIMEOUT_MS); });
    await act(async () => { mocks.games[0]!.resolve(); });
    expect(status).toHaveBeenLastCalledWith('failed'); expect(sim.isPaused).toBe(true);
    expect(status.mock.calls.filter(([state]) => state === 'ready')).toHaveLength(0);
  });
  it.each(['resolve', 'reject'] as const)('expires unfinished initialization and ignores its late %s after retry', async completion => {
    vi.useFakeTimers();
    const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    const first = mocks.games[0]!;
    act(() => { vi.advanceTimersByTime(RENDERER_INIT_TIMEOUT_MS - 1); });
    expect(status).toHaveBeenLastCalledWith('loading');
    act(() => { vi.advanceTimersByTime(1); });
    expect(status).toHaveBeenLastCalledWith('failed'); expect(sim.isPaused).toBe(true);
    expect(first.destroy).toHaveBeenCalledTimes(1); expect(sim.tickCount).toBe(0);
    view.rerender(<PixiCanvas simulation={sim} settings={settings} rendererAttempt={1} onRendererStateChange={status} />);
    const second = mocks.games[1]!;
    await act(async () => { second.resolve(); });
    status.mockClear(); consoleError.mockClear();
    await act(async () => {
      if (completion === 'resolve') first.resolve(); else first.reject(new Error('Late timeout rejection'));
    });
    act(() => { vi.advanceTimersByTime(RENDERER_INIT_TIMEOUT_MS * 2); });
    expect(status).not.toHaveBeenCalled(); expect(consoleError).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled(); expect(sim.isPaused).toBe(true);
    expect((window as any).__PIXI_GAME__).toBe(second);
  });

  it('clears the initialization deadline on unmount', () => {
    vi.useFakeTimers(); const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    view.unmount(); status.mockClear(); consoleError.mockClear();
    act(() => { vi.advanceTimersByTime(RENDERER_INIT_TIMEOUT_MS * 2); });
    expect(status).not.toHaveBeenCalled(); expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.games[0]!.destroy).toHaveBeenCalledTimes(1);
  });
  it('pauses and clears inputs on context loss, then restores drawing without resuming', async () => {
    const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    const game = mocks.games[0]!;
    await act(async () => { game.resolve(); });
    sim.setInputs({ throttle: 1, fireFront: true });
    const canvas = view.getByTestId('combat-canvas');
    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => { canvas.dispatchEvent(lost); });
    expect(lost.defaultPrevented).toBe(true); expect(sim.isPaused).toBe(true);
    expect((sim as any).currentInput.throttle).toBe(0);
    expect(game.app.ticker.stop).toHaveBeenCalled(); expect(status).toHaveBeenLastCalledWith('lost');
    act(() => { canvas.dispatchEvent(new Event('webglcontextrestored')); frames[0]!(0); });
    expect(game.handleResize).toHaveBeenCalledTimes(1); expect(game.app.ticker.start).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith('ready'); expect(sim.isPaused).toBe(true);
  });

  it('reports initialization failure and retries using the same paused simulation', async () => {
    const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    const first = mocks.games[0]!;
    await act(async () => { first.reject(new Error('GPU unavailable')); });
    expect(status).toHaveBeenLastCalledWith('failed'); expect(sim.isPaused).toBe(true);
    expect(first.destroy).toHaveBeenCalled();
    view.rerender(<PixiCanvas simulation={sim} settings={settings} rendererAttempt={1} onRendererStateChange={status} />);
    const second = mocks.games[1]!;
    await act(async () => { second.resolve(); });
    expect(status).toHaveBeenLastCalledWith('ready'); expect(sim.isPaused).toBe(true);
    expect((window as any).__PIRATE_SIMULATION__).toBe(sim); expect(sim.tickCount).toBe(0);
    expect(view.queryAllByTestId('combat-canvas')).toHaveLength(1);
  });

  it('ignores an old restoration frame after renderer replacement', async () => {
    const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    const first = mocks.games[0]!; await act(async () => { first.resolve(); });
    const canvas = view.getByTestId('combat-canvas');
    act(() => { canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); canvas.dispatchEvent(new Event('webglcontextrestored')); });
    view.rerender(<PixiCanvas simulation={sim} settings={settings} rendererAttempt={1} onRendererStateChange={status} />);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    act(() => { frames[0]!(0); canvas.dispatchEvent(new Event('webglcontextrestored')); });
    expect(first.app.ticker.start).not.toHaveBeenCalled(); expect(status).toHaveBeenLastCalledWith('loading');
  });

  it.each(['resolve', 'reject'] as const)('ignores late initialization %s after unmount', async completion => {
    const status = vi.fn();
    const view = render(<PixiCanvas simulation={sim} settings={settings} onRendererStateChange={status} />);
    const first = mocks.games[0]!, canvas = view.getByTestId('combat-canvas');
    view.unmount(); status.mockClear();
    await act(async () => {
      if (completion === 'resolve') first.resolve(); else first.reject(new Error('Late error'));
      canvas.dispatchEvent(new Event('webglcontextlost')); canvas.dispatchEvent(new Event('webglcontextrestored'));
    });
    expect(status).not.toHaveBeenCalled(); expect(first.destroy).toHaveBeenCalled();
    expect((window as any).__PIXI_GAME__).toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
