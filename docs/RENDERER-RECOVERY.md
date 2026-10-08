# Game view recovery

WebGL context loss pauses the battle and clears held input. Native context restoration rebuilds Pixi resources and redraws the current scene. Manual restoration replaces the renderer while retaining the same simulation, including health, score, enemies, projectiles and elapsed ticks. Both routes keep the battle paused until the player resumes. Keyboard controls require a fresh press.

Failed or hung graphics initialization offers Restore game view or abandonment. Late initialization completions cannot replace a recovered view. React owns the simulation lifetime; replacing the renderer does not restart or submit a match.

`tests/e2e/22_renderer_recovery.spec.ts` exercises context loss, native/manual restoration, retry, abandonment and an initial pause before rendering is ready. `tests/e2e/26_startup_recovery.spec.ts` covers asset stalls and graphics initialization deadlines. Both run against the delivered battle. Unit lifecycle checks cover disposal and late async completion.

See the committed reports for current validation. Browser emulation is separate from physical device testing.
