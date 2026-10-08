import { useDialogFocus } from './useDialogFocus';
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
  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    AudioManager.getInstance().play('ui_click');

    const result = validateGameplayConfig({
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
    >
      <div className="w-full max-w-md my-auto shrink-0 pirate-wood-panel p-6 text-amber-100 flex flex-col space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-amber-900/60 pb-3">
          <h2 id="options-title" className="text-2xl font-bold pirate-gold-text uppercase tracking-wide">
            Game Options
          </h2>
          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_close');
              onClose();
            }}
            className="text-amber-300 hover:text-amber-100 text-xl font-bold px-2 py-1 rounded"
            aria-label="Close options modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 rounded text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col space-y-5">
          {/* Game Session Time */}
          <div className="flex flex-col space-y-2">
            <div className="flex justify-between items-center text-sm font-semibold">
              <label htmlFor="session-duration">Session Duration (seconds):</label>
              <span className="text-yellow-400 font-mono text-base">{duration}s</span>
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
            <span id="duration-help" className="text-xs text-amber-200/60">
              Valid range: 60 to 180 seconds.
            </span>
          </div>

          {/* Enemy Spawn Interval */}
          <div className="flex flex-col space-y-2">
            <div className="flex justify-between items-center text-sm font-semibold">
              <label htmlFor="spawn-interval">Enemy Spawn Interval (seconds):</label>
              <span className="text-yellow-400 font-mono text-base">{spawnInterval}s</span>
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
            <span id="spawn-help" className="text-xs text-amber-200/60">
              Interval between new enemies (1 to 15 seconds, in whole seconds).
            </span>
          </div>

          <fieldset className="helm-options">
            <legend>Helm & sound</legend>
            <label><input type="checkbox" checked={helm.toggleFire} onChange={event=>setHelm({...helm,toggleFire:event.target.checked})} /> Tap to toggle cannon fire</label>
            <small>Press a cannon key or touch button once to keep firing, again to stop. Pausing clears firing.</small>
            <label><input type="checkbox" checked={helm.swapped} onChange={event=>setHelm({...helm,swapped:event.target.checked})} /> Swap touch helm and cannons</label>
            <label><input type="checkbox" checked={helm.muted} onChange={event=>setHelm({...helm,muted:event.target.checked})} /> Mute sound</label>
            <label htmlFor="master-volume">Sound volume: {Math.round(helm.volume*100)}%</label>
            <input id="master-volume" type="range" min="0" max="1" step="0.05" value={helm.volume} onChange={event=>setHelm({...helm,volume:Number(event.target.value)})} />
          </fieldset>
          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-amber-900/60">
            <button
              type="button"
              onClick={() => {
                AudioManager.getInstance().play('ui_back');
                onClose();
              }}
              className="px-4 py-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pirate-button px-6 py-2 rounded text-amber-100 font-bold text-sm uppercase tracking-wider"
            >
              Save Options
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
