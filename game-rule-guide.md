# QC Core — Mini-Game Development Rule Guide

This is the single-file handbook for building, integrating, testing, and deploying new mini-games in the **Aurobindo QC Core PWA** (`aurobindo-pwa`). Share this file with any developer or AI coding agent building a new game.

---

## 1. Repository & Folder Structure (Strict Separation)

Keep every game completely isolated so games never collide or break each other:

```text
aurobindo-pwa/
├── index.html                              # Main app (Games + RC Games galleries)
├── sw.js                                   # Root PWA service worker
├── firebase.qc-core.json                   # Firebase Hosting config (headers + rewrites)
├── assets/
│   ├── <game-slug>-assets/                 # ALL images (.webp/.gif), audio (.mp3/.wav)
│   │   ├── page-1/                         # Landing/Title screen assets
│   │   ├── page-2/                         # Storytelling / Demo screens
│   │   ├── page-3/                         # Home / Level map
│   │   ├── page-4/                         # Main gameplay assets
│   │   └── audio/                          # Menu BGM, Game BGM, SFX
│   └── <game-slug>-scripts/                # ALL runtime code & docs for the game
│       ├── <game-slug>.html                # Standalone entry page
│       ├── <game-slug>.css                 # Responsive 9:16 portrait styles & animations
│       ├── <game-slug>.js                  # UI, canvas/DOM loop, input, screen routing
│       ├── <game-slug>-core.js             # Pure game logic (levels, rules, scoring)
│       ├── <game-slug>-audio.js            # Smooth BGM crossfade + SFX manager
│       ├── AGENTS.md                       # Game-specific contributor guardrails
│       └── <game-slug>-rules.md            # Game flow & approved design rules
└── tests/
    └── <game-slug>.test.cjs                # Node.js unit tests for *-core.js + asset checks
```

### Isolation Rules
- **Never** modify unrelated games (especially My Carz, Rocketier, See Saw, Wave Rider, Match It Blast It, AB Express, Solvent Master, Back to School, Mission: Perfect Tray) or shared auth/review backend code.
- **Never** delete or silently weaken existing features, timings, or approved animations when fixing bugs.
- Always obtain explicit user approval before making out-of-scope changes or deletions.

---

## 2. Gallery Integration (`index.html`)

- Add every new game **first** (leading position) in **both** galleries in `index.html`, keeping all older games in their existing relative order:
  1. Main **Games** gallery (`.game-gallery`):
     ```html
     <a class="game-poster poster-<game-slug> playable-poster"
        href="assets/<game-slug>-scripts/<game-slug>.html?v=1&amp;from=games"
        aria-label="Play <Game Name>">
       <div class="poster-card-wrap">
         <img src="assets/<game-slug>-assets/page-1/page-1-bg.webp"
              alt="<Game Name>" class="poster-card-image" loading="lazy">
       </div>
     </a>
     ```
  2. **RC Games** gallery (`#rc-game-gallery`): same markup with `&amp;from=rc-games`.
- **Exit / Back button**: Always read `?from=` from `location.search` and navigate back to `../../index.html#games` (if `from === 'games'`) or `../../index.html#rc-games` (default).

---

## 3. Portrait-First 9:16 Stage & Responsive Layout

- Design for **9:16 portrait** mobile screens (works cleanly on iPhone SE `375×667`, modern iPhones, Android, and desktop viewports).
- Use a centered fixed-aspect stage with proportional CSS unit `--u`:
  ```css
  .stage {
    --u: calc(min(100vw, 100dvh * 9 / 16) / 100);
    position: relative;
    width: min(100vw, calc(100dvh * 9 / 16));
    height: min(100dvh, calc(100vw * 16 / 9));
    aspect-ratio: 9 / 16;
    overflow: hidden;
  }
  ```
- Respect safe areas (`env(safe-area-inset-*)`) and `100dvh`.
- Include a **Rotate Your Device** overlay on coarse-pointer landscape viewports (`@media (orientation: landscape) and (max-height: 540px) and (pointer: coarse)`).
- Place all interactive elements, HUD counters, buttons, and animations using percentage coordinates relative to the `9:16` stage so layout never shifts across screen sizes.

---

## 4. Asset Preloading (Zero Lag on Live)

- **Do not** use fake timer progress bars.
- Preload **all** story/demo screens (including animated `.gif`s), UI overlays, and gameplay sprites concurrently on Page 1 with real `Image` load + `img.decode()` progress updates.
- Keep preloaded `Image` instances referenced in an in-memory array so mobile Safari / Chrome does not evict decoded bitmaps mid-game.
- Only show the Page 1 **Next / Start** button once preloading hits `100%` (with a safe per-image timeout fallback so a single slow file never hangs the loader).

---

## 5. Mobile & iPhone (iOS Safari) Touch / Drag-and-Drop Rules

