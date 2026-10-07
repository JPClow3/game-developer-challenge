import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { AssetLoader } from './assets/AssetLoader';
import { AudioManager } from './audio/AudioManager';
import { GameSimulation } from './core/simulation/GameSimulation';
import { PixiCanvas } from './pixi/PixiCanvas';
import { MainMenu } from './ui/MainMenu';
import { MatchHUD } from './ui/MatchHUD';
import { PauseModal } from './ui/PauseModal';
import { ResultScreen, type CompletedMatchData, loadLastMatchResult } from './ui/ResultScreen';
import { useMockApi } from './api/environment';
import {
  type GameplayConfig,
  DEFAULT_GAMEPLAY_CONFIG,
  loadUserConfigFromStorage,
} from './types/config';
import { generateUUIDv4 } from './api/player';

type ScreenState = 'loading' | 'menu' | 'playing' | 'result';
const MswScenarioWidget = useMockApi
  ? lazy(() => import('./ui/MswScenarioWidget').then((module) => ({ default: module.MswScenarioWidget })))
  : null;

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [progress, setProgress] = useState<number>(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [config, setConfig] = useState<GameplayConfig>(() => {
    return loadUserConfigFromStorage() || DEFAULT_GAMEPLAY_CONFIG;
  });

  const [simulation, setSimulation] = useState<GameSimulation | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [completedMatch, setCompletedMatch] = useState<CompletedMatchData | null>(null);

  // React owns the simulation lifetime, including completion, abandonment, and restart.
  useEffect(() => {
    return () => simulation?.destroy();
  }, [simulation]);

  // Asset preloading
  const startPreload = useCallback(async () => {
    setScreen('loading');
    setLoadingError(null);
    setProgress(0.05);

    try {
      const loader = AssetLoader.getInstance();
      await loader.preload((prog) => {
        setProgress(prog);
      });
      setProgress(1.0);

      // Check if there was a saved last match result to optionally review
      const lastResult = loadLastMatchResult();
      if (lastResult && window.location.hash === '#last-result') {
        setCompletedMatch(lastResult);
        setScreen('result');
      } else {
        setScreen('menu');
      }
    } catch (err) {
      setLoadingError(
        err instanceof Error ? err.message : 'Failed to load game assets. Please retry.'
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (mounted) {
        await startPreload();
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [startPreload]);

  // Audio unlock listener
  const handleUserInteract = () => {
    AudioManager.getInstance().unlockAudio();
  };

  // Keyboard shortcut listener for Pause (P, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing' || !simulation) return;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        if (simulation.isPaused) {
          simulation.resume();
          setIsPaused(false);
        } else {
          simulation.pause();
          setIsPaused(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [screen, simulation]);

  // Match lifecycle methods
  const handleStartGame = useCallback(() => {
    const freshSimulation = new GameSimulation(config, Date.now());

    // Listen for match events
    freshSimulation.addListener((event) => {
      if (event.type === 'match_ended') {
        const payload = event.payload;
        const matchData: CompletedMatchData = {
          id: generateUUIDv4(),
          score: payload.finalScore,
          durationSeconds: Math.floor(payload.durationSeconds),
          endReason: payload.reason,
          config: {
            sessionDurationSeconds: payload.config.sessionDurationSeconds,
            enemySpawnIntervalSeconds: payload.config.spawner.spawnIntervalSeconds,
          },
          playedAt: new Date().toISOString(),
        };

        setCompletedMatch(matchData);
        setSimulation(null);
        setScreen('result');
      } else if (event.type === 'match_paused') {
        setIsPaused(true);
      } else if (event.type === 'match_resumed') {
        setIsPaused(false);
      }
    });

    setSimulation(freshSimulation);
    setIsPaused(false);
    setScreen('playing');
  }, [config]);

  const handlePauseToggle = useCallback(() => {
    if (!simulation) return;
    if (simulation.isPaused) {
      simulation.resume();
      setIsPaused(false);
    } else {
      simulation.pause();
      setIsPaused(true);
    }
  }, [simulation]);

  const handleResumeGame = useCallback(() => {
    if (simulation) {
      simulation.resume();
      setIsPaused(false);
    }
  }, [simulation]);

  const handleAbandonMatch = useCallback(() => {
    if (simulation) {
      simulation.abandonMatch();
      setSimulation(null);
    }
    setIsPaused(false);
    setScreen('menu');
  }, [simulation]);

  const handlePlayAgain = useCallback(() => {
    handleStartGame();
  }, [handleStartGame]);

  const handleBackToMenu = useCallback(() => {
    setScreen('menu');
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans"
      onClick={handleUserInteract}
      onKeyDown={handleUserInteract}
      tabIndex={0}
      role="application"
      aria-label="Pirate Battle Naval Shooter"
    >
      {/* 1. ASSET PRELOAD / ERROR SCREEN */}
      {screen === 'loading' && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
            style={{ backgroundImage: "url('/assets/ui_scene_background.png')" }}
          />
          <main className="relative z-10 w-full max-w-md pirate-wood-panel p-6 sm:p-8 flex flex-col items-center text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold pirate-gold-text tracking-wider uppercase mb-2">
              Pirate Battle
            </h1>
            <p className="text-amber-200/80 text-sm mb-6 uppercase tracking-widest font-medium">
              Preparing the high seas...
            </p>

            {loadingError ? (
              <div className="w-full flex flex-col items-center space-y-4 my-2" role="alert">
                <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 rounded text-sm w-full">
                  {loadingError}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    AssetLoader.getInstance().reset();
                    startPreload();
                  }}
                  className="pirate-button px-6 py-2.5 rounded font-bold text-amber-100 uppercase tracking-wider text-sm"
                  aria-label="Retry loading assets"
                >
                  Retry Loading
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center space-y-4" role="status" aria-live="polite">
                <span className="text-amber-100 text-sm font-semibold">
                  Arming Cannons & Hoisting Sails ({Math.round(progress * 100)}%)
                </span>
                <div className="w-full bg-slate-900 border-2 border-amber-800 rounded-full h-5 p-0.5 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-amber-600 to-yellow-400 h-full rounded-full transition-all duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <progress
                  className="sr-only"
                  max="100"
                  value={Math.round(progress * 100)}
                  aria-label="Asset Loading Progress"
                />
              </div>
            )}
          </main>
        </div>
      )}

      {/* 2. MAIN MENU SCREEN */}
      {screen === 'menu' && (
        <MainMenu
          currentConfig={config}
          onStartGame={handleStartGame}
          onUpdateConfig={(newCfg) => setConfig(newCfg)}
        />
      )}

      {/* 3. IN-GAME COMBAT ARENA */}
      {screen === 'playing' && simulation && (
        <div className="relative w-full h-full" data-testid="game-active-arena">
          <PixiCanvas simulation={simulation} />
          <MatchHUD simulation={simulation} onPauseToggle={handlePauseToggle} />
          <PauseModal
            isOpen={isPaused}
            onResume={handleResumeGame}
            onAbandon={handleAbandonMatch}
          />
        </div>
      )}

      {/* 4. RESULT SCREEN */}
      {screen === 'result' && completedMatch && (
        <ResultScreen
          matchData={completedMatch}
          onPlayAgain={handlePlayAgain}
          onMainMenu={handleBackToMenu}
        />
      )}

      {/* Floating MSW Scenario Controller */}
      {MswScenarioWidget && <Suspense fallback={null}>{screen !== 'playing' && <MswScenarioWidget />}</Suspense>}
    </div>
  );
};

export default App;
