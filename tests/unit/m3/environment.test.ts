import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it.each([
  [undefined, true],
  ['true', true],
  ['false', false],
] as const)('production fixture mode for VITE_USE_MSW=%s is %s', async (value, expected) => {
  vi.resetModules();
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_USE_MSW', value);
  const { useMockApi } = await import('../../../src/api/environment');
  expect(useMockApi).toBe(expected);
});
