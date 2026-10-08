/// <reference types="vite/client" />
// Vite's test mode is opt-in (vite build --mode test). Production omits all globals.
// The shared core also runs in Workers/Node, where Vite's env object is absent.
export const exposeTestHarness = typeof import.meta.env === 'object' &&
  (import.meta.env.DEV || import.meta.env.MODE === 'test');
