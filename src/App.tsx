import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { AssetLoader } from './assets/AssetLoader';
import { AudioManager } from './audio/AudioManager';
import { GameSimulation } from './core/simulation/GameSimulation';
import { PixiCanvas, type RendererState } from './pixi/PixiCanvas';
import { MainMenu } from './ui/MainMenu';
import { MatchHUD } from './ui/MatchHUD';
import { VoyageOverlay } from './ui/VoyageOverlay';
import { loadHelmSettings } from './game/HelmSettings';
import { ASSET_SLOW_NOTICE_MS } from './game/StartupRecovery';
import { PauseModal } from './ui/PauseModal';
import { ResultScreen, type CompletedMatchData, loadLastMatchResult } from './ui/ResultScreen';
import { useMockApi } from './api/environment';
import {
  type GameplayConfig,
  DEFAULT_GAMEPLAY_CONFIG,
  loadUserConfigFromStorage,
} from './types/config';
import { generateUUIDv4, getOrCreatePlayerId, adoptServerPlayerId } from './api/player';
import { startRankedMatch } from './api/rankingApi';
import { rankedGameplayConfig } from './core/simulation/verifyScore';

type ScreenState = 'loading' | 'menu' | 'playing' | 'result';
const MswScenarioWidget = useMockApi
  ? lazy(() =>
      import('./ui/MswScenarioWidget').then((module) => ({ default: module.MswScenarioWidget })),
    )
  : null;

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [progress, setProgress] = useState<number>(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const preloadAttempt = useRef(0);
  const preloadNotice = useRef<ReturnType<typeof setTimeout>>();

  const [config, setConfig] = useState<GameplayConfig>(() => {
    return loadUserConfigFromStorage() || DEFAULT_GAMEPLAY_CONFIG;
  });

  const [simulation, setSimulation] = useState<GameSimulation | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [rendererState, setRendererState] = useState<RendererState>('loading');
  const [rendererAttempt, setRendererAttempt] = useState(0);
  const [completedMatch, setCompletedMatch] = useState<CompletedMatchData | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [suppressSubmission, setSuppressSubmission] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startingRef = useRef(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(resultTimer.current), []);
  const [helmSettings, setHelmSettings] = useState(loadHelmSettings);
  useEffect(() => {
    const audio = AudioManager.getInstance();
    audio.setMuted(helmSettings.muted);
    audio.setMasterVolume(helmSettings.volume);
  }, [helmSettings]);

  // React owns the simulation lifetime, including completion, abandonment, and restart.
  useEffect(() => {
    return () => {
      clearTimeout(resultTimer.current);
      simulation?.destroy();
    };
  }, [simulation]);

  // Asset preloading
  const startPreload = useCallback(async () => {
    const attempt = ++preloadAttempt.current;
    const isCurrent = () => attempt === preloadAttempt.current;
    clearTimeout(preloadNotice.current);
    setScreen('loading');
    setLoadingError(null);
    setLoadingSlow(false);
    setProgress(0.05);
    const notice = setTimeout(() => {
      if (isCurrent()) setLoadingSlow(true);
    }, ASSET_SLOW_NOTICE_MS);
    preloadNotice.current = notice;

    try {
      const loader = AssetLoader.getInstance();
      await loader.preload((prog) => {
        if (isCurrent()) setProgress(prog);
      });
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      setLoadingError(
        err instanceof Error ? err.message : 'Failed to load game assets. Please retry.',
      );
    } finally {
      clearTimeout(notice);
    }
  }, []);

  useEffect(() => {
    startPreload();
    return () => {
      // This is an async-attempt counter, not a DOM ref: invalidate the latest attempt.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++preloadAttempt.current;
      clearTimeout(preloadNotice.current);
    };
  }, [startPreload]);

  // Trusted gestures anywhere in the app unlock audio without making the page a tab stop.
  useEffect(() => {
    const unlock = () => AudioManager.getInstance().unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Keyboard shortcut listener for Pause (P, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing' || !simulation || simulation.isEnded || e.repeat) return;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        if (simulation.isPaused) {
          if (rendererState !== 'ready') return;
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
  }, [screen, simulation, rendererState]);

  // Match lifecycle methods
  const handleStartGame = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setStartError(null);
    try {
      const ticket = !useMockApi
        ? await startRankedMatch({
            sessionDurationSeconds: config.sessionDurationSeconds,
            enemySpawnIntervalSeconds: config.spawner.spawnIntervalSeconds,
          })
        : undefined;
      if (ticket) adoptServerPlayerId(ticket.playerId);
      const matchId = ticket?.id ?? generateUUIDv4();
      const playerId = ticket?.playerId ?? getOrCreatePlayerId();
      setSuppressSubmission(false);
      setReplayError(null);
      setHelmSettings(loadHelmSettings());
      const freshSimulation = new GameSimulation(
        ticket ? rankedGameplayConfig(ticket.config) : config,
        ticket?.seed ?? Date.now(),
      );

      // Listen for match events
      freshSimulation.addListener((event) => {
        if (event.type === 'match_ended') {
          const payload = event.payload;
          const replay = freshSimulation.getReplay() ?? undefined;
          const matchData: CompletedMatchData = {
            id: matchId,
            playerId,
            score: payload.finalScore,
            durationSeconds: Math.floor(payload.durationSeconds),
            endReason: payload.reason,
            config: {
              sessionDurationSeconds: payload.config.sessionDurationSeconds,
              enemySpawnIntervalSeconds: payload.config.spawner.spawnIntervalSeconds,
            },
            playedAt: new Date().toISOString(),
            replay,
          };

          setCompletedMatch(matchData);
          // Let the render-only wreck finish before disposing of the canvas.
          const showResult = () => {
            setSimulation(null);
            setScreen('result');
          };
          if (payload.reason === 'player_destroyed')
            resultTimer.current = setTimeout(showResult, 750);
          else showResult();
        } else if (event.type === 'match_paused') {
          setIsPaused(true);
        } else if (event.type === 'match_resumed') {
          setIsPaused(false);
        }
      });

      setSimulation(freshSimulation);
      setIsPaused(false);
      setScreen('playing');
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : 'Could not start this voyage. Try again.',
      );
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [config]);

  const handlePractice = useCallback(() => {
    setStartError(null);
    setHelmSettings(loadHelmSettings());
    const sim = new GameSimulation(config, 1337, { mode: 'training' });
    sim.addListener((event) => {
      if (event.type === 'match_paused') setIsPaused(true);
      if (event.type === 'match_resumed') setIsPaused(false);
    });
    setSimulation(sim);
    setIsPaused(false);
    setScreen('playing');
  }, [config]);

  const handleWatchReplay = useCallback(() => {
    if (!completedMatch?.replay) return;
    try {
      const sim = new GameSimulation(undefined, undefined, { replay: completedMatch.replay });
      sim.addListener((event) => {
        if (event.type === 'match_paused') setIsPaused(true);
        if (event.type === 'match_resumed') setIsPaused(false);
      });
      setSimulation(sim);
      setSuppressSubmission(true);
      setIsPaused(false);
      setReplayError(null);
      setScreen('playing');
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'Unable to open replay.');
    }
  }, [completedMatch]);

  const handlePauseToggle = useCallback(() => {
    if (!simulation) return;
    if (simulation.isPaused) {
      if (rendererState !== 'ready') return;
      simulation.resume();
      setIsPaused(false);
    } else {
      simulation.pause();
      setIsPaused(true);
    }
  }, [simulation, rendererState]);

  const handleResumeGame = useCallback(() => {
    if (simulation && rendererState === 'ready') {
      simulation.resume();
      setIsPaused(false);
    }
  }, [simulation, rendererState]);

  const handleRestoreView = () => {
    if (rendererState === 'loading') return;
    setRendererState('loading');
    setRendererAttempt((attempt) => attempt + 1);
  };

  const handleAbandonMatch = useCallback(() => {
    const destination = simulation?.mode === 'replay' ? 'result' : 'menu';
    if (simulation) {
      simulation.abandonMatch();
      setSimulation(null);
    }
    setIsPaused(false);
    setScreen(destination);
  }, [simulation]);

  const handlePlayAgain = useCallback(() => {
    handleStartGame();
  }, [handleStartGame]);

  const handleBackToMenu = useCallback(() => {
    setScreen('menu');
  }, []);

  return (
    <div
      className="relative w-screen h-dvh overflow-hidden bg-slate-950 text-slate-100 font-sans"
      role="region"
      aria-label="Pirate Battle Naval Shooter"
    >
      {isStarting && (
        <div
          role="status"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded bg-stone-950 p-3 text-sm"
        >
          Preparing your voyage...
        </div>
      )}
      {startError && (
        <div
          role="alert"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded bg-red-950 p-3 text-sm"
        >
          {startError} Try starting again, or practice while offline.
        </div>
      )}
      {/* 1. ASSET PRELOAD / ERROR SCREEN */}
      {screen === 'loading' && (
        <div className="relative w-full h-full flex flex-col items-center overflow-y-auto p-4">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
            style={{ backgroundImage: "url('/assets/ui_scene_background.png')" }}
          />
          <main className="relative z-10 w-full max-w-md my-auto shrink-0 pirate-wood-panel p-6 sm:p-8 flex flex-col items-center text-center">
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
              <div
                className="w-full flex flex-col items-center space-y-4"
                role="status"
                aria-live="polite"
              >
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
            {loadingSlow && !loadingError && (
              <div className="w-full mt-5 space-y-3 text-sm text-amber-100">
                <p role="status">
                  Loading is taking longer than usual. You can keep waiting or reload the game.
                </p>
                <p className="text-xs text-amber-200/80">
                  Reloading keeps the settings and last battle result saved on this device.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="pirate-button px-6 py-2.5 rounded font-bold uppercase tracking-wider text-sm"
                >
                  Reload game
                </button>
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
          isStarting={isStarting}
          onTraining={handlePractice}
          onUpdateConfig={(newCfg) => setConfig(newCfg)}
        />
      )}

      {/* 3. IN-GAME COMBAT ARENA */}
      {screen === 'playing' && simulation && (
        <div className="relative w-full h-full" data-testid="game-active-arena">
          <PixiCanvas
            simulation={simulation}
            settings={helmSettings}
            rendererAttempt={rendererAttempt}
            onRendererStateChange={setRendererState}
          />
          <MatchHUD
            simulation={simulation}
            settings={helmSettings}
            onPauseToggle={handlePauseToggle}
          />
          {(simulation.mode === 'training' || simulation.mode === 'replay') && (
            <VoyageOverlay
              simulation={simulation}
              onExit={handleAbandonMatch}
              onBattle={handleStartGame}
              onRestartReplay={handleWatchReplay}
            />
          )}
          <PauseModal
            isOpen={isPaused}
            onResume={handleResumeGame}
            onAbandon={handleAbandonMatch}
            rendererState={rendererState}
            onRestoreView={handleRestoreView}
          />
        </div>
      )}

      {/* 4. RESULT SCREEN */}
      {screen === 'result' && completedMatch && (
        <ResultScreen
          matchData={completedMatch}
          onPlayAgain={handlePlayAgain}
          onMainMenu={handleBackToMenu}
          onWatchReplay={completedMatch.replay ? handleWatchReplay : undefined}
          replayError={replayError}
          suppressSubmission={suppressSubmission}
          isStarting={isStarting}
        />
      )}

      {/* Floating MSW Scenario Controller */}
      {MswScenarioWidget && (
        <Suspense fallback={null}>{screen !== 'playing' && <MswScenarioWidget />}</Suspense>
      )}
    </div>
  );
};

export default App;
