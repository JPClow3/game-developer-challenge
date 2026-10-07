import type { MswScenarioId } from '../types/api';

const SCENARIO_STORAGE_KEY = 'pirate_battle_msw_scenario';

export class ScenarioManager {
  private static instance: ScenarioManager | null = null;
  private currentScenario: MswScenarioId = 'success';
  private listeners: Set<(scenario: MswScenarioId) => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY) as MswScenarioId | null;
      if (stored) {
        this.currentScenario = stored;
      }
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
      const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY) as MswScenarioId | null;
      if (stored) {
        this.currentScenario = stored;
      }
    }
    return this.currentScenario;
  }

  public setScenario(scenario: MswScenarioId): void {
    this.currentScenario = scenario;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SCENARIO_STORAGE_KEY, scenario);
    }
    for (const listener of this.listeners) {
      listener(scenario);
    }
  }

  public reset(): void {
    this.setScenario('success');
  }

  public subscribe(cb: (scenario: MswScenarioId) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
