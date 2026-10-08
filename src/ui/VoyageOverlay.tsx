import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import type { GameSimulation } from '../core/simulation/GameSimulation';

const lessons = {
  move: ['1 / 3 · Sail ahead', 'Hold W / ↑ or the forward helm button to move.'],
  front: ['2 / 3 · Front cannon', 'Hit the marked practice ship ahead. Space / J or Front.'],
  broadside: ['3 / 3 · Port broadside', 'Sink the practice ship to your left. Q / K or Port.'],
  complete: ['Ready for the high seas', 'Movement, front fire, and broadsides mastered.'],
} as const;

export const VoyageOverlay: React.FC<{
  simulation: GameSimulation;
  onExit: () => void;
  onBattle: () => void;
  onRestartReplay: () => void;
}> = ({ simulation, onExit, onBattle, onRestartReplay }) => {
  const [, refresh] = useState(0);
  const training = simulation.mode === 'training';
  useEffect(() => {
    if (training) return;
    const timer = setInterval(() => refresh((n) => n + 1), 200);
    return () => clearInterval(timer);
  }, [simulation, training]);
  useEffect(
    () =>
      simulation.addListener((event) => {
        if (event.type === 'training_progress' || event.type === 'replay_finished')
          refresh((n) => n + 1);
      }),
    [simulation],
  );
  const lesson = lessons[simulation.trainingStage];
  const endSeconds = Math.ceil(simulation.replayEndTick * simulation.fixedTimestep);
  const currentSeconds = Math.min(
    endSeconds,
    Math.floor(simulation.tickCount * simulation.fixedTimestep),
  );
  return (
    <section
      className={`voyage-overlay ${training ? '' : 'replay-overlay'}`}
      aria-label={training ? 'Training encounter' : 'Battle replay'}
    >
      <div className="voyage-instructions">
        <span className="nautical-eyebrow">
          {training ? 'Practice · No score' : 'Watch Replay · No score'}
        </span>
        <strong role="status" aria-live="polite">
          {training
            ? lesson[0]
            : simulation.replayStatus === 'verified'
              ? 'Replay verified'
              : (simulation.replayError ?? 'Replaying your battle')}
        </strong>
        {!training && (
          <span className="replay-progress" aria-label="Replay progress">
            {currentSeconds}s / {endSeconds}s
          </span>
        )}
        <p>
          {training
            ? lesson[1]
            : simulation.replayStatus === 'verified'
              ? 'All state checks matched the original battle.'
              : 'Circle: chaser. Diamond: shooter.'}
        </p>
      </div>
      <div className="voyage-overlay-actions">
        {!training && (
          <div className="replay-transport">
            <label>
              Speed{' '}
              <select
                aria-label="Replay speed"
                value={simulation.replaySpeed}
                onChange={(event) => {
                  simulation.setReplaySpeed(Number(event.target.value));
                  refresh((n) => n + 1);
                }}
              >
                {[0.5, 1, 2, 4].map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ui-button ui-button-secondary" aria-label="Restart replay" onClick={onRestartReplay}>
              <Icon name="refresh" />Restart
            </button>
          </div>
        )}
        {training && simulation.trainingStage === 'complete' && (
          <button type="button" className="ui-button pirate-button" onClick={() => onBattle()}>
            <Icon name="play" />Play
          </button>
        )}
        {training && simulation.trainingStage !== 'complete' && (
          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={(event) => {
              event.currentTarget.blur();
              simulation.resetTrainingLesson();
            }}
          >
            <Icon name="refresh" />Reset lesson
          </button>
        )}
        <button type="button" className="ui-button ui-button-quiet" onClick={onExit}>
          <Icon name="left" />
          {training
            ? simulation.trainingStage === 'complete'
              ? 'Back to harbor'
              : 'Skip training'
            : simulation.isEnded
              ? 'Back to results'
              : 'Exit replay'}
        </button>
      </div>
    </section>
  );
};
