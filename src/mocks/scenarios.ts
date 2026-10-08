import type { MswScenarioId } from '../types/api';
import { MSW_SCENARIOS } from '../types/api';

const SCENARIO_STORAGE_KEY = 'pirate_battle_msw_scenario';
const isScenario = (value: string | null): value is MswScenarioId =>
  MSW_SCENARIOS.some((scenario) => scenario.id === value);

export class ScenarioManager {
  private static instance: ScenarioManager | null = null;
  private currentScenario: MswScenarioId = 'success';
  private listeners: Set<(scenario: MswScenarioId) => void> = new Set();
  private sequences = { ranking: 0, history: 0 };
  public seed = 1337;
  public latency = 0;
  public configure(seed: number, latency: number): void {
    this.seed = Number.isSafeInteger(seed) ? seed >>> 0 : 1337;
    this.latency = Number.isFinite(latency) ? Math.max(0, Math.min(4000, latency)) : 0;
    this.sequences = { ranking: 0, history: 0 };
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('scenarioSeed', String(this.seed));
      url.searchParams.set('scenarioLatency', String(this.latency));
      window.history.replaceState(window.history.state, '', url);
    }
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('scenario');
      const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY);
      this.currentScenario = isScenario(fromUrl) ? fromUrl : isScenario(stored) ? stored : 'success';
      sessionStorage.setItem(SCENARIO_STORAGE_KEY, this.currentScenario);
      const seed = Number(params.get('scenarioSeed') ?? 1337);
      if (Number.isSafeInteger(seed)) this.seed = seed >>> 0;
      const latency = Number(params.get('scenarioLatency') ?? 0);
      if (Number.isFinite(latency)) this.latency = Math.max(0, Math.min(4000, latency));
    }
  }

  public static getInstance(): ScenarioManager {
    if (!ScenarioManager.instance) {
      ScenarioManager.instance = new ScenarioManager();
    }
    return ScenarioManager.instance;
  }

  public getScenario(): MswScenarioId {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY);
      if (isScenario(stored) && stored !== this.currentScenario) {
        this.currentScenario = stored;
        this.sequences = { ranking: 0, history: 0 };
      }
    }
    return this.currentScenario;
  }

  public setScenario(scenario: MswScenarioId): void {
    this.currentScenario = scenario;
    this.sequences = { ranking: 0, history: 0 };
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SCENARIO_STORAGE_KEY, scenario);
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', scenario);
      window.history.replaceState(window.history.state, '', url);
    }
    for (const listener of this.listeners) {
      listener(scenario);
    }
  }

  /** Independent request sequences keep delays reproducible across tab interleaving. */
  public nextDelay(endpoint: 'ranking' | 'history'): number {
    const index = this.sequences[endpoint]++;
    let value = (this.seed + Math.imul(index + 1, 0x9e3779b9) + (endpoint === 'history' ? 17 : 0)) >>> 0;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    const jitter = (value >>> 0) % 100;
    return (index % 2 === 0 ? 1000 : 100) + jitter;
  }

  public reset(): void {
    this.configure(1337, 0);
    this.setScenario('success');
  }

  public subscribe(cb: (scenario: MswScenarioId) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