iOS Safari breaks naive drag-and-drop implementations. Always follow these rules:
1. Add `touch-action: none; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;` on the active gameplay screen and draggable elements, plus `-webkit-user-drag: none;` on images.
2. **Avoid `setPointerCapture` on moving/scaling `<img>` elements** — attach `pointerdown` to the draggable wrapper (with a generous invisible `::before` touch hit-pad), and attach `pointermove`, `pointerup`, and `pointercancel` to `window` filtered by `activePointerId`.
3. Add a `window` `touchmove` listener with `{ passive: false }` that calls `e.preventDefault()` while dragging, preventing iOS Safari rubber-band scrolling / pull-to-refresh from hijacking drags.
4. On touch (`e.pointerType === 'touch'`), apply a small vertical lift (`-14px`) so the player's fingertip doesn't obscure the dragged object, and use the **exact same coordinates** for hover highlighting and drop resolution.
5. **Resolve drop targets BEFORE removing the drag ghost**, and use **non-overlapping hit zones** (trimmed for transparent drop-shadow padding) so adjacent containers/targets can never steal each other's drops.
6. Handle `pointercancel` cleanly by restoring the item rather than counting it as a wrong move.

---

## 6. Audio Rules (Smooth BGM + SFX)

- Separate audio management into `<game-slug>-audio.js`.
- **Unlock audio** on the first user gesture (`pointerdown` / `keydown`) for mobile Safari/Chrome autoplay compliance.
- **Smooth BGM crossfades**: When switching between Menu BGM and Gameplay BGM, fade out the outgoing track and fade in the incoming track smoothly (never cut abruptly).
- Provide a persistent **Mute / Unmute toggle** button accessible on every screen.
- Reset `sfx.currentTime = 0` (or clone/pool audio) so rapid SFX plays cleanly without clipping.

---

## 7. Animation & Visual Polish Standards

- Keep all animations smooth (`requestAnimationFrame` with clamped `dt`, e.g. `Math.min(80, now - lastFrameTime)`) and **physically synced** — if an object rides on a moving surface (like a conveyor belt), both the surface and object must share the exact same projection function and frame delta `du`.
- Sequence feedback clearly: e.g. drop-into-container → container squash/bounce → confetti burst → result popup ejection → next item spawn.
- On wrong-answer screens, make it obvious **why** the answer was wrong (e.g. show a clear close-up of the item + concise reason text).
- Always clean up `requestAnimationFrame` loops and `setTimeout` timers on level restart, screen transitions, and exit.

---

## 8. Pure Core Logic & Automated Testing

- Put all pure game rules (level configs, queue generation, answer/drop validation, star/level progression, `localStorage` state helpers) in `<game-slug>-core.js` with **zero DOM dependencies**.
- Create `tests/<game-slug>.test.cjs` using Node's built-in `node:test` and `node:assert/strict`:
  - Verify every asset path referenced in `*-core.js` actually exists on disk.
  - Verify level queues, item counts, and balanced distributions.
  - Verify win/loss/validation edge cases (including any dual-valid items) and full multi-level progression.
- Before every deploy, run:
  ```powershell
  node --check assets/<game-slug>-scripts/<game-slug>-core.js
  node --check assets/<game-slug>-scripts/<game-slug>.js
  node --test tests/<game-slug>.test.cjs
  ```

---

## 9. Caching, Staging & Firebase Deployment

### Prevent Stale Cache on Mobile / PWA
1. **HTML `<meta>` & query versions**: Add `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` in `<game-slug>.html`, and bump `?v=N` on CSS, JS, ES module imports, and replaced media assets whenever updated.
2. **Firebase Hosting headers** (`firebase.qc-core.json`): Add a no-cache rule for the game's folders:
   ```json
   {"source": "/assets/<game-slug>-*/**", "headers": [{"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"}]}
   ```
3. **Service Worker** (`sw.js`): Bypass cache for `/assets/<game-slug>-` with `fetch(event.request, { cache: 'no-store' })` and bump the `CACHE` version (`vXXX`) when updating `sw.js`.

### Staging & Live Deployment (`apl-qc-core-app-f5a3e` / `https://apl.redchariots.in`)
- Live Hosting serves from `dist/qc-core/` (configured in `firebase.qc-core.json`).
- Always mirror updated source files (`index.html`, `sw.js`, `assets/<game-slug>-assets/`, `assets/<game-slug>-scripts/`) into `dist/qc-core/` (or rebuild via `npm run prepare:qc-core` + `npm run check:qc-core`).
- Deploy with:
  ```powershell
  firebase deploy --only hosting --project apl-qc-core-app-f5a3e --config firebase.qc-core.json
  ```
- **Never** commit secrets, credentials, `.env` files, or `dist/` artifacts to Git, and only push to Git when explicitly requested.

---

## 10. Recommended Reference Templates in This Repo

- **Latest 9:16 Portrait Game**: `assets/mission-perfect-tray-scripts/` + `tests/mission-perfect-tray.test.cjs`
- **Multi-Screen Rules & Handoff Docs**: `assets/see-saw-scripts/AGENTS.md`, `see-saw-rules.md`, `README.md`
- **Deployment Checklist**: `deployment/qc-core/README.md`
