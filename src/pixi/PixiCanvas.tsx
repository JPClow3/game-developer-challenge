import React, { useEffect, useRef } from 'react';
import { GameSimulation } from '../core/simulation/GameSimulation';
import { PixiGame } from './PixiGame';

interface PixiCanvasProps {
  simulation: GameSimulation;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ simulation }) => {
  // Keyboard input state tracker
  useEffect(() => {
    const keysPressed: Record<string, boolean> = {};

    const updateSimulationInputs = () => {
      if (simulation.isPaused || simulation.isEnded) {
        simulation.clearInputs();
        return;
      }

      const throttle = keysPressed['KeyW'] || keysPressed['ArrowUp'] ? 1 : 0;
      let steer = 0;
      if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) steer -= 1;
      if (keysPressed['KeyD'] || keysPressed['ArrowRight']) steer += 1;

      const fireFront = !!(keysPressed['Space'] || keysPressed['KeyJ']);
      const fireBroadsideLeft = !!(keysPressed['KeyQ'] || keysPressed['KeyK']);
      const fireBroadsideRight = !!(keysPressed['KeyE'] || keysPressed['KeyL']);

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

      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE', 'KeyJ', 'KeyK', 'KeyL'].includes(e.code)) {
        e.preventDefault();
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
      for (const k of Object.keys(keysPressed)) {
        keysPressed[k] = false;
      }
      simulation.clearInputs();
    };

    const unsubscribe = simulation.addListener((event) => {
      if (['match_paused', 'match_resumed', 'match_ended'].includes(event.type)) handleWindowBlur();
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
  }, [simulation]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixiGameRef = useRef<PixiGame | null>(null);

  // Pixi application lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    const canvas = document.createElement('canvas');
    canvas.className = 'w-full h-full block';
    canvas.setAttribute('data-testid', 'combat-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Naval combat game arena');
    container.appendChild(canvas);

    const game = new PixiGame(simulation);
    pixiGameRef.current = game;

    // Expose simulation harness to window for Playwright automation tests
    if (typeof window !== 'undefined') {
      (window as any).__PIRATE_SIMULATION__ = simulation;
      (window as any).__PIXI_GAME__ = game;
    }

    game.init(canvas).catch((err) => {
      if (!destroyed) {
        console.error('Failed to initialize PixiGame:', err);
      }
    });

    const handleResize = () => {
      game.handleResize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      destroyed = true;
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
  }, [simulation]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 select-none touch-none"
      data-testid="pixi-canvas-container"
    />
  );
};
