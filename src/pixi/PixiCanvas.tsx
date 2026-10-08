import React, { useEffect, useRef } from 'react';
import { GameSimulation } from '../core/simulation/GameSimulation';
import { exposeTestHarness } from '../core/debug';
import { PixiGame } from './PixiGame';
import type { HelmSettings } from '../game/HelmSettings';
import { RENDERER_INIT_TIMEOUT_MS } from '../game/StartupRecovery';
export type RendererState = 'loading' | 'ready' | 'lost' | 'failed';

interface PixiCanvasProps {
  simulation: GameSimulation;
  settings: HelmSettings;
  rendererAttempt?: number;
  onRendererStateChange?: (state: RendererState) => void;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ simulation, settings, rendererAttempt = 0, onRendererStateChange }) => {
  // Keyboard input state tracker
  useEffect(() => {
    const keysPressed: Record<string, boolean> = {};
    const toggled: Record<string,boolean>={};
    const fireKeys=['Space','KeyJ','KeyQ','KeyK','KeyE','KeyL'];
    const fireAction=(code:string)=>code==='Space'||code==='KeyJ'?'front':code==='KeyQ'||code==='KeyK'?'port':'starboard';

    const updateSimulationInputs = () => {
      if (simulation.isPaused || simulation.isEnded) {
        simulation.clearInputs();
        return;
      }

      const throttle = keysPressed['KeyW'] || keysPressed['ArrowUp'] ? 1 : 0;
      let steer = 0;
      if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) steer -= 1;
      if (keysPressed['KeyD'] || keysPressed['ArrowRight']) steer += 1;

      const fireFront = settings.toggleFire ? !!toggled.front : !!(keysPressed['Space'] || keysPressed['KeyJ']);
      const fireBroadsideLeft = settings.toggleFire ? !!toggled.port : !!(keysPressed['KeyQ'] || keysPressed['KeyK']);
      const fireBroadsideRight = settings.toggleFire ? !!toggled.starboard : !!(keysPressed['KeyE'] || keysPressed['KeyL']);

      simulation.setInputs({
        throttle,
        steer,
        fireFront,
        fireBroadsideLeft,
        fireBroadsideRight,
      }, 'keyboard');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept inputs if user is typing in form fields
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || simulation.isPaused || simulation.isEnded) return;

      // A held key cleared by pause or a lesson transition needs a new press.
      if (e.repeat && !keysPressed[e.code]) return;

      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
        if (settings.toggleFire && fireKeys.includes(e.code) && !e.repeat && !keysPressed[e.code]) toggled[fireAction(e.code)]=!toggled[fireAction(e.code)];
        keysPressed[e.code] = true;
        updateSimulationInputs();


      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keysPressed[e.code]) {
        keysPressed[e.code] = false;
        updateSimulationInputs();
      }
    };

    const handleWindowBlur = () => {
      for (const key of Object.keys(toggled)) toggled[key]=false;
      for (const k of Object.keys(keysPressed)) {
        keysPressed[k] = false;
      }
      simulation.clearInputs();
    };

    const unsubscribe = simulation.addListener((event) => {
      if (['match_paused', 'match_resumed', 'match_ended', 'training_progress'].includes(event.type)) handleWindowBlur();
    });

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [simulation,settings.toggleFire]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixiGameRef = useRef<PixiGame | null>(null);

  // Pixi application lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let contextLost = false;
    let initializationFailed = false;
    let restoreFrame = 0;
    onRendererStateChange?.('loading');
    const canvas = document.createElement('canvas');
    canvas.className = 'w-full h-full block';
    canvas.setAttribute('data-testid', 'combat-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Naval combat game arena');
    container.appendChild(canvas);

    const game = new PixiGame(simulation);
    pixiGameRef.current = game;

    const stopForRecovery = () => {
      game.app.ticker?.stop();
      simulation.pause();
    };
    const fail = (error: unknown) => {
      if (destroyed || initializationFailed) return;
      initializationFailed = true;
      clearTimeout(initializationTimeout);
      stopForRecovery();
      onRendererStateChange?.('failed');
      game.destroy();
      console.warn('Graphics initialization failed; recovery is available:', error);
    };
    const handleContextLost = (event: Event) => {
      if (destroyed || initializationFailed) return;
      event.preventDefault();
      contextLost = true;
      stopForRecovery();
      onRendererStateChange?.('lost');
    };
    const handleContextRestored = () => {
      if (destroyed || initializationFailed) return;
      // Pixi restores its GPU resources in its native event listener. Redraw
      // on the following frame, after every restoration listener has finished.
      cancelAnimationFrame(restoreFrame);
      restoreFrame = requestAnimationFrame(() => {
        if (destroyed || initializationFailed) return;
        contextLost = false;
        if (!game.isReady) return; // init completion will announce readiness.
        try {
          game.handleResize();
          game.app.ticker.start();
          onRendererStateChange?.('ready');
        } catch (error) { fail(error); }
      });
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // Expose simulation harness to window for Playwright automation tests
    if (exposeTestHarness && typeof window !== 'undefined') {
      (window as any).__PIRATE_SIMULATION__ = simulation;
      (window as any).__PIXI_GAME__ = game;
    }

    const initializationTimeout = setTimeout(() => {
      fail(new Error('Graphics initialization did not finish within 20 seconds.'));
    }, RENDERER_INIT_TIMEOUT_MS);
    game.init(canvas).then(() => {
      clearTimeout(initializationTimeout);
      if (destroyed || initializationFailed) return;
      if (contextLost) stopForRecovery();
      else onRendererStateChange?.('ready');
    }).catch(fail);

    const handleResize = () => {
      if (contextLost || initializationFailed) return;
      game.handleResize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      destroyed = true;
      clearTimeout(initializationTimeout);
      cancelAnimationFrame(restoreFrame);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('resize', handleResize);
      game.destroy();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      pixiGameRef.current = null;
      if (typeof window !== 'undefined') {
        if ((window as any).__PIXI_GAME__ === game) {
          delete (window as any).__PIXI_GAME__;
        }
      }
    };
  }, [simulation, rendererAttempt, onRendererStateChange]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 select-none touch-none"
      data-testid="pixi-canvas-container"
    />
  );
};
