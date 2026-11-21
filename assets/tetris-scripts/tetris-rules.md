# Tetris — QC Core Matrix Rules & Specifications

## 1. Overview & Mechanics
Tetris is a standard 10-column by 20-row falling-block puzzle game calibrated for QC laboratory data matrix synthesis. Players manipulate seven standard geometric pieces (tetrominoes: I, J, L, O, S, T, Z) to complete horizontal rows. Completed rows dissolve, scoring points and progressing through 12 QC sectors.

---

## 2. Super Rotation System (SRS)
- Standard 4-state rotation (0: North, 1: East, 2: South, 3: West).
- Super Rotation System (SRS) wall-kick offset evaluations:
  - When rotating against boundaries or placed blocks, 5 sequential kick tests are tested.
  - I-piece uses dedicated 4×4 SRS kick table.
  - J, L, S, T, Z use 3×3 kick table.
  - O-piece does not require kicks.

---

## 3. 7-Bag Randomizer
- Guarantees fair piece distributions without starvation or droughts.
- Generates permutations of all 7 tetrominoes in pseudo-random sequences.

---

## 4. On-Screen Touch Controls (Mobile Deck)
- **LEFT / RIGHT:** Tap or hold for Delayed Auto-Shift (DAS: 160ms initial delay, ARR: 45ms auto-repeat).
- **SOFT DROP:** Hold to accelerate downward velocity at 10x speed.
- **⚡ HARD DROP NOW:** Instantaneous vertical drop + lock piece + matrix screen rumble + sound effect.
- **↻ ROTATE (CW):** Super Rotation Clockwise.
- **↺ CCW:** Super Rotation Counter-Clockwise.
- **⇲ HOLD:** Chamber current piece for later deployment.
- **SWIPE GESTURES:**
  - Swipe Left/Right: Lateral drift.
  - Swipe Down: Soft drop.
  - Swipe Up: Instant hard drop.
  - Single Tap: Rotate CW.

---

## 5. Scoring & Par Star Ratings
- 1 Line: 100 × Level
- 2 Lines: 300 × Level
- 3 Lines: 500 × Level
- 4 Lines (TETRIS): 800 × Level
- Hard Drop Bonus: 2 points per cell dropped.
- 1 Star: Complete sector target lines or target score.
- 2 Stars: Exceed target score by 25% or clear +2 extra lines.
- 3 Stars: Exceed target score by 60% or clear +4 extra lines.
