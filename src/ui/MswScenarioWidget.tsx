import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
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
  const [feedback, setFeedback] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isExpanded) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target instanceof Node &&
          toggleRef.current?.parentElement?.contains(event.target)) {
        event.preventDefault();
        setIsExpanded(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(''), 3000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const manager = ScenarioManager.getInstance();
    const unsub = manager.subscribe((sc) => {
      setCurrentScenario(sc);
    });
    return unsub;
  }, []);

  const handleSelectScenario = async (sc: MswScenarioId) => {
    setFeedback('');
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
    setFeedback('Fixture data reset.');
  };

  return (
    <div
      className="network-widget"
      data-testid="msw-scenario-widget"
    >
      {/* Toggle button */}
      <button
        type="button"
        ref={toggleRef}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="network-toggle"
        aria-label="Toggle network simulation scenarios panel"
        aria-expanded={isExpanded}
        aria-controls="network-lab-panel"
      >
        <span className="network-dot" aria-hidden="true" />
        <span>Network Lab: {currentScenario}</span>
        <Icon name="chevron" />
      </button>

      {/* Expanded Scenario Panel */}
      {isExpanded && (
        <section id="network-lab-panel" aria-label="Network Lab" className="network-panel">
          <div className="network-header">
            <div><strong>Network Lab</strong><small>Explore fixture scenarios</small></div>
            <button
              type="button"
              onClick={handleResetData}
              className="ui-button ui-button-quiet"
              title="Restores mock database and scenario back to defaults"
            >
              <Icon name="refresh" />Reset Mock DB
            </button>
          </div>

          <label htmlFor="msw-scenario-select">
            Choose a network scenario for evaluation and testing:
          </label>

          <select
            id="msw-scenario-select"
            value={currentScenario}
            onChange={(e) => handleSelectScenario(e.target.value as MswScenarioId)}
          >
            {MSW_SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
          <div className="network-fields">
            <label><span>Network seed</span><input aria-label="Network seed" type="number" min="0" max="4294967295" value={seed} onChange={e=>{const value=Number(e.target.value)>>>0;setSeed(value);setFeedback('');ScenarioManager.getInstance().configure(value,latency);}} /></label>
            <label><span>Additional latency (ms)</span><input aria-label="Additional latency (ms)" type="number" min="0" max="4000" step="100" value={latency} onChange={e=>{const value=Math.max(0,Math.min(4000,Number(e.target.value)));setLatency(value);setFeedback('');ScenarioManager.getInstance().configure(seed,value);}} /></label>
          </div>
          <p className="network-help">Switch scenarios while Ranking or History is open to explore loading and recovery.</p>
          <div className="network-log-head"><strong>Request history</strong><button type="button" onClick={()=>{networkLog.clear();setFeedback('Request log cleared.');}} className="ui-button ui-button-quiet">Clear request log</button></div>
          <ol aria-label="Live request log" className="network-log">
            {entries.slice().reverse().map(entry=><li key={entry.id}>
              <div><strong>#{entry.id} {entry.method}</strong><span>{entry.state}</span></div>
              <span>{entry.path}</span>
              <p>attempt {entry.attempt}{entry.attempt>1?' (retry)':''} · {entry.status} {entry.elapsed!==undefined?`${entry.elapsed}ms`:''}{entry.isDuplicate!==undefined?` · isDuplicate=${entry.isDuplicate}`:''}</p>
            </li>)}
          </ol>
          {entries.length === 0 && <p className="network-help">Requests will appear here as you explore the ranking and battle log.</p>}
          {feedback && <p role="status" className="network-feedback">{feedback}</p>}

          <div className="network-description">
            {MSW_SCENARIOS.find((sc) => sc.id === currentScenario)?.description}
          </div>
        </section>
      )}
    </div>
  );
};
