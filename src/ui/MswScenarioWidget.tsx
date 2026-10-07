import React, { useState, useEffect } from 'react';
import type { MswScenarioId } from '../types/api';
import { MSW_SCENARIOS } from '../types/api';
import { ScenarioManager } from '../mocks/scenarios';
import { MockDatabase } from '../mocks/db';
import { AudioManager } from '../audio/AudioManager';

export const MswScenarioWidget: React.FC = () => {
  const [currentScenario, setCurrentScenario] = useState<MswScenarioId>(
    ScenarioManager.getInstance().getScenario()
  );
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const manager = ScenarioManager.getInstance();
    const unsub = manager.subscribe((sc) => {
      setCurrentScenario(sc);
    });
    return unsub;
  }, []);

  const handleSelectScenario = (sc: MswScenarioId) => {
    AudioManager.getInstance().play('ui_click');
    ScenarioManager.getInstance().setScenario(sc);
  };

  const handleResetData = () => {
    AudioManager.getInstance().play('ui_click');
    MockDatabase.getInstance().reset();
    ScenarioManager.getInstance().reset();
    window.location.reload();
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
        <span>MSW: {currentScenario}</span>
        <span>{isExpanded ? '▼' : '▲'}</span>
      </button>

      {/* Expanded Scenario Panel */}
      {isExpanded && (
        <div className="mt-2 w-72 sm:w-80 p-4 bg-stone-950/95 border-2 border-amber-700 rounded-xl shadow-2xl flex flex-col space-y-3 text-xs text-amber-100 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex justify-between items-center border-b border-amber-900/60 pb-2">
            <span className="font-bold uppercase tracking-wider text-amber-300">
              Network Simulation
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

          <div className="p-2 bg-stone-900/60 border border-amber-900/40 rounded text-[11px] text-amber-200/70 italic">
            {MSW_SCENARIOS.find((sc) => sc.id === currentScenario)?.description}
          </div>
        </div>
      )}
    </div>
  );
};
