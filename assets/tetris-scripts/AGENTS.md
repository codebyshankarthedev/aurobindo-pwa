# Tetris Contributor Guardrails

## Isolation Rules
1. All assets belong strictly inside `assets/tetris-assets/` and `assets/tetris-scripts/`.
2. Do not modify other mini-games or backend authentication endpoints.
3. Keep `tetris-core.js` strictly pure with zero DOM references so it runs in Node.js automated test suites.
4. Maintain Super Rotation System (SRS) kick tests and 7-bag randomizer integrity.
5. All buttons and keycaps must remain tactile, mobile touch-friendly, with minimum 48px touch targets and safe-area insets.
