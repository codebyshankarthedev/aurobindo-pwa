# AGENTS.md — Contributor & Agent Guardrails for "See Saw"

This document sets the boundary rules and coding standards for AI agents and human contributors working on `see-saw`.

---

## 1. Strict Isolation Rules
1. Never modify unrelated games or shared auth files.
2. Scope is strictly confined to:
   - `assets/see-saw-assets/**`
   - `assets/see-saw-scripts/**`
   - `tests/see-saw.test.cjs`
   - Gallery entries in `index.html`
   - No-cache rule in `firebase.qc-core.json`
   - Cache bypass in `sw.js`

---

## 2. Layout & Touch Compliance
- Always design within the fixed 9:16 portrait `.stage` using `--u: calc(min(100vw, 100dvh * 9 / 16) / 100);`.
- Use percentage coordinates for all elements.
- Maintain the **Rotate Your Device** overlay for landscape mobile viewports.
- For touch events:
  - Do NOT call `setPointerCapture` on moving or animated elements.
  - Bind `pointerdown` on hitpads, and bind `pointermove`, `pointerup`, and `pointercancel` to `window` filtered by `activePointerId`.
  - Attach a non-passive `touchmove` listener calling `e.preventDefault()` during active drag to stop iOS pull-to-refresh.
  - Apply `-14px` vertical touch lift on touch pointers.
  - Resolve drop target before removing drag ghost.

---

## 3. Pure Logic Separation
- All mathematical modeling, torque calculation, slot validations, and persistence must remain in `see-saw-core.js` with **zero DOM references**.
- UI rendering, drag ghost management, and animations belong in `see-saw.js`.
- Audio scheduling belongs in `see-saw-audio.js`.

---

## 4. Verification Suite
Before any deployment or PR submission, all checks must succeed:
```powershell
node --check assets/see-saw-scripts/see-saw-core.js
node --check assets/see-saw-scripts/see-saw.js
node --test tests/see-saw.test.cjs
```
