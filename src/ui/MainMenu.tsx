import React, { useRef, useState } from 'react';
import type { GameplayConfig } from '../types/config';
import { RankingTab } from './RankingTab';
import { MatchHistoryTab } from './MatchHistoryTab';
import { OptionsModal } from './OptionsModal';
import { AudioManager } from '../audio/AudioManager';
import { loadHelmSettings } from '../game/HelmSettings';

type MenuTab = 'play' | 'ranking' | 'history';
interface MainMenuProps {
  currentConfig: GameplayConfig;
  onStartGame: () => void;
  onTraining: () => void;
  onUpdateConfig: (config: GameplayConfig) => void;
  isStarting?: boolean;
}
const tabs: { id: MenuTab; label: string }[] = [
  { id: 'play', label: 'Play Battle' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

export const MainMenu: React.FC<MainMenuProps> = ({
  currentConfig,
  onStartGame,
  onTraining,
  onUpdateConfig,
  isStarting,
}) => {
  const [activeTab, setActiveTab] = useState<MenuTab>('play');
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const helm = loadHelmSettings();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectTab = (tab: MenuTab) => {
    AudioManager.getInstance().play('ui_click');
    setActiveTab(tab);
  };
  return (
    <div className="harbor-screen" data-testid="main-menu">
      <div className="harbor-background" />
      <main className={`harbor-shell ${activeTab !== 'play' ? 'harbor-records' : ''}`}>
        <header className={`harbor-heading ${activeTab === 'play' ? 'harbor-heading-voyage' : ''}`}>
          {activeTab === 'play' && (
            <picture className="harbor-departure">
              <source media="(max-width: 600px)" srcSet="/assets/harbor/departure-small.webp" />
              <img
                src="/assets/harbor/departure.webp"
                width="1200"
                height="600"
                alt=""
                decoding="async"
                draggable={false}
              />
            </picture>
          )}
          <span className="nautical-eyebrow">Jungle Gaming presents</span>
          <h1>
            Pirate <span>Battle</span>
          </h1>
          <p>High seas. Heavy cannons. One captain.</p>
        </header>
        <div className="harbor-navigation" role="tablist" aria-label="Main menu">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[i] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                let next = i;
                if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
                else if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = tabs.length - 1;
                else return;
                const nextTab = tabs[next];
                if (nextTab) {
                  event.preventDefault();
                  selectTab(nextTab.id);
                  tabRefs.current[next]?.focus();
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <section
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="harbor-content"
        >
          {activeTab === 'play' && (
            <div className="voyage-layout">
              <div className="voyage-brief">
                <span className="nautical-eyebrow">Your next voyage</span>
                <h2>
                  <span>Outsail.</span> <span>Outgun.</span> <em>Stay afloat.</em>
                </h2>
                <p>
                  Hunt enemy ships through island waters. Every ship sunk earns one point. Survive
                  until the bell, or go down fighting.
                </p>
                <div className="voyage-settings">
                  <span>
                    <strong>{currentConfig.sessionDurationSeconds}s</strong> at sea
                  </span>
                  <span>
                    <strong>{currentConfig.spawner.spawnIntervalSeconds}s</strong> between enemies
                  </span>
                </div>
                <div className="voyage-actions">
                  <button
                    type="button"
                    disabled={isStarting}
                    className="pirate-button voyage-start"
                    data-testid="btn-set-sail"
                    aria-label="Play"
                    onClick={(event) => {
                      event.currentTarget.blur();
                      AudioManager.getInstance().play('game_start');
                      onStartGame();
                    }}
                  >
                    Play <span aria-hidden="true">⚓</span>
                    <small>Set sail</small>
                  </button>
                  <button
                    type="button"
                    className="voyage-options"
                    data-testid="btn-options"
                    aria-label="Open game options"
                    onClick={() => {
                      AudioManager.getInstance().play('ui_open');
                      setIsOptionsOpen(true);
                    }}
                  >
                    Options
                  </button>
                </div>
                <button
                  type="button"
                  className="training-entry"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    onTraining();
                  }}
                >
                  Practice voyage <small>Three quick actions. No score.</small>
                </button>
              </div>
              <div className="captains-chart">
                <span className="nautical-eyebrow">Know your ship</span>
                <div
                  className="cannon-diagram"
                  aria-label="Front cannon fires ahead. Port fires left. Starboard fires right."
                >
                  <span className="diagram-front">
                    <kbd>Space / J</kbd>Front cannon ↑
                  </span>
                  <span className="diagram-port">
                    <kbd>Q / K</kbd>← Port
                    <br />
                    <small>3 shots</small>
                  </span>
                  <img
                    src="/assets/png/retina/ships/ship_1.png"
                    alt="Your sailing ship, viewed from above"
                  />
                  <span className="diagram-starboard">
                    <kbd>E / L</kbd>Starboard →<br />
                    <small>3 shots</small>
                  </span>
                </div>
                <div className="chart-controls">
                  <span>
                    <kbd>W / ↑</kbd> Sail ahead
                  </span>
                  <span>
                    <kbd>A D / ← →</kbd> Steer
                  </span>
                  <span>
                    <kbd>P / Esc</kbd> Pause
                  </span>
                </div>
                <p className="chart-tip">
                  {helm.toggleFire
                    ? 'Tap a cannon key or button to keep firing. Tap again to stop.'
                    : 'Hold to keep firing.'}{' '}
                  Bring your side toward an enemy to land a full broadside.
                </p>
                <div className="enemy-guide">
                  <span>
                    <i className="chaser-mark" /> <strong>Chasers</strong> prepare, then charge.
                  </span>
                  <span>
                    <i className="shooter-mark" /> <strong>Shooters</strong> load before firing.
                  </span>
                </div>
                <p className="chart-touch">Touch controls available on phones and tablets.</p>
              </div>
            </div>
          )}
          {activeTab === 'ranking' && (
            <RankingTab
              sessionDurationFilter={currentConfig.sessionDurationSeconds}
              spawnIntervalFilter={currentConfig.spawner.spawnIntervalSeconds}
            />
          )}
          {activeTab === 'history' && <MatchHistoryTab />}
        </section>
        <footer className="harbor-footer">
          <span>One point per ship. Make every salvo count.</span>
          <img src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
        </footer>
      </main>
      <OptionsModal
        currentConfig={currentConfig}
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        onSave={onUpdateConfig}
      />
    </div>
  );
};
