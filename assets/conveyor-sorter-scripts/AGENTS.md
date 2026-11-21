# Conveyor Sorter Contributor Guardrails

## Isolation Rules
1. All assets belong strictly inside `assets/conveyor-sorter-assets/` and `assets/conveyor-sorter-scripts/`.
2. Do not modify other mini-games (Orbital Slingshot, Tetris) or backend authentication code.
3. Keep `conveyor-sorter-core.js` strictly pure with zero DOM references so it runs in Node.js automated test suites.
4. Maintain iOS Safari touch drag compliance (`touch-action: none`, `pointerdown`/`pointermove`/`pointerup` on `window`, `-14px` touch lift, non-overlapping drop zones).
5. Ensure tactile on-screen buttons remain prominent and easy to tap on all mobile viewports.
