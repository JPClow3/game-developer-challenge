import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const entries = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
});
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

it('URL scenarios override session state, and switching updates the reproducible URL', async () => {
  sessionStorage.setItem('pirate_battle_msw_scenario', 'error_500');
  window.history.replaceState(null, '', '/?scenario=ranking_fails&scenarioSeed=42');
  const { ScenarioManager } = await import('../../../src/mocks/scenarios');
  const manager = ScenarioManager.getInstance();
  expect(manager.getScenario()).toBe('ranking_fails');
  manager.setScenario('history_fails');
  expect(new URL(window.location.href).searchParams.get('scenario')).toBe('history_fails');
});

it('invalid scenarios fall back safely and seeded delays reproduce for both endpoints', async () => {
  window.history.replaceState(null, '', '/?scenario=unknown&scenarioSeed=42');
  const { ScenarioManager } = await import('../../../src/mocks/scenarios');
  const manager = ScenarioManager.getInstance();
  expect(manager.getScenario()).toBe('success');
  manager.setScenario('out_of_order');
  const first = [manager.nextDelay('ranking'), manager.nextDelay('ranking'), manager.nextDelay('history'), manager.nextDelay('history')];
  expect(first[0]).toBeGreaterThan(first[1]!);
  expect(first[2]).toBeGreaterThan(first[3]!);
  manager.setScenario('out_of_order');
  expect([manager.nextDelay('ranking'), manager.nextDelay('ranking'), manager.nextDelay('history'), manager.nextDelay('history')]).toEqual(first);
});
