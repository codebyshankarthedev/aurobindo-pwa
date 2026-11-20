# Orbital Slingshot — Game Rules, Mechanics & Architecture Specification

## 1. Overview
**Orbital Slingshot** is a physics-based orbital mechanics mini-game built for the **QC Core PWA** (`aurobindo-pwa`). The player pilots deep-space exploration probes by pulling back a slingshot launcher and utilizing planetary gravity wells and repulsor pulsars to slingshot through cosmic sectors, collect Star Crystals, and enter the Wormhole jump gate.

---

## 2. Multi-Page Screen Flow
The game consists of four distinct, seamless screens running in a centered `9:16` portrait viewport:

### Page 1: Landing & Real Asset Preloader
- Real concurrent image preloading using `new Image()` and `img.decode()` with a visible percentage progress bar (0% to 100%).
- Individual per-image timeouts guarantee the loader never hangs even on unstable networks.
- Preloaded `Image` instances are pinned in an in-memory array (`window.__ORBITAL_PRELOADED_IMAGES__`) to prevent iOS Safari texture eviction.
- Animated **Start Mission** button unlocks only upon 100% preloader completion.

### Page 2: Mission Briefing & Interactive Tutorial
- Tactical cosmic briefing explaining:
  1. **Slingshot Aiming**: Touch and pull back to set angle and propulsion force.
  2. **Gravity Assists**: High-mass planets pull the probe into hyperbolic slingshot arcs.
  3. **Repulsor Pulsars**: Anti-gravity pulsars push the probe away.
  4. **Mission Objective**: Collect 3 Star Crystals and navigate safely into the Wormhole.
- **Launch Campaign** button leads directly to the Sector Map.

### Page 3: Cosmic Sector Map & Ship Hangar
- Vertical scrolling sector map spanning 12 campaign levels across Sol, Martian Belt, Jovian Ring, Saturnian Abyss, Neptunian Deep, and Deep Void.
- **Endless Procedural Sector**: Unlocks automatically after completing Level 5.
- Displays 0–3 earned stars per level, lock states, high scores, and total cosmic stars.
- **Ship Trail Hangar**: Players can equip custom ion particle trails (Ion Cyan, Solar Flare, Plasma Magenta, Warp Emerald) unlocked as cumulative stars increase.

### Page 4: Deep-Space Arena (Active Gameplay)
- Interactive slingshot launchpad.
- Dotted 60-step predictive trajectory arc rendering in real-time as the player pulls back.
- Real-time Newtonian gravity simulation with close-range softening clamp.
- Live particle thruster trails, star crystal collections, and asteroid hazard fields.
- Victory warp sequence upon reaching the Wormhole.
- Clear, educational failure callout popups on crash or drift detailing the exact cause of probe loss (e.g., "Atmospheric Vaporization", "Deep Space Drift", "Asteroid Impact").

---

## 3. Physics Simulation & Mathematical Constants
All physics calculations are implemented in pure mathematics inside `orbital-slingshot-core.js` with zero DOM dependencies:

$$\vec{a} = \sum_{i=1}^{N} \frac{G \cdot M_i}{(r_i^2 + \epsilon^2)^{3/2}} \cdot \vec{r}_i$$

- **$G$ (Gravitational Constant)**: `1400` (scaled for normalized 0–100% stage coordinates).
- **$\epsilon$ (Softening Distance)**: `3.8` (prevents division by zero or infinite force when nearing planet centers).
- **Max Velocity**: `160` %/sec (enforces upper speed bound for stable step integration).
- **Trajectory Steps**: `60` steps at $dt = 0.04s$ (predicts $2.4s$ of flight).
- **Stage Bounds**: `[-12, 112]` in both axes. Probes exiting these bounds trigger a "Deep Space Drift" event.

---

## 4. Star Rating & Scoring Mechanics
- **3 Stars**: Reach the Wormhole having collected all 3 Star Crystals within or equal to par shots.
- **2 Stars**: Reach the Wormhole having collected 2+ Star Crystals OR within par shots.
- **1 Star**: Reach the Wormhole with any score.
- **0 Stars**: Probe lost (crashed or drifted) with no shots remaining.

### Score Formula:
$$\text{Score} = (\text{Level} \times 1000) + (\text{Crystals} \times 500) + (\max(0, 4 - \text{Shots}) \times 350) + (\max(0, 30 - \text{Time}) \times 20)$$

---

## 5. Storage & Persistence
- Save data stored under key `orbital_slingshot_save_v1` in `localStorage`.
- Wrapped in strict `try/catch` fallback blocks to support iOS Safari Private Browsing mode without runtime errors.

---

## 6. Control Keys & Desktop Shortcuts

| Key / Action | Screen | Functionality |
| :--- | :--- | :--- |
| <kbd>SPACE</kbd> / <kbd>ENTER</kbd> | Gameplay Screen | **Launch Probe**: Fires the probe immediately along the active trajectory path. |
| <kbd>SPACE</kbd> / <kbd>ENTER</kbd> | Landing / Briefing / Modals | **Primary Action**: Start Level 1, enter Sector Map, proceed to Next Sector, or Retry. |
| <kbd>↑</kbd> or <kbd>W</kbd> | Gameplay Screen | **Power Up / Higher Flight**: Increases launch velocity and extends upward reach. |
| <kbd>↓</kbd> or <kbd>S</kbd> | Gameplay Screen | **Power Down / Shorter Flight**: Decreases launch velocity for tight gravitational maneuvers. |
| <kbd>←</kbd> or <kbd>A</kbd> | Gameplay Screen | **Curve Left**: Directs trajectory curve to the left side of the cosmos. |
| <kbd>→</kbd> or <kbd>D</kbd> | Gameplay Screen | **Curve Right**: Directs trajectory curve to the right side of the cosmos. |
| <kbd>R</kbd> | Gameplay Screen | **Quick Retry**: Recalibrates probe position and restarts the current sector instantly. |
| <kbd>I</kbd> | Gameplay Screen | **Rules Sheet**: Toggles on-screen mission objectives, physics rules, and controls sheet. |
| <kbd>M</kbd> | Any Screen | **Audio Mute**: Toggles sound effects and background music on/off. |
| <kbd>ESC</kbd> | Any Screen | **Navigate Back**: Closes rules overlay, returns from Gameplay to Sector Map, or returns to Landing. |
| **Mouse / Touch Drag** | Gameplay Screen | **Slingshot**: Drag backward from the probe to aim; release to launch. |
