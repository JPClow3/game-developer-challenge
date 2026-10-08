import React, { useEffect, useState, useRef } from 'react';
import { TouchJoystick } from './TouchJoystick';
import { Icon } from './Icon';
import { GameSimulation, DEFAULT_PLAYER_INPUT } from '../core/simulation/GameSimulation';
import type { MatchSnapshot } from '../types/game';
import type { HelmSettings } from '../game/HelmSettings';

interface MatchHUDProps {
  simulation: GameSimulation;
  onPauseToggle: () => void;
  settings: HelmSettings;
}
type Control = 'forward' | 'left' | 'right' | 'front' | 'port' | 'starboard';
export const MatchHUD: React.FC<MatchHUDProps> = ({ simulation, onPauseToggle, settings }) => {
  const [snapshot, setSnapshot] = useState<MatchSnapshot>(simulation.getSnapshot());
  const [held, setHeld] = useState<Set<Control>>(new Set());
  const pointers = useRef(new Map<number, Control>());
  const toggled = useRef(new Set<Control>());
  const [announcement, setAnnouncement] = useState(
    'Keep moving. Sink enemy ships for one point each.',
  );

  useEffect(() => {
    const activePointers = pointers.current;
    const timer = setInterval(() => setSnapshot(simulation.getSnapshot()), 100);
    const reset = () => {
      pointers.current.clear();
      toggled.current.clear();
      setHeld(new Set());
      simulation.setInputs({...DEFAULT_PLAYER_INPUT},'touch');
    };
    const unsubscribe = simulation.addListener((event) => {
      if (
        ['match_paused', 'match_resumed', 'match_ended', 'training_progress'].includes(event.type)
      )
        reset();
      if (event.type === 'salvage_collected') setAnnouncement(`Repair collected. Hull restored by ${event.payload.healing}.`);
      if (event.type === 'score_changed')
        setAnnouncement(`Enemy sunk. Score ${event.payload.score}.`);
      if (event.type === 'health_changed' && event.payload.percentage <= 30)
        setAnnouncement('Hull critical. Keep clear of ramming ships.');
    });
    window.addEventListener('blur', reset);
    return () => {
      clearInterval(timer);
      unsubscribe();
      activePointers.clear();
      window.removeEventListener('blur', reset);
    };
  }, [simulation]);

  const publish = () => {
    const active = new Set(pointers.current.values());
    for (const action of toggled.current) active.add(action);
    setHeld(active);
    simulation.setInputs(
      {
        ...DEFAULT_PLAYER_INPUT,
        throttle: active.has('forward') ? 1 : 0,
        steer: Number(active.has('right')) - Number(active.has('left')),
        fireFront: active.has('front'),
        fireBroadsideLeft: active.has('port'),
        fireBroadsideRight: active.has('starboard'),
      },
      'touch',
    );
  };
  const release = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointers.current.delete(event.pointerId)) publish();
  };
  const control = (action: Control, label: string, content: React.ReactNode, cooldown = 0) => (
    <button
      type="button"
      className={`helm-control ${held.has(action) ? 'is-held' : ''} ${cooldown > 0 ? 'is-reloading' : ''}`}
      aria-label={label}
      aria-pressed={held.has(action)}
      style={{ '--charge': `${(1 - cooldown) * 100}%` } as React.CSSProperties}
      onPointerDown={(event) => {
        if (
          simulation.isPaused ||
          simulation.isEnded ||
          (event.pointerType === 'mouse' && event.button !== 0)
        )
          return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        if (settings.toggleFire && ['front', 'port', 'starboard'].includes(action)) {
          if (toggled.current.has(action)) toggled.current.delete(action);
          else toggled.current.add(action);
        } else pointers.current.set(event.pointerId, action);
        publish();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span>{content}</span>
      {['front', 'port', 'starboard'].includes(action) && (
        <small>{cooldown > 0 ? 'Reloading' : held.has(action) ? 'Firing' : 'Ready'}</small>
      )}
    </button>
  );
  const healthPct = Math.max(0, (snapshot.playerHealth / snapshot.playerMaxHealth) * 100);
  const battery = (label: string, key: string, cooldown: number) => (
    <div className="battery-cell">
      <kbd>{key}</kbd>
      <span>{label}</span>
      <div className="battery-track">
        <i style={{ width: `${(1 - cooldown) * 100}%` }} />
      </div>
      <small>{cooldown > 0 ? 'Reloading' : 'Ready'}</small>
    </div>
  );

  return (
    <header className="battle-hud" aria-label="Battle controls and status">
      <div className="battle-top">
        <div
          className="hull-panel"
          aria-label={`Hull ${snapshot.playerHealth} of ${snapshot.playerMaxHealth}`}
        >
          <div className="hull-caption">
            <span>Hull integrity</span>
            <strong>
              {snapshot.playerHealth}
              <small> / {snapshot.playerMaxHealth}</small>
            </strong>
          </div>
          <div className="hull-track">
            <i
              style={{ width: `${healthPct}%`, background: healthPct > 30 ? '#6fd2b1' : '#ff886d' }}
            />
          </div>
        </div>
        <div className="battle-metrics">
          {simulation.mode === 'training' ? (
            <div>
              <small>Practice</small>
              <strong className="practice-clock">No limit</strong>
            </div>
          ) : (
            <>
              <div data-testid="hud-score">
                <small>Ships sunk</small>
                <strong data-testid="hud-score-value">{snapshot.score}</strong>
              </div>
              <div
                data-testid="hud-timer"
                className={snapshot.remainingSeconds <= 15 ? 'time-critical' : ''}
              >
                <small>Time left</small>
                <strong data-testid="hud-timer-value">{snapshot.remainingSeconds}s</strong>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="battle-pause"
          aria-label="Pause game"
          onClick={(event) => {
            event.currentTarget.blur();
            onPauseToggle();
          }}
        >
          <Icon name="pause" /> <span>Pause</span>
        </button>
      </div>
      {simulation.mode === 'match' && (
        <p className="battle-hint">
          {snapshot.durationSeconds - snapshot.remainingSeconds < 9
            ? 'Keep moving. Turn your broadside toward the enemy.'
            : healthPct <= 30
              ? simulation.config.voyage ? 'Hull critical. Find glowing repair crates.' : 'Hull critical. Avoid the red ramming ships.'
              : 'Sink enemy ships · 1 point each'}
        </p>
      )}
      {simulation.mode !== 'replay' && (
        <div className="desktop-battery" aria-label="Weapon readiness">
          {battery('Port', 'Q / K', snapshot.cooldownLeftBroadsideNormalized)}
          {battery('Front', 'Space / J', snapshot.cooldownFrontNormalized)}
          {battery('Starboard', 'E / L', snapshot.cooldownRightBroadsideNormalized)}
          <span className="steering-reminder">W / ↑ Ahead · A D / ← → Steer</span>
        </div>
      )}
      {simulation.mode !== 'replay' && (
        <div
          className={`touch-helm ${settings.swapped ? 'helm-swapped' : ''}`}
          data-testid="touch-helm"
        >
          <div className="helm-movement">
            <span className="helm-label">Helm</span>
            {settings.joystick ? <TouchJoystick simulation={simulation} /> : <>{control('forward', 'Move forward', <Icon name="ahead" />)}
            <div>
              {control('left', 'Steer left', <Icon name="left" />)}
              {control('right', 'Steer right', <Icon name="arrow" />)}
            </div></>}
          </div>
          <div className="helm-weapons">
            <span className="helm-label">Cannons</span>
            {control('front', 'Fire front cannon', 'Front', snapshot.cooldownFrontNormalized)}
            <div>
              {control(
                'port',
                'Fire port broadside',
                'Port',
                snapshot.cooldownLeftBroadsideNormalized,
              )}
              {control(
                'starboard',
                'Fire starboard broadside',
                'Starboard',
                snapshot.cooldownRightBroadsideNormalized,
              )}
            </div>
          </div>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </header>
  );
};
