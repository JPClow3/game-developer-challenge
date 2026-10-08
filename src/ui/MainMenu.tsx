import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { saveUserConfigToStorage, DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from '../types/config';
import { DIFFICULTY_DETAILS, MAP_DETAILS, voyageGameplayConfig, type DifficultyId, type MapId } from '../core/simulation/VoyageRules';
import { loadCaptainLog, voyageKey, captainTitle } from '../game/CaptainLog';
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
const tabs: { id: MenuTab; label: string; icon: IconName }[] = [
  { id: 'play', label: 'Play Battle', icon: 'compass' },
  { id: 'ranking', label: 'Ranking', icon: 'trophy' },
  { id: 'history', label: 'Match History', icon: 'history' },
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
  const [optionsSaved, setOptionsSaved] = useState(false);
  useEffect(() => {
    if (!optionsSaved) return;
    const timeout = setTimeout(() => setOptionsSaved(false), 3200);
    return () => clearTimeout(timeout);
  }, [optionsSaved]);
  const helm = loadHelmSettings();
  const log = loadCaptainLog();
  const best = log.bests[voyageKey({sessionDurationSeconds:currentConfig.sessionDurationSeconds,enemySpawnIntervalSeconds:currentConfig.spawner.spawnIntervalSeconds,voyage:currentConfig.voyage})];
  const selectVoyage = (difficulty: DifficultyId | 'classic', map: MapId) => {
    const next = difficulty === 'classic' ? {...DEFAULT_GAMEPLAY_CONFIG,sessionDurationSeconds:currentConfig.sessionDurationSeconds,spawner:{...DEFAULT_GAMEPLAY_CONFIG.spawner,spawnIntervalSeconds:currentConfig.spawner.spawnIntervalSeconds}}
      : voyageGameplayConfig(currentConfig.sessionDurationSeconds,currentConfig.spawner.spawnIntervalSeconds,{difficulty,map});
    saveUserConfigToStorage(next); onUpdateConfig(next);
  };
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
              <Icon name={tab.icon} />{tab.label}
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
                  Sink enemy ships for one point each. Keep your hull afloat until the bell.
                </p>
                <div className="voyage-picker">
                  <label>Difficulty<select aria-label="Voyage difficulty" value={currentConfig.voyage?.difficulty ?? 'classic'} onChange={e=>selectVoyage(e.target.value as DifficultyId | 'classic',currentConfig.voyage?.map ?? 'archipelago')}>
                    {Object.entries(DIFFICULTY_DETAILS).map(([id,detail])=><option key={id} value={id}>{detail.name}</option>)}
                    <option value="classic">Classic rules</option>
                  </select></label>
                  <label>Waters<select aria-label="Voyage map" disabled={!currentConfig.voyage} value={currentConfig.voyage?.map ?? 'archipelago'} onChange={e=>selectVoyage(currentConfig.voyage?.difficulty ?? 'open',e.target.value as MapId)}>
                    {Object.entries(MAP_DETAILS).map(([id,detail])=><option key={id} value={id}>{detail.name}</option>)}
                  </select></label>
                  <p>{currentConfig.voyage ? DIFFICULTY_DETAILS[currentConfig.voyage.difficulty].description : 'Original arena and enemy rules. Compatible with earlier Classic recordings.'}</p>
                  {currentConfig.voyage && <p>{MAP_DETAILS[currentConfig.voyage.map].description} Collect glowing crates for repairs.</p>}
                </div>
                <div className="captain-progress"><strong>{captainTitle(log)}</strong><span>{best ? `Personal best: ${best.score} ships · Grade ${best.grade}` : 'Chart your first personal best in these waters.'}</span></div>
                <div className="voyage-settings">
                  <span>
                    <strong>{currentConfig.sessionDurationSeconds}s</strong> at sea
                  </span>
                  <span>
                    <strong>{currentConfig.spawner.spawnIntervalSeconds}s</strong> {currentConfig.voyage ? 'base enemy interval' : 'between enemies'}
                  </span>
                </div>
                <div className="voyage-actions">
                  <button
                    type="button"
                    disabled={isStarting}
                    aria-busy={isStarting}
                    className="pirate-button voyage-start"
                    data-testid="btn-set-sail"
                    aria-label="Play"
                    onClick={(event) => {
                      event.currentTarget.blur();
                      AudioManager.getInstance().play('game_start');
                      onStartGame();
                    }}
                  >
                    <span>{isStarting ? 'Preparing…' : 'Play'}</span>
                    <Icon name="anchor" />
                    <small>{isStarting ? 'Ready in a moment' : 'Set sail'}</small>
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
                    <Icon name="settings" />Options
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
                  <Icon name="compass" /><span>Practice voyage <small>Three quick actions. No score.</small></span>
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
              key={`${currentConfig.voyage?.difficulty}:${currentConfig.voyage?.map}:${currentConfig.sessionDurationSeconds}:${currentConfig.spawner.spawnIntervalSeconds}`}
              voyage={currentConfig.voyage}
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
      {optionsSaved && <div className="ui-message harbor-toast" data-tone="success" role="status"><Icon name="check" /><span>Options saved. Your next voyage is ready.</span></div>}
      <OptionsModal
        currentConfig={currentConfig}
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        onSave={(nextConfig) => { onUpdateConfig(nextConfig); setOptionsSaved(true); }}
      />
    </div>
  );
};
