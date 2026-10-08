import { useDialogFocus } from './useDialogFocus';
import { Icon } from './Icon';
import React, { useEffect, useState } from 'react';
import type { GameplayConfig } from '../types/config';
import { validateGameplayConfig, saveUserConfigToStorage, MIN_SPAWN_INTERVAL, MAX_SPAWN_INTERVAL } from '../types/config';
import { AudioManager } from '../audio/AudioManager';
import { loadHelmSettings, saveHelmSettings } from '../game/HelmSettings';

interface OptionsModalProps {
  currentConfig: GameplayConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: GameplayConfig) => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  currentConfig,
  isOpen,
  onClose,
  onSave,
}) => {
  const [duration, setDuration] = useState<number>(currentConfig.sessionDurationSeconds);
  const [spawnInterval, setSpawnInterval] = useState<number>(
    currentConfig.spawner.spawnIntervalSeconds
  );
  const [error, setError] = useState<string | null>(null);
  const [helm,setHelm]=useState(loadHelmSettings);

  useEffect(() => {
    if (!isOpen) return;
    setDuration(currentConfig.sessionDurationSeconds);
    setSpawnInterval(Math.round(currentConfig.spawner.spawnIntervalSeconds));
    setError(null);
    setHelm(loadHelmSettings());
  }, [isOpen, currentConfig]);

  const dialogRef = useDialogFocus(isOpen);
  // Escape cancels the modal dialog, discarding unsaved edits like Cancel.
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      AudioManager.getInstance().play('ui_close');
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    AudioManager.getInstance().play('ui_click');

    const result = validateGameplayConfig({
      ...currentConfig,
      sessionDurationSeconds: Number(duration),
      spawner: {
        ...currentConfig.spawner,
        spawnIntervalSeconds: Number(spawnInterval),
      },
    });

    if (!result.isValid) {
      setError(result.errors.join(' '));
      return;
    }

    saveUserConfigToStorage(result.validatedConfig);
    saveHelmSettings(helm);
    AudioManager.getInstance().setMuted(helm.muted);
    AudioManager.getInstance().setMasterVolume(helm.volume);
    onSave(result.validatedConfig);
    onClose();
  };

  return (
    <div
      className="ui-dialog-backdrop"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
    >
      <div className="ui-dialog options-dialog pirate-wood-panel">
        <div className="ui-dialog-header">
          <h2 id="options-title">
            Game Options
          </h2>
          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_close');
              onClose();
            }}
            className="ui-icon-button"
            aria-label="Close options modal"
          >
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="ui-message" data-tone="error" role="alert">
            <Icon name="alert" /><span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="options-form">
          {/* Game Session Time */}
          <div className="option-field">
            <div className="option-field-head">
              <label htmlFor="session-duration">Session duration</label>
              <output htmlFor="session-duration" className="option-value">{duration}s</output>
            </div>
            <input
              id="session-duration"
              type="range"
              min={60}
              max={180}
              step={5}
              value={duration}
              onChange={(e) => {
                setDuration(Number(e.target.value));
                setError(null);
              }}
              className="w-full accent-amber-500 cursor-pointer"
              aria-describedby="duration-help"
            />
            <span id="duration-help" className="option-help">
              A voyage lasts between 60 and 180 seconds.
            </span>
          </div>

          {/* Enemy Spawn Interval */}
          <div className="option-field">
            <div className="option-field-head">
              <label htmlFor="spawn-interval">Time between enemies</label>
              <output htmlFor="spawn-interval" className="option-value">{spawnInterval}s</output>
            </div>
            <input
              id="spawn-interval"
              type="range"
              min={MIN_SPAWN_INTERVAL}
              max={MAX_SPAWN_INTERVAL}
              step={1}
              value={spawnInterval}
              onChange={(e) => {
                setSpawnInterval(Number(e.target.value));
                setError(null);
              }}
              className="w-full accent-amber-500 cursor-pointer"
              aria-describedby="spawn-help"
            />
            <span id="spawn-help" className="option-help">
              Shorter intervals bring a busier sea. Choose 1 to 15 seconds. {currentConfig.voyage && 'Voyage pressure increases as the battle progresses.'}
            </span>
          </div>

          <fieldset className="helm-options">
            <legend>Helm & sound</legend>
            <label><input type="checkbox" checked={helm.toggleFire} onChange={event=>setHelm({...helm,toggleFire:event.target.checked})} /> Tap to toggle cannon fire</label>
            <small>Press a cannon key or touch button once to keep firing, again to stop. Pausing clears firing.</small>
            <label><input type="checkbox" checked={helm.joystick ?? false} onChange={event=>setHelm({...helm,joystick:event.target.checked})} /> Use touch joystick</label>
            <small>Drag to steer and set sail. Your other thumb controls the cannons.</small>
            <label><input type="checkbox" checked={helm.swapped} onChange={event=>setHelm({...helm,swapped:event.target.checked})} /> Swap touch helm and cannons</label>
            <label><input type="checkbox" checked={helm.muted} onChange={event=>setHelm({...helm,muted:event.target.checked})} /> Mute sound</label>
            <div className="option-field-head">
              <label htmlFor="master-volume">Sound volume</label>
              <output htmlFor="master-volume" className="option-value">{Math.round(helm.volume*100)}%</output>
            </div>
            <input id="master-volume" type="range" min="0" max="1" step="0.05" value={helm.volume} onChange={event=>setHelm({...helm,volume:Number(event.target.value)})} />
          </fieldset>
          {/* Buttons */}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                AudioManager.getInstance().play('ui_back');
                onClose();
              }}
              className="ui-button ui-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ui-button pirate-button"
            >
              <Icon name="check" />Save Options
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
