# Conveyor Sorter — Game Rules & Specifications

## 1. Overview & Objectives
Conveyor Sorter is a high-speed quality categorization mini-game. Objects riding on an animated conveyor belt consist of Alphabets (`A, B, C, D, E, F, K, M, S, X`) and Numbers (`1, 2, 3, 4, 5, 7, 8, 9`). Players direct each token into the correct containment chamber before it slides off the conveyor belt.

---

## 2. Containers & Categorization Rules
- **🔤 Alphabets Container (Cyan Left Chamber):** Accepts all alphabet letters.
- **🔢 Numbers Container (Purple/Gold Right Chamber):** Accepts all numeric digits.
- **Valid Sort:** Dropping or routing a token into its matching chamber scores points and builds streak combos.
- **Invalid Sort:** Directing a token into the wrong chamber registers a contamination mistake and resets the combo streak.
- **Belt Overflow:** Allowing a token to fall off the right edge without being sorted counts as a missed item mistake.

---

## 3. Dual Interaction Systems (Drag & Drop + Mobile Buttons)
1. **Direct Touch Drag & Drop:**
   - Touch and drag any moving token directly from the conveyor belt into the target chamber.
   - `-14px` fingertip lift for unobstructed visibility on mobile devices.
   - Chambers highlight when a hovered token enters their aperture.
2. **Tactile On-Screen Buttons:**
   - `<kbd>A / ◄</kbd> 🔤 DROP IN ALPHABETS`: Instantly routes the leading token in the inspection zone into the Alphabets chamber.
   - `<kbd>N / ►</kbd> 🔢 DROP IN NUMBERS`: Instantly routes the leading token into the Numbers chamber.
   - `<kbd>SPACE</kbd> ⏸️ PAUSE BELT`: Pauses conveyor movement to allow careful inspection.
   - `<kbd>⚡</kbd> SPEED BOOST`: Toggles conveyor velocity (1.0x, 1.8x, 0.6x).

---

## 4. Par Star Ratings
- **3 Stars:** Complete sector quota with 95%+ accuracy and zero mistakes.
- **2 Stars:** Complete quota with 80%+ accuracy and ≤2 mistakes.
- **1 Star:** Complete quota.
