# See Saw — Game Rules, Mechanics & Physics Architecture

## 1. Overview
**See Saw** is an analytical torque balance puzzle mini-game built for the **QC Core PWA** (`aurobindo-pwa`). Set in an Aurobindo Quality Control laboratory, players test pharmaceutical weights and chemical aliquots on a precision balance beam to achieve torque equilibrium:

$$\tau_{\text{net}} = \sum (\text{mass}_i \times d_i) = 0$$

where:
- $\text{mass}_i$ is the mass of the weight or vial in grams.
- $d_i$ is the signed slot distance from the central fulcrum ($d = -3, -2, -1$ on the left arm, and $d = +1, +2, +3$ on the right arm).

---

## 2. Multi-Page Screen Flow
The game operates in a centered `9:16` portrait viewport with 4 distinct screens:

### Page 1: Calibration & Real Asset Preloader
- Real concurrent image preloading using `new Image()` and `img.decode()` with live progress percentage (0% to 100%).
- Decoded `Image` references are retained in memory (`window.__SEESAW_PRELOADED_IMAGES__`) to prevent iOS Safari memory purges.
- Start button activates only after 100% preloading is confirmed.

### Page 2: Analytical Briefing & Interactive Tutorial
- Step-by-step laboratory training:
  1. **Torque Leverage**: Torque equals mass multiplied by distance from fulcrum.
  2. **Drag & Drop**: Pick up calibration weights and deposit them onto beam slots.
  3. **Equilibrium Indicator**: Needle rests in the green center zone when net torque is 0.
  4. **Par Moves & Stars**: Achieve balance with the minimum moves to earn 3 Stars.

### Page 3: Station Selection & Level Map
- 12 progressively challenging laboratory calibration stations across Standardization, Formulation Suite, Reagent Assay, Titration Bay, Chromatography Wing, and Master QC Suite.
- Procedural **Endless Aliquot Mode** unlocked after completing Level 5.
- Displays 0–3 earned stars, lock states, high scores, and cumulative laboratory stars.

### Page 4: Analytical Balance Station (Gameplay)
- Interactive seesaw balance beam physically pivoting on a central fulcrum.
- 6 highlighted calibration slots (3 left, 3 right) with non-overlapping hit targets.
- Draggable weight tray at the bottom.
- Smooth tilting animation calculated using damped angular torque:
  $$\theta = \text{clamp}(\tau_{\text{net}} \times 0.85^\circ, -14^\circ, +14^\circ)$$
- Live balance needle and equilibrium indicator glow when balanced.
- Clear error feedback if imbalance exceeds limit.

---

## 3. Touch & Drag-and-Drop Rules (iOS Safari Strict Compliance)
- Drag starts on `.weight-item` wrapper with an expanded touch hit-pad.
- Binds `pointerdown` to item, and `pointermove`, `pointerup`, `pointercancel` to `window` filtered by `activePointerId`.
- Non-passive `window` `touchmove` listener calls `e.preventDefault()` while dragging.
- `-14px` vertical touch offset lifts the dragged item above the player's fingertip.
- Drop target is resolved strictly **before** removing the drag ghost.
- On `pointercancel`, the item is safely restored to its origin without consuming a move.

---

## 4. Scoring & Par System
- **3 Stars**: Achieved equilibrium in $\le \text{parMoves}$.
- **2 Stars**: Achieved equilibrium in $\le \text{parMoves} + 1$.
- **1 Star**: Achieved equilibrium with extra moves.
- **Score Formula**:
  $$\text{Score} = (\text{Level} \times 1000) + (\max(0, 10 - \text{Moves}) \times 200) + (\max(0, 30 - \text{Time}) \times 25)$$

---

## 5. Control Keys & Desktop Shortcuts

| Key / Action | Screen | Functionality |
| :--- | :--- | :--- |
| <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> | Gameplay Screen | **Left Slots**: Places next rack weight on `L-3` (3x), `L-2` (2x), or `L-1` (1x). |
| <kbd>4</kbd>, <kbd>5</kbd>, <kbd>6</kbd> | Gameplay Screen | **Right Slots**: Places next rack weight on `R-1` (1x), `R-2` (2x), or `R-3` (3x). |
| <kbd>SPACE</kbd> / <kbd>ENTER</kbd> | Gameplay Screen | **Auto-Balance**: Evaluates open slots and places next available weight on optimal counter-slot. |
| <kbd>SPACE</kbd> / <kbd>ENTER</kbd> | Landing / Briefing / Modals | **Primary Action**: Start Station 1, enter Station Map, or advance to Next Station. |
| <kbd>BACKSPACE</kbd> | Gameplay Screen | **Undo / Remove**: Returns the last placed non-locked weight from the beam to the tray. |
| <kbd>R</kbd> | Gameplay Screen | **Reset Balance**: Clears placed weights back to rack and resets moves. |
| <kbd>I</kbd> | Gameplay Screen | **SOP Rules Sheet**: Toggles laboratory standard operating procedure and torque reference. |
| <kbd>M</kbd> | Any Screen | **Audio Mute**: Toggles sound effects and BGM on/off. |
| <kbd>ESC</kbd> | Any Screen | **Navigate Back**: Closes rules overlay, returns to Station Map, or returns to Landing. |
| **Mouse / Touch Drag** | Gameplay Screen | **Drag & Drop**: Drag precision weights from tray onto beam calibration slots. |
