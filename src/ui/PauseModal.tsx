import { useDialogFocus } from './useDialogFocus';
import React from 'react';
import { AudioManager } from '../audio/AudioManager';
import type { RendererState } from '../pixi/PixiCanvas';

interface PauseModalProps {
  isOpen: boolean;
  onResume: () => void;
  onAbandon: () => void;
  rendererState?: RendererState;
  onRestoreView?: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  onResume,
  onAbandon,
  rendererState = 'ready',
  onRestoreView,
}) => {
  const dialogRef = useDialogFocus(isOpen);
  if (!isOpen) return null;
  const viewUnavailable = rendererState !== 'ready';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="w-full max-w-sm my-auto shrink-0 pirate-wood-panel p-6 text-amber-100 flex flex-col items-center text-center space-y-5 shadow-2xl">
        <h2 id="pause-title" className="text-3xl font-extrabold pirate-gold-text uppercase tracking-wider">
          {rendererState === 'lost' ? 'Game view interrupted' : rendererState === 'failed' ? 'Game view unavailable' : rendererState === 'loading' ? 'Restoring game view' : 'Game Paused'}
        </h2>

        <p className="text-sm text-amber-200/80" role={viewUnavailable ? 'status' : undefined}>
          {viewUnavailable ? 'Your voyage is paused. Restore the game view, or return to harbor without recording this voyage.' : 'Cannons cooled. The sea awaits your command.'}
        </p>

        {/* Controls Reminder */}
        {!viewUnavailable && <div className="w-full p-3 bg-stone-950/70 border border-amber-900/50 rounded text-xs text-amber-200/90 text-left space-y-1 font-mono">
          <div><span className="text-yellow-400">W / ▲</span> : Throttle Ahead</div>
          <div><span className="text-yellow-400">A / D / ◀ / ▶</span> : Steer Ship</div>
          <div><span className="text-yellow-400">Space / J</span> : Front Cannon</div>
          <div><span className="text-yellow-400">Q / E</span> : Port / Starboard Broadside</div>
        </div>}

        {/* Buttons */}
        <div className="w-full flex flex-col space-y-3 pt-2">
          {viewUnavailable ? <button type="button" onClick={onRestoreView} disabled={rendererState === 'loading'}
            className="pirate-button w-full py-2.5 rounded font-bold text-amber-100 uppercase tracking-wider text-sm shadow-md disabled:opacity-50 disabled:cursor-wait">
            {rendererState === 'loading' ? 'Restoring view…' : 'Restore game view'}
          </button> : <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('game_resume');
              onResume();
            }}
            className="pirate-button w-full py-2.5 rounded font-bold text-amber-100 uppercase tracking-wider text-sm shadow-md"
            aria-label="Resume Battle"
          >
            Resume Battle
          </button>}

          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_back');
              onAbandon();
            }}
            className="w-full py-2 rounded bg-stone-800 hover:bg-red-950 text-stone-300 hover:text-red-200 border border-stone-700 hover:border-red-700 font-semibold text-xs uppercase tracking-wider transition"
            aria-label="Abandon Match"
          >
            Abandon Match (No Record)
          </button>
        </div>
      </div>
    </div>
  );
};
