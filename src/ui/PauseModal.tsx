import { useDialogFocus } from './useDialogFocus';
import { Icon } from './Icon';
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
      className="ui-dialog-backdrop"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="ui-dialog pause-dialog pirate-wood-panel">
        <span className="dialog-symbol"><Icon name={viewUnavailable ? 'alert' : 'pause'} /></span>
        <h2 id="pause-title">
          {rendererState === 'lost' ? 'Game view interrupted' : rendererState === 'failed' ? 'Game view unavailable' : rendererState === 'loading' ? 'Restoring game view' : 'Game Paused'}
        </h2>

        <p className="dialog-description" role={viewUnavailable ? 'status' : undefined}>
          {viewUnavailable ? 'Your voyage is paused. Restore the game view, or return to harbor without recording this voyage.' : 'Cannons cooled. The sea awaits your command.'}
        </p>

        {/* Controls Reminder */}
        {!viewUnavailable && <dl className="pause-controls">
          <dt>W / ↑</dt><dd>Sail ahead</dd>
          <dt>A / D / ← / →</dt><dd>Steer the ship</dd>
          <dt>Space / J</dt><dd>Front cannon</dd>
          <dt>Q / E</dt><dd>Port / starboard broadside</dd>
        </dl>}

        {/* Buttons */}
        <div className="pause-actions">
          {viewUnavailable ? <button type="button" onClick={onRestoreView} disabled={rendererState === 'loading'}
            className="ui-button pirate-button" aria-busy={rendererState === 'loading'}>
            {rendererState === 'loading' ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="refresh" />}
            {rendererState === 'loading' ? 'Restoring view…' : 'Restore game view'}
          </button> : <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('game_resume');
              onResume();
            }}
            className="ui-button pirate-button"
            aria-label="Resume Battle"
          >
            <Icon name="play" />Resume Battle
          </button>}

          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_back');
              onAbandon();
            }}
            className="ui-button ui-button-secondary ui-button-danger"
            aria-label="Abandon Match"
          >
            Abandon Match (No Record)
          </button>
        </div>
      </div>
    </div>
  );
};
