/**
 * See Saw — Client Controller & Drag-and-Drop Balance Engine
 * Strict iOS Safari touch compliance, -14px lift, drop-before-remove ghost resolution,
 * concurrent asset preloading, and smooth physics animations.
 */

(function () {
  'use strict';

  const Core = window.SeeSawCore;
  const AudioManager = window.SeeSawAudio;

  if (!Core || !AudioManager) {
    console.error('See Saw: Missing Core or Audio module.');
    return;
  }

  // Helper to resolve asset path relative to this script directory
  function resolveAssetUrl(p) {
    if (!p) return '';
    if (p.startsWith('../') || p.startsWith('http') || p.startsWith('data:')) return p;
    if (p.startsWith('assets/see-saw-assets/')) {
      return '../' + p.slice('assets/'.length);
    }
    return '../see-saw-assets/' + p;
  }

  // Persistent array to prevent Safari image bitmap eviction
  window.__SEESAW_PRELOADED_IMAGES__ = [];
  const imageCache = new Map();

  const audio = new AudioManager();
  let saveData = Core.loadSaveData(window.localStorage);

  let currentScreen = 'landing';
  let activeLevel = Core.LEVELS[0];
  let isEndlessMode = false;
  let endlessIndex = 13;
  let gameState = null;
  let activeTimeouts = [];

  // Drag & Tap State
  let isDragging = false;
  let activePointerId = null;
  let draggedItemData = null; // { weight, fromSlotId?: string, originEl?: HTMLElement }
  let dragGhost = null;
  let selectedWeightIndex = null;
  let pendingWeightTouch = null;

  // DOM Elements
  const stage = document.getElementById('stage');
  const screens = {
    landing: document.getElementById('screen-landing'),
    tutorial: document.getElementById('screen-tutorial'),
    map: document.getElementById('screen-map'),
    game: document.getElementById('screen-game')
  };

  const beamPivot = document.getElementById('seesaw-beam-pivot');
  const dialPointer = document.getElementById('dial-pointer');
  const hudLevelName = document.getElementById('hud-level-name');
  const hudTorqueStatus = document.getElementById('hud-torque-status');
  const hudMovesPill = document.getElementById('hud-moves-pill');
  const rackList = document.getElementById('rack-weights-list');
  const modalVictory = document.getElementById('modal-victory');

  function setSafeTimeout(fn, ms) {
    const id = setTimeout(() => {
      const idx = activeTimeouts.indexOf(id);
      if (idx !== -1) activeTimeouts.splice(idx, 1);
      fn();
    }, ms);
    activeTimeouts.push(id);
    return id;
  }

  function clearAllTimeouts() {
    activeTimeouts.forEach(id => clearTimeout(id));
    activeTimeouts = [];
  }

  // --- Dynamic Viewport Proportional Unit ---
  function updateViewportUnits() {
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    const u = Math.max(2.8, Math.min(vw, vh * 9 / 16) / 100);
    document.documentElement.style.setProperty('--u', `${u}px`);
    if (stage) stage.style.setProperty('--u', `${u}px`);
  }

  // --- 1. CONCURRENT ASSET PRELOADER ---
  function preloadAllAssets() {
    const percentEl = document.getElementById('preloader-percent');
    const barFill = document.getElementById('preloader-bar-fill');
    const statusEl = document.getElementById('preloader-status');
    const startWrap = document.getElementById('start-btn-wrap');

    const assetList = Core.ASSETS.images;
    const total = assetList.length;
    let completed = 0;

    function updateProgress() {
      const pct = Math.floor((completed / total) * 100);
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (barFill) barFill.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = `Calibrating analytical sensors... ${pct}%`;

      if (completed >= total) {
        if (statusEl) statusEl.textContent = 'Analytical balance zeroed and ready.';
        if (startWrap) startWrap.style.display = 'flex';
      }
    }

    assetList.forEach(rawSrc => {
      const resolved = resolveAssetUrl(rawSrc);
      const img = new Image();
      img.src = resolved;

      let finished = false;
      const timeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          completed++;
          updateProgress();
        }
      }, 3000);

      const onDone = () => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          window.__SEESAW_PRELOADED_IMAGES__.push(img);
          imageCache.set(rawSrc, img);
          imageCache.set(resolved, img);
          const fname = rawSrc.split('/').pop();
          imageCache.set(fname, img);
          completed++;
          updateProgress();
        }
      };

      if (img.decode) {
        img.decode().then(onDone).catch(onDone);
      } else {
        img.onload = onDone;
        img.onerror = onDone;
      }
    });

    if (startWrap) startWrap.style.display = 'flex';
  }

  // --- 2. SCREEN ROUTING ---
  function showScreen(screenName) {
    clearAllTimeouts();

    Object.keys(screens).forEach(name => {
      screens[name].classList.remove('active');
    });

    const target = screens[screenName];
    if (target) {
      target.classList.add('active');
      currentScreen = screenName;
    }

    updateViewportUnits();

    if (screenName === 'game') {
      audio.playBgm('game');
    } else {
      audio.playBgm('menu');
    }

    if (screenName === 'map') {
      renderStationMap();
    }
  }

  // --- 3. STATION MAP RENDERING ---
  function renderStationMap() {
    const container = document.getElementById('levels-container');
    const totalStarsEl = document.getElementById('total-stars-count');
    container.innerHTML = '';

    const totalStars = Object.values(saveData.levelStars).reduce((sum, s) => sum + s, 0);
    totalStarsEl.textContent = `${totalStars} / 36`;

    Core.LEVELS.forEach(level => {
      const isUnlocked = saveData.unlockedLevels.includes(level.id);
      const starsEarned = saveData.levelStars[level.id] || 0;
      const card = document.createElement('div');
      card.className = `level-card ${isUnlocked ? '' : 'locked'}`;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Station ${level.id}: ${level.title}`);

      card.innerHTML = `
        <div class="level-card-left">
          <img src="../see-saw-assets/page-3/${level.badge}.png" alt="${level.labStation}" class="station-badge">
          <div class="level-info">
            <span class="level-number">Station ${level.id}</span>
            <span class="level-name">${level.title}</span>
            <span class="level-sector-name">${level.labStation}</span>
          </div>
        </div>
        <div class="level-card-right">
          ${isUnlocked
            ? `<img src="../see-saw-assets/page-3/star-badge-${starsEarned}.png" alt="${starsEarned} stars" class="level-star-badge">`
            : `<img src="../see-saw-assets/page-3/lock-icon.png" alt="Locked" class="level-lock-badge">`
          }
        </div>
      `;

      if (isUnlocked) {
        addTapListener(card, () => {
          isEndlessMode = false;
          startLevel(level);
        });
      }
      container.appendChild(card);
    });

    // Endless Mode Card
    if (saveData.endlessUnlocked) {
      const endlessCard = document.createElement('div');
      endlessCard.className = 'level-card';
      endlessCard.style.borderColor = 'var(--color-teal)';
      endlessCard.innerHTML = `
        <div class="level-card-left">
          <img src="../see-saw-assets/page-3/lab-badge-6.png" alt="Endless" class="station-badge">
          <div class="level-info">
            <span class="level-number">Endless Titration</span>
            <span class="level-name">Continuous Batch Assay</span>
            <span class="level-sector-name">High Score: ${saveData.endlessHighScore || 0}</span>
          </div>
        </div>
        <div class="level-card-right">
          <button class="btn-secondary" style="padding: 6px 12px; font-size: 11px;">ENTER</button>
        </div>
      `;
      addTapListener(endlessCard, () => {
        isEndlessMode = true;
        endlessIndex = 13;
        startLevel(Core.generateProceduralLevel(endlessIndex));
      });
      container.appendChild(endlessCard);
    }
  }

  // --- 4. GAMEPLAY START & LEVEL RENDER ---
  function startLevel(levelConfig) {
    activeLevel = levelConfig;
    gameState = Core.createGameState(levelConfig);
    selectedWeightIndex = null;

    modalVictory.classList.remove('active');
    hudLevelName.textContent = `Station ${levelConfig.id}: ${levelConfig.title}`;

    updateBeamVisuals();
    renderRack();
    showScreen('game');
  }

  function handleSlotClick(slotId) {
    if (!gameState || gameState.isBalanced) return;
    const currentWeight = gameState.slots[slotId];
    if (currentWeight) {
      if (!currentWeight.locked) {
        const removed = Core.removeWeightFromSlot(gameState, slotId);
        if (removed) {
          gameState.rack.push(removed);
          audio.playSfx('drop');
          selectedWeightIndex = null;
          renderRack();
          updateBeamVisuals();
        }
      }
    } else {
      let weightToPlace = null;
      if (selectedWeightIndex !== null && gameState.rack[selectedWeightIndex]) {
        weightToPlace = gameState.rack.splice(selectedWeightIndex, 1)[0];
        selectedWeightIndex = null;
      } else if (gameState.rack.length > 0) {
        weightToPlace = gameState.rack.shift();
      }

      if (weightToPlace) {
        Core.placeWeightInSlot(gameState, weightToPlace, slotId);
        audio.playSfx('drop');
        renderRack();
        updateBeamVisuals();
      }
    }
  }

  function updateQuickSlotButtons() {
    Core.CONSTANTS.SLOTS.forEach(slotDef => {
      const btn = document.getElementById(`btn-slot-${slotDef.id}`);
      if (!btn) return;
      const weight = gameState ? gameState.slots[slotDef.id] : null;
      btn.classList.remove('occupied', 'slot-ready');

      if (weight) {
        btn.classList.add('occupied');
        btn.innerHTML = `${slotDef.id} <span class="slot-factor">${weight.mass}g</span>`;
      } else {
        btn.innerHTML = `${slotDef.id} <span class="slot-factor">${slotDef.distance}x</span>`;
        if (selectedWeightIndex !== null && gameState && gameState.rack[selectedWeightIndex]) {
          btn.classList.add('slot-ready');
        }
      }
    });
  }

  function updateBeamVisuals() {
    if (!gameState) return;

    // Apply calculated rotation to beam and needle
    beamPivot.style.transform = `translate(-50%, -50%) rotate(${gameState.tiltAngleDeg}deg)`;
    dialPointer.style.transform = `rotate(${gameState.tiltAngleDeg * 2.5}deg)`;

    // Update HUD
    const net = gameState.netTorque;
    const isBal = gameState.isBalanced;
    hudTorqueStatus.textContent = `L: ${gameState.leftTorque} | R: ${gameState.rightTorque} (Imbalance: ${net > 0 ? '+' : ''}${net})`;
    hudTorqueStatus.className = `hud-torque-status ${isBal ? 'balanced' : ''}`;
    hudMovesPill.textContent = `MOVES: ${gameState.movesUsed}/${gameState.parMoves}`;

    // Update Quick Slot Bar
    updateQuickSlotButtons();

    // Render Slots contents
    Core.CONSTANTS.SLOTS.forEach(slotDef => {
      const slotEl = document.getElementById(`slot-${slotDef.id}`);
      if (!slotEl) return;

      const weight = gameState.slots[slotDef.id];
      slotEl.innerHTML = `<span class="slot-tag">${slotDef.label}</span>`;
      slotEl.classList.remove('occupied', 'slot-ready');

      if (weight) {
        slotEl.classList.add('occupied');
        const img = document.createElement('img');
        img.src = `../see-saw-assets/page-4/${weight.sprite}`;
        img.alt = weight.label;
        img.className = 'placed-weight-img';
        slotEl.appendChild(img);

        // If not locked, allow tap to return to rack OR drag off the beam
        if (!weight.locked) {
          slotEl.style.cursor = 'pointer';
          slotEl.onpointerdown = (e) => {
            if (gameState.isBalanced) return;
            pendingWeightTouch = {
              startX: e.clientX,
              startY: e.clientY,
              weight: weight,
              idx: null,
              pointerId: e.pointerId,
              originEl: slotEl,
              fromSlotId: slotDef.id,
              isTouch: e.pointerType === 'touch'
            };
          };
        } else {
          slotEl.style.cursor = 'default';
          slotEl.onpointerdown = null;
        }
      } else {
        // Slot is empty: if a weight is selected, pulse as a ready drop target
        if (selectedWeightIndex !== null && gameState.rack[selectedWeightIndex]) {
          slotEl.classList.add('slot-ready');
        }
        slotEl.style.cursor = 'pointer';

        slotEl.onpointerdown = (e) => {
          if (gameState.isBalanced) return;
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          handleSlotClick(slotDef.id);
        };
      }
    });

    if (isBal && gameState.status === 'balanced') {
      audio.playSfx('balance');
      setSafeTimeout(handleVictory, 700);
    }
  }

  function renderRack() {
    rackList.innerHTML = '';
    gameState.rack.forEach((weight, idx) => {
      const item = document.createElement('div');
      item.className = `weight-item ${selectedWeightIndex === idx ? 'selected' : ''}`;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Weight ${weight.label}`);

      item.innerHTML = `
        <img src="../see-saw-assets/page-4/${weight.sprite}" alt="${weight.label}" class="weight-sprite">
        <span class="weight-label">${weight.label}</span>
      `;

      item.addEventListener('pointerdown', (e) => {
        if (gameState.isBalanced) return;
        pendingWeightTouch = {
          startX: e.clientX,
          startY: e.clientY,
          weight: weight,
          idx: idx,
          pointerId: e.pointerId,
          originEl: item,
          fromSlotId: null,
          isTouch: e.pointerType === 'touch'
        };
      });

      rackList.appendChild(item);
    });
  }

  // --- 5. TOUCH & DRAG-AND-DROP WITH 65px MAGNETIC SNAP & INSTANT TAP ---
  function updateGhostPosition(clientX, clientY) {
    if (!dragGhost) return;
    dragGhost.style.left = `${clientX}px`;
    dragGhost.style.top = `${clientY}px`;
  }

  function resolveDropSlot(clientX, clientY) {
    const slots = document.querySelectorAll('.beam-slot');
    let closestSlot = null;
    let minDistance = Infinity;

    slots.forEach(slot => {
      const rect = slot.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (dist < minDistance) {
        minDistance = dist;
        closestSlot = slot;
      }
    });

    // 65px radius magnetic drop snap for mobile touch accuracy
    if (minDistance < 65) {
      return closestSlot;
    }
    return null;
  }

  window.addEventListener('pointermove', (e) => {
    // Check if pending touch should promote to active drag (16px threshold for forgiving mobile touch)
    if (pendingWeightTouch && !isDragging && e.pointerId === pendingWeightTouch.pointerId) {
      const dist = Math.hypot(e.clientX - pendingWeightTouch.startX, e.clientY - pendingWeightTouch.startY);
      if (dist > 16) {
        isDragging = true;
        activePointerId = pendingWeightTouch.pointerId;
        draggedItemData = {
          weight: pendingWeightTouch.weight,
          idx: pendingWeightTouch.idx,
          fromSlotId: pendingWeightTouch.fromSlotId,
          originEl: pendingWeightTouch.originEl
        };

        const touchLift = pendingWeightTouch.isTouch ? -14 : 0;
        dragGhost = document.createElement('div');
        dragGhost.className = 'drag-ghost';
        dragGhost.innerHTML = `<img src="../see-saw-assets/page-4/${draggedItemData.weight.sprite}" style="width: 44px; height: 44px; object-fit: contain;">`;
        document.body.appendChild(dragGhost);
        updateGhostPosition(e.clientX, e.clientY + touchLift);
      }
    }

    if (!isDragging || e.pointerId !== activePointerId) return;
    if (e.cancelable) e.preventDefault();

    const isTouch = e.pointerType === 'touch';
    const touchLift = isTouch ? -14 : 0;
    const curX = e.clientX;
    const curY = e.clientY + touchLift;

    updateGhostPosition(curX, curY);

    // Highlight candidate hover slot
    const hoverSlot = resolveDropSlot(curX, curY);
    document.querySelectorAll('.beam-slot').forEach(s => s.classList.remove('hover-target'));
    if (hoverSlot && !hoverSlot.classList.contains('occupied')) {
      hoverSlot.classList.add('hover-target');
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (isDragging && e.pointerId === activePointerId) {
      if (e.cancelable) e.preventDefault();
      const isTouch = e.pointerType === 'touch';
      const touchLift = isTouch ? -14 : 0;
      const dropX = e.clientX;
      const dropY = e.clientY + touchLift;

      const targetSlot = resolveDropSlot(dropX, dropY);
      document.querySelectorAll('.beam-slot').forEach(s => s.classList.remove('hover-target'));

      if (targetSlot) {
        const slotId = targetSlot.getAttribute('data-slot');
        if (gameState.slots[slotId] === null) {
          if (draggedItemData.fromSlotId) {
            Core.removeWeightFromSlot(gameState, draggedItemData.fromSlotId);
          } else {
            const idx = gameState.rack.findIndex(w => w.id === draggedItemData.weight.id);
            if (idx !== -1) gameState.rack.splice(idx, 1);
          }
          selectedWeightIndex = null;
          Core.placeWeightInSlot(gameState, draggedItemData.weight, slotId);
          audio.playSfx('drop');
          renderRack();
          updateBeamVisuals();
        }
      } else {
        if (draggedItemData.fromSlotId) {
          const removed = Core.removeWeightFromSlot(gameState, draggedItemData.fromSlotId);
          if (removed) {
            gameState.rack.push(removed);
            audio.playSfx('drop');
            renderRack();
            updateBeamVisuals();
          }
        } else {
          // If released near origin without hitting a slot, treat as tap to toggle selection
          const dist = Math.hypot(e.clientX - (pendingWeightTouch ? pendingWeightTouch.startX : 0), e.clientY - (pendingWeightTouch ? pendingWeightTouch.startY : 0));
          if (dist < 40 && draggedItemData && draggedItemData.idx !== null) {
            selectedWeightIndex = (selectedWeightIndex === draggedItemData.idx) ? null : draggedItemData.idx;
            audio.playSfx('drop');
            renderRack();
            updateBeamVisuals();
          }
        }
      }

      if (dragGhost && dragGhost.parentNode) {
        dragGhost.parentNode.removeChild(dragGhost);
      }
      dragGhost = null;
      isDragging = false;
      activePointerId = null;
      draggedItemData = null;
      pendingWeightTouch = null;
      return;
    }

    // Tap Gesture Resolution
    if (pendingWeightTouch && e.pointerId === pendingWeightTouch.pointerId) {
      const dist = Math.hypot(e.clientX - pendingWeightTouch.startX, e.clientY - pendingWeightTouch.startY);
      if (dist <= 24) {
        if (pendingWeightTouch.fromSlotId) {
          // Tap on placed beam weight -> return to rack
          const removed = Core.removeWeightFromSlot(gameState, pendingWeightTouch.fromSlotId);
          if (removed) {
            gameState.rack.push(removed);
            audio.playSfx('drop');
            selectedWeightIndex = null;
            renderRack();
            updateBeamVisuals();
          }
        } else {
          // Tap on rack weight -> toggle selection
          selectedWeightIndex = (selectedWeightIndex === pendingWeightTouch.idx) ? null : pendingWeightTouch.idx;
          audio.playSfx('drop');
          renderRack();
          updateBeamVisuals();
        }
      }
      pendingWeightTouch = null;
    }
  });

  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointerId) {
      if (dragGhost && dragGhost.parentNode) {
        dragGhost.parentNode.removeChild(dragGhost);
      }
      dragGhost = null;
      isDragging = false;
      activePointerId = null;
      draggedItemData = null;
      updateBeamVisuals();
    }
    pendingWeightTouch = null;
  });

  window.addEventListener('touchmove', (e) => {
    if (isDragging) {
      e.preventDefault();
    }
  }, { passive: false });

  // --- 6. VICTORY WORKFLOW ---
  function handleVictory() {
    const stars = Core.calculateStars(gameState.movesUsed, gameState.parMoves);
    const score = Core.calculateScore(activeLevel.id, gameState.movesUsed, gameState.elapsedTime);

    saveData = Core.unlockNextLevel(saveData, activeLevel.id, stars, score);
    if (isEndlessMode && score > (saveData.endlessHighScore || 0)) {
      saveData.endlessHighScore = score;
    }
    Core.saveGameData(window.localStorage, saveData);

    document.getElementById('victory-moves').textContent = `${gameState.movesUsed} (Par: ${gameState.parMoves})`;
    document.getElementById('victory-score').textContent = score.toLocaleString();

    const starImgs = document.querySelectorAll('#victory-stars-row .modal-star-img');
    starImgs.forEach((img, i) => {
      img.classList.remove('show');
      if (i < stars) {
        setSafeTimeout(() => {
          img.classList.add('show');
          audio.playSfx('star');
        }, 200 + i * 250);
      }
    });

    modalVictory.classList.add('active');
  }

  // --- 7. BUTTON NAVIGATION & MUTE ---
  function exitGame() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from === 'games') {
      window.location.href = '../../index.html#games';
    } else if (from === 'rc-games') {
      window.location.href = '../../index.html#rc-games';
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '../../index.html';
    }
  }

  function autoBalanceHelper() {
    if (!gameState || gameState.isBalanced || gameState.rack.length === 0) return;
    const weight = gameState.rack[0];
    const emptySlots = Core.CONSTANTS.SLOTS.filter(s => gameState.slots[s.id] === null);

    let bestSlot = null;
    let bestImbalance = Infinity;

    emptySlots.forEach(s => {
      const testSlots = { ...gameState.slots, [s.id]: weight };
      const t = Core.calculateTorque(testSlots);
      const imbal = Math.abs(t.netTorque);
      if (imbal < bestImbalance) {
        bestImbalance = imbal;
        bestSlot = s.id;
      }
    });

    if (bestSlot) {
      gameState.rack.shift();
      Core.placeWeightInSlot(gameState, weight, bestSlot);
      audio.playSfx('drop');
      renderRack();
      updateBeamVisuals();
    }
  }

  function undoLastMove() {
    if (!gameState || gameState.isBalanced) return;
    const placedSlots = Object.keys(gameState.slots).filter(s => gameState.slots[s] && !gameState.slots[s].locked);
    if (placedSlots.length > 0) {
      const lastSlot = placedSlots[placedSlots.length - 1];
      const removed = Core.removeWeightFromSlot(gameState, lastSlot);
      if (removed) {
        gameState.rack.push(removed);
        audio.playSfx('drop');
        renderRack();
        updateBeamVisuals();
      }
    }
  }

  function flashButton(btnId) {
    const el = document.getElementById(btnId);
    if (el) {
      el.classList.add('active-press');
      setTimeout(() => el.classList.remove('active-press'), 140);
    }
  }

  function addTapListener(el, callback) {
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let lastTime = 0;

    function fire(e) {
      const now = Date.now();
      if (now - lastTime < 180) return;
      lastTime = now;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      callback(e);
    }

    el.addEventListener('pointerdown', (e) => {
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      el.classList.add('active-press');
    }, { passive: true });

    el.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('active-press');
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist < 28) {
        fire(e);
      }
    });

    el.addEventListener('pointercancel', () => {
      isDown = false;
      el.classList.remove('active-press');
    });

    el.addEventListener('click', (e) => {
      fire(e);
    });
  }

  function setupEventListeners() {
    addTapListener(document.getElementById('btn-landing-exit'), exitGame);
    addTapListener(document.getElementById('btn-quick-play'), () => startLevel(Core.LEVELS[0]));
    addTapListener(document.getElementById('btn-start'), () => showScreen('tutorial'));

    addTapListener(document.getElementById('btn-tutorial-back'), () => showScreen('landing'));
    addTapListener(document.getElementById('btn-tutorial-continue'), () => showScreen('map'));

    addTapListener(document.getElementById('btn-map-exit'), exitGame);
    addTapListener(document.getElementById('btn-game-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-game-exit'), exitGame);
    addTapListener(document.getElementById('btn-game-retry'), () => startLevel(activeLevel));

    // Calibration Rack Action Buttons
    addTapListener(document.getElementById('btn-auto-balance'), () => {
      flashButton('btn-auto-balance');
      autoBalanceHelper();
    });

    addTapListener(document.getElementById('btn-undo-move'), () => {
      flashButton('btn-undo-move');
      undoLastMove();
    });

    addTapListener(document.getElementById('btn-reset-rack'), () => {
      flashButton('btn-reset-rack');
      startLevel(activeLevel);
    });

    // 6 Quick Beam Slot Buttons
    Core.CONSTANTS.SLOTS.forEach(slotDef => {
      const btn = document.getElementById(`btn-slot-${slotDef.id}`);
      if (btn) {
        addTapListener(btn, () => {
          flashButton(`btn-slot-${slotDef.id}`);
          handleSlotClick(slotDef.id);
        });
      }
    });

    addTapListener(document.getElementById('btn-next-level'), () => {
      if (isEndlessMode) {
        endlessIndex++;
        startLevel(Core.generateProceduralLevel(endlessIndex));
      } else {
        const nextLevel = Core.LEVELS.find(l => l.id === activeLevel.id + 1);
        if (nextLevel) {
          startLevel(nextLevel);
        } else {
          showScreen('map');
        }
      }
    });

    addTapListener(document.getElementById('btn-replay-level'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-victory-map'), () => showScreen('map'));

    // Mute Toggles
    document.querySelectorAll('.btn-mute').forEach(btn => {
      addTapListener(btn, () => {
        const muted = audio.toggleMute();
        saveData.soundMuted = muted;
        Core.saveGameData(window.localStorage, saveData);
        document.querySelectorAll('.btn-mute').forEach(b => {
          b.textContent = muted ? '🔇' : '🔊';
        });
      });
    });

    window.addEventListener('resize', () => {
      updateViewportUnits();
    });

    // Rules Modal Toggle
    const modalRules = document.getElementById('modal-rules');
    const btnRules = document.getElementById('btn-see-saw-rules');
    const btnCloseRules = document.getElementById('btn-close-rules');
    if (btnRules && modalRules) {
      addTapListener(btnRules, () => modalRules.classList.add('active'));
    }
    if (btnCloseRules && modalRules) {
      addTapListener(btnCloseRules, () => modalRules.classList.remove('active'));
    }

    // Keyboard Controls (Desktop Accessibility)
    window.addEventListener('keydown', (e) => {
      // 1. Mute Audio Hotkey
      if (e.key === 'm' || e.key === 'M') {
        const muted = audio.toggleMute();
        saveData.soundMuted = muted;
        Core.saveGameData(window.localStorage, saveData);
        document.querySelectorAll('.btn-mute').forEach(b => {
          b.textContent = muted ? '🔇' : '🔊';
        });
        return;
      }

      // 2. Rules Toggle Hotkey
      if (e.key === 'i' || e.key === 'I') {
        if (modalRules) {
          modalRules.classList.toggle('active');
        }
        return;
      }

      // 3. Escape: Close modal or navigate back
      if (e.key === 'Escape') {
        if (modalRules && modalRules.classList.contains('active')) {
          modalRules.classList.remove('active');
          return;
        }
        if (currentScreen === 'game') {
          showScreen('map');
        } else if (currentScreen === 'map' || currentScreen === 'tutorial') {
          showScreen('landing');
        }
        return;
      }

      // 4. Any key pressed on landing page automatically starts Station 1!
      if (currentScreen === 'landing') {
        e.preventDefault();
        startLevel(Core.LEVELS[0]);
        return;
      } else if (currentScreen === 'tutorial') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          showScreen('map');
          return;
        }
      } else if (currentScreen === 'map') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          const targetLvl = Core.LEVELS.find(l => saveData.unlockedLevels.includes(l.id)) || Core.LEVELS[0];
          startLevel(targetLvl);
          return;
        }
      }

      // 5. Active Gameplay Controls
      if (currentScreen === 'game' && gameState) {
        // Reset Station Hotkey
        if (e.key === 'r' || e.key === 'R') {
          startLevel(activeLevel);
          return;
        }

        // Victory Modal Next Station
        if (modalVictory && modalVictory.classList.contains('active')) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const nextLevel = Core.LEVELS.find(l => l.id === activeLevel.id + 1);
            if (nextLevel) startLevel(nextLevel);
            else showScreen('map');
            return;
          }
        }

        // Keys 1 to 6 map to slots L-3, L-2, L-1, R-1, R-2, R-3
        const slotKeys = {
          '1': 'L-3',
          '2': 'L-2',
          '3': 'L-1',
          '4': 'R-1',
          '5': 'R-2',
          '6': 'R-3'
        };

        if (slotKeys[e.key] && !gameState.isBalanced) {
          const targetSlotId = slotKeys[e.key];
          flashButton(`btn-slot-${targetSlotId}`);
          handleSlotClick(targetSlotId);
          return;
        }

        // Space / Enter: Auto-balance helper
        if ((e.key === ' ' || e.key === 'Enter') && !gameState.isBalanced) {
          e.preventDefault();
          autoBalanceHelper();
          return;
        }

        // Backspace removes last placed non-locked weight
        if (e.key === 'Backspace' && !gameState.isBalanced) {
          undoLastMove();
        }
      }
    });
  }

  function init() {
    updateViewportUnits();
    setupEventListeners();
    if (saveData.soundMuted) {
      audio.setMuted(true);
      document.querySelectorAll('.btn-mute').forEach(b => {
        b.textContent = '🔇';
      });
    }

    preloadAllAssets();
    audio.playBgm('menu');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
