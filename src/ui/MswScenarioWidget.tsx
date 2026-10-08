import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { networkLog } from '../api/networkLog';
import type { MswScenarioId } from '../types/api';
import { MSW_SCENARIOS } from '../types/api';
import { ScenarioManager } from '../mocks/scenarios';
import { MockDatabase } from '../mocks/db';
import { AudioManager } from '../audio/AudioManager';
import { useQueryClient } from '@tanstack/react-query';

export const MswScenarioWidget: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentScenario, setCurrentScenario] = useState<MswScenarioId>(
    ScenarioManager.getInstance().getScenario()
  );
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const entries = useSyncExternalStore(networkLog.subscribe, networkLog.snapshot);
  const [seed, setSeed] = useState(ScenarioManager.getInstance().seed);
  const [latency, setLatency] = useState(ScenarioManager.getInstance().latency);

  useEffect(() => {
    const manager = ScenarioManager.getInstance();
    const unsub = manager.subscribe((sc) => {
      setCurrentScenario(sc);
    });
    return unsub;
  }, []);

  const handleSelectScenario = async (sc: MswScenarioId) => {
    AudioManager.getInstance().play('ui_click');
    await Promise.all(['ranking', 'history'].map((key) =>
      queryClient.cancelQueries({ queryKey: [key] })));
    ScenarioManager.getInstance().setScenario(sc);
    await Promise.all(['ranking', 'history'].map((key) =>
      queryClient.resetQueries({ queryKey: [key] })));
  };

  const handleResetData = async () => {
    AudioManager.getInstance().play('ui_click');
    await Promise.all(['ranking', 'history'].map(key => queryClient.cancelQueries({queryKey:[key]})));
    MockDatabase.getInstance().reset();
    ScenarioManager.getInstance().reset();
    setSeed(1337); setLatency(0); networkLog.clear();
    await Promise.all(['ranking', 'history'].map(key => queryClient.resetQueries({queryKey:[key]})));
  };

  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex flex-col items-end"
      data-testid="msw-scenario-widget"
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-3 py-1.5 rounded-full bg-stone-900/90 border border-amber-500/70 text-amber-200 text-xs font-mono shadow-xl flex items-center space-x-1.5 hover:bg-stone-800 transition"
        aria-label="Toggle network simulation scenarios panel"
        aria-expanded={isExpanded}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>Network Lab: {currentScenario}</span>
        <span>{isExpanded ? '▼' : '▲'}</span>
      </button>

      {/* Expanded Scenario Panel */}
      {isExpanded && (
        <section aria-label="Network Lab" className="mt-2 w-72 sm:w-96 max-h-[70dvh] overflow-auto p-4 bg-stone-950/95 border-2 border-amber-700 rounded-xl shadow-2xl flex flex-col space-y-3 text-xs text-amber-100">
          <div className="flex justify-between items-center border-b border-amber-900/60 pb-2">
            <span className="font-bold uppercase tracking-wider text-amber-300">
              Network Lab · MSW + TanStack Query
            </span>
            <button
              type="button"
              onClick={handleResetData}
              className="text-[10px] text-amber-400 hover:text-yellow-300 underline font-semibold"
              title="Restores mock database and scenario back to defaults"
            >
              Reset Mock DB
            </button>
          </div>

          <label htmlFor="msw-scenario-select" className="text-amber-200/80 text-[11px]">
            Choose a network scenario for evaluation and testing:
          </label>

          <select
            id="msw-scenario-select"
            value={currentScenario}
            onChange={(e) => handleSelectScenario(e.target.value as MswScenarioId)}
            className="w-full bg-stone-900 border border-amber-700 rounded p-2 text-amber-100 text-xs font-mono focus:outline-none focus:border-amber-400"
          >
            {MSW_SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
          <label>Network seed<input aria-label="Network seed" type="number" min="0" max="4294967295" value={seed} className="w-full bg-stone-900 border border-amber-700 rounded p-2" onChange={e=>{const value=Number(e.target.value)>>>0;setSeed(value);ScenarioManager.getInstance().configure(value,latency);}} /></label>
          <label>Additional latency (ms)<input aria-label="Additional latency (ms)" type="number" min="0" max="4000" step="100" value={latency} className="w-full bg-stone-900 border border-amber-700 rounded p-2" onChange={e=>{const value=Math.max(0,Math.min(4000,Number(e.target.value)));setLatency(value);ScenarioManager.getInstance().configure(seed,value);}} /></label>
          <p>Open Ranking or History, then change scenario to cancel stale requests. Errors retry twice. Replay a saved result to observe isDuplicate.</p>
          <button type="button" onClick={()=>networkLog.clear()} className="underline text-amber-200">Clear request log</button>
          <ol aria-label="Live request log" className="max-h-52 overflow-auto space-y-2 font-mono">
            {entries.slice().reverse().map(entry=><li key={entry.id} className="border-b border-stone-700 pb-1 break-all">#{entry.id} {entry.method} {entry.path}<br/>attempt {entry.attempt}{entry.attempt>1?' (retry)':''} · {entry.state} {entry.status} {entry.elapsed!==undefined?`${entry.elapsed}ms`:''}{entry.isDuplicate!==undefined?` · isDuplicate=${entry.isDuplicate}`:''}</li>)}
          </ol>

          <div className="p-2 bg-stone-900/60 border border-amber-900/40 rounded text-[11px] text-amber-200/70 italic">
            {MSW_SCENARIOS.find((sc) => sc.id === currentScenario)?.description}
          </div>
        </section>
      )}
    </div>
  );
};
