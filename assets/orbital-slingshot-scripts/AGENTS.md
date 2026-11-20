# AGENTS.md — Contributor & Agent Guardrails for "Orbital Slingshot"

This document sets the boundary rules and coding standards for AI agents and human contributors working on `orbital-slingshot`.

---

## 1. Strict Isolation Rules
1. **Never modify files belonging to other games**: Do NOT touch `My Carz`, `Rocketier`, `See Saw`, `Wave Rider`, `Match It Blast It`, `AB Express`, `Solvent Master`, `Back to School`, `Mission: Perfect Tray` or shared backend auth files.
2. The scope of this game is strictly confined to:
   - `assets/orbital-slingshot-assets/**`
   - `assets/orbital-slingshot-scripts/**`
   - `tests/orbital-slingshot.test.cjs`
   - Leading gallery entries in `index.html`
   - No-cache rule in `firebase.qc-core.json`
   - Cache bypass in `sw.js`

---

## 2. Layout & Touch Compliance
- Always design within the fixed 9:16 portrait `.stage` using `--u: calc(min(100vw, 100dvh * 9 / 16) / 100);`.
- Use percentage coordinates for all game entities and trajectory calculations.
- Always include the **Rotate Your Device** overlay for landscape mobile viewports.
- For touch events:
  - Do NOT call `setPointerCapture` on moving or animated elements.
  - Bind `pointerdown` on hitpads, and bind `pointermove`, `pointerup`, and `pointercancel` to `window` filtered by `activePointerId`.
  - Attach a non-passive `touchmove` listener calling `e.preventDefault()` during active slingshot aiming to stop iOS pull-to-refresh.
  - Apply `-14px` vertical touch lift on touch pointers.

---

## 3. Pure Logic Separation
- All mathematical modeling, collision detection, level setups, and storage handling must remain in `orbital-slingshot-core.js` with **zero DOM references**.
- UI rendering, canvas drawing, and event listeners belong exclusively in `orbital-slingshot.js`.
- Audio scheduling and BGM crossfading belong exclusively in `orbital-slingshot-audio.js`.

---

## 4. Verification Suite
Before any deployment or PR submission, all three commands must succeed:
```powershell
node --check assets/orbital-slingshot-scripts/orbital-slingshot-core.js
node --check assets/orbital-slingshot-scripts/orbital-slingshot.js
node --test tests/orbital-slingshot.test.cjs
```
