import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('does not attach simulation mutation globals in production', async () => {
  vi.resetModules();
  vi.stubEnv('DEV', false); vi.stubEnv('MODE', 'production');
  const { SimulationBridge } = await import('../../../src/core/bridge/SimulationBridge');
  const bridge = new SimulationBridge();
  expect((window as any).__GAME_SIMULATION__).toBeUndefined();
  expect((window as any).__PIRATE_SIMULATION__).toBeUndefined();
  bridge.destroy();
});

it('allows deterministic controls in an explicit test build', async () => {
  vi.resetModules();
  vi.stubEnv('DEV', false); vi.stubEnv('MODE', 'test');
  const { SimulationBridge } = await import('../../../src/core/bridge/SimulationBridge');
  const bridge = new SimulationBridge();
  expect((window as any).__GAME_SIMULATION__.setPlayerHealth).toBeTypeOf('function');
  bridge.destroy();
  expect((window as any).__GAME_SIMULATION__).toBeUndefined();
});
