/**
 * Conveyor Sorter — Client Controller & DOM/Canvas Renderer
 * Strictly complies with iOS Safari touch standards, 9:16 portrait layout,
 * concurrent asset preloading, drag-and-drop hit zones, and tactical on-screen keys.
 */

(function () {
  'use strict';

  const Core = window.ConveyorSorterCore;
  const AudioManager = window.ConveyorSorterAudio;

  if (!Core || !AudioManager) {
    console.error('Conveyor Sorter: Missing Core or Audio module.');
    return;
  }

  // Preloaded textures storage
  window.__CONVEYOR_PRELOADED_IMAGES__ = [];
  const imageCache = new Map();

  // Audio & Save System
  const audio = new AudioManager();
  let saveData = Core.loadSaveData(window.localStorage);

  // App State
  let currentScreen = 'landing';
  let activeLevel = Core.LEVELS[0];
  let gameState = null;
  let animFrameId = null;
  let lastFrameTime = performance.now();
  let activeTimeouts = [];

  // Active Dragging State
  let activePointerId = null;
  let draggedItem = null;
  let dragOffset = { x: 0, y: 0 };
  let currentHoverContainer = null;

  // DOM Elements
  const stage = document.getElementById('stage');
  const screens = {
    landing: document.getElementById('screen-landing'),
    tutorial: document.getElementById('screen-tutorial'),
    map: document.getElementById('screen-map'),
    game: document.getElementById('screen-game')
  };

  const arenaBody = document.getElementById('sorting-arena-body');
  const tokensLane = document.getElementById('tokens-lane');
  const dragLayer = document.getElementById('drag-layer');
  const containerAlpha = document.getElementById('container-alpha');
  const containerNumber = document.getElementById('container-number');
  const alphaTally = document.getElementById('alpha-tally');
  const numberTally = document.getElementById('number-tally');
  const streakPill = document.getElementById('streak-pill');
  const scannerStatus = document.getElementById('scanner-status');
  const labelBeltPause = document.getElementById('label-belt-pause');
  const labelBeltSpeed = document.getElementById('label-belt-speed');

  // Modals & HUD
  const modalVictory = document.getElementById('modal-victory');
  const modalDefeat = document.getElementById('modal-defeat');
  const modalRules = document.getElementById('modal-rules');
  const hudLevelName = document.getElementById('hud-level-name');
  const hudSortedLabel = document.getElementById('hud-sorted-label');
  const hudMistakesLabel = document.getElementById('hud-mistakes-label');

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

  // Viewport Sizing
  function updateViewportUnits() {
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    const u = Math.min(vw, (vh * 9) / 16) / 100;
    document.documentElement.style.setProperty('--u', `${u}px`);
    if (stage) stage.style.setProperty('--u', `${u}px`);
  }

  function getStageCoords(clientX, clientY, isTouch = false) {
    if (!stage) return { x: 50, y: 50 };
    const rect = stage.getBoundingClientRect();
    const touchOffsetY = isTouch ? -14 : 0;
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY + touchOffsetY - rect.top) / rect.height) * 100));
    return { x: xPct, y: yPct };
  }

  // --- 1. ASSET PRELOADER ---
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
      if (statusEl) statusEl.textContent = `Calibrating optical chutes... ${pct}%`;

      if (completed >= total) {
        if (statusEl) statusEl.textContent = 'Conveyor telemetry nominal. Ready for sorting.';
        if (startWrap) startWrap.style.display = 'flex';
      }
    }

    assetList.forEach(rawSrc => {
      let resolved = rawSrc;
      if (rawSrc.startsWith('assets/conveyor-sorter-assets/')) {
        resolved = '../' + rawSrc.slice('assets/'.length);
      }
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
          window.__CONVEYOR_PRELOADED_IMAGES__.push(img);
          imageCache.set(rawSrc, img);
          imageCache.set(resolved, img);
          const fname = rawSrc.split('/').pop().replace(/\.png$|\.webp$/, '');
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

  // --- 2. SCREEN ROUTER ---
  function showScreen(screenName) {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    clearAllTimeouts();

    Object.keys(screens).forEach(name => {
      if (screens[name]) screens[name].classList.remove('active');
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
      renderSectorMap();
    }
  }

  // --- 3. SECTOR MAP RENDERING ---
  function renderSectorMap() {
    const container = document.getElementById('levels-container');
    const totalStarsEl = document.getElementById('total-stars-count');
    if (!container) return;
    container.innerHTML = '';

    const starsObj = (saveData && saveData.levelStars) ? saveData.levelStars : { 1: 0 };
    const totalStars = Object.values(starsObj).reduce((sum, s) => sum + (Number(s) || 0), 0);
    if (totalStarsEl) totalStarsEl.textContent = `${totalStars} / 36`;

    const unlocked = (saveData && Array.isArray(saveData.unlockedLevels) && saveData.unlockedLevels.length > 0)
      ? saveData.unlockedLevels
      : [1];

    let latestUnlockedLevel = Core.LEVELS[0];

    Core.LEVELS.forEach(level => {
      const isUnlocked = unlocked.includes(level.id);
      if (isUnlocked) latestUnlockedLevel = level;
      const starsEarned = (saveData && saveData.levelStars && saveData.levelStars[level.id]) || 0;

      const card = document.createElement('div');
      card.className = `level-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Sector ${level.id}: ${level.title}`);

      card.innerHTML = `
        <div class="level-card-left">
          <img src="../conveyor-sorter-assets/page-3/${level.sectorBadge}.png" alt="${level.sector}" class="sector-badge" onerror="this.style.display='none'">
          <div class="level-info">
            <span class="level-number">Sector ${level.id}</span>
            <span class="level-name">${level.title}</span>
            <span class="level-sector-name">${level.sector}</span>
          </div>
        </div>
        <div class="level-card-right">
          ${isUnlocked
            ? `<div class="stars-earned-box">${'★'.repeat(starsEarned)}${'☆'.repeat(3 - starsEarned)}</div><button class="btn-level-play-pill">PLAY ▶</button>`
            : `<img src="../conveyor-sorter-assets/page-3/lock-icon.png" alt="Locked" class="level-lock-badge">`
          }
        </div>
      `;

      if (isUnlocked) {
        addTapListener(card, () => {
          startLevel(level);
        });
      }
      container.appendChild(card);
    });

    const mapQuickBtn = document.getElementById('btn-map-quick-launch');
    if (mapQuickBtn) {
      const titleSpan = mapQuickBtn.querySelector('.launch-title');
      if (titleSpan) {
        titleSpan.textContent = `📦 PLAY SECTOR ${latestUnlockedLevel.id} NOW`;
      }
    }
  }

  // --- 4. GAMEPLAY LOOP & LOGIC ---
  function startLevel(levelConfig) {
    activeLevel = levelConfig;
    gameState = Core.initGameState(levelConfig);
    draggedItem = null;
    activePointerId = null;
    currentHoverContainer = null;

    if (modalVictory) modalVictory.classList.remove('active');
    if (modalDefeat) modalDefeat.classList.remove('active');
    if (modalRules) modalRules.classList.remove('active');

    if (containerAlpha) containerAlpha.classList.remove('hover-target', 'success-bounce');
    if (containerNumber) containerNumber.classList.remove('hover-target', 'success-bounce');

    updateHud();
    showScreen('game');

    lastFrameTime = performance.now();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updateHud() {
    if (!gameState) return;
    if (hudLevelName) hudLevelName.textContent = `Sector ${gameState.level.id}: ${gameState.level.title}`;
    if (hudSortedLabel) hudSortedLabel.textContent = `SORTED: ${gameState.sortedCount} / ${gameState.level.targetQuota}`;
    if (hudMistakesLabel) hudMistakesLabel.textContent = `MISTAKES: ${gameState.mistakesCount}/${gameState.level.maxMistakes}`;

    if (streakPill) streakPill.textContent = `STREAK: ${gameState.streak}🔥`;
    if (alphaTally) {
      const count = gameState.items.filter(it => it.state === 'sorted' && it.type === 'alphabet').length;
      alphaTally.textContent = `${count}`;
    }
    if (numberTally) {
      const count = gameState.items.filter(it => it.state === 'sorted' && it.type === 'number').length;
      numberTally.textContent = `${count}`;
    }
  }

  function triggerScreenRumble() {
    if (!stage) return;
    stage.style.transition = 'transform 0.05s ease';
    stage.style.transform = `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px)`;
    setTimeout(() => {
      stage.style.transform = 'translate(0, 0)';
    }, 100);
  }

  function gameLoop(now) {
    const dt = Math.min(80, now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (currentScreen === 'game' && gameState && gameState.status === 'playing') {
      updateConveyorPhysics(dt);
      renderTokens();
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updateConveyorPhysics(dt) {
    if (gameState.beltPaused) return;

    const speed = gameState.level.speedPctPerSec * gameState.speedMultiplier;
    let overflowOccurred = false;

    gameState.items.forEach(item => {
      if (item.state === 'riding') {
        item.xPct += speed * dt;

        // When item passes off right edge (overflow)
        if (item.xPct > 98) {
          item.state = 'missed';
          gameState.mistakesCount++;
          gameState.streak = 0;
          overflowOccurred = true;
          audio.playSfx('drop-fail');
          triggerScreenRumble();
          updateHud();

          if (scannerStatus) {
            scannerStatus.textContent = `MISSED: '${item.char}' slid off the conveyor!`;
            scannerStatus.style.color = 'var(--color-danger)';
          }

          if (gameState.mistakesCount >= gameState.level.maxMistakes) {
            handleGameOver(`Batch Overflow: '${item.char}' fell off the conveyor unsorted!`);
          }
        }
      }
    });

    // Check if new items need to be generated to keep the belt moving
    const remainingToSpawn = gameState.items.filter(it => it.state === 'riding' || it.xPct < 100);
    if (remainingToSpawn.length < 5 && gameState.sortedCount < gameState.level.targetQuota) {
      const extraItems = Core.generateItemSequence(6);
      const minX = Math.min(...gameState.items.map(i => i.xPct), -10);
      extraItems.forEach((extra, idx) => {
        extra.xPct = minX - 26 * (idx + 1);
        gameState.items.push(extra);
      });
    }
  }

  // --- 5. TOKEN DOM RENDERING & DRAG HANDLING ---
  function renderTokens() {
    if (!tokensLane || !gameState) return;

    // Find leading item for UI focus
    const visibleActive = gameState.items
      .filter(it => it.state === 'riding' && it.xPct >= -5 && it.xPct <= 92)
      .sort((a, b) => b.xPct - a.xPct);
    const leadingItem = visibleActive[0] || null;

    if (scannerStatus && gameState.status === 'playing') {
      if (leadingItem) {
        scannerStatus.textContent = `INSPECTING: '${leadingItem.char}' (${leadingItem.type.toUpperCase()})`;
        scannerStatus.style.color = leadingItem.type === 'alphabet' ? 'var(--color-cyan)' : 'var(--color-gold)';
      } else {
        scannerStatus.textContent = 'OPTICAL SENSORS ACTIVE';
        scannerStatus.style.color = 'var(--color-cyan)';
      }
    }

    // Synchronize DOM elements with gameState.items
    gameState.items.forEach(item => {
      let el = document.getElementById(`token-${item.id}`);

      if (item.state === 'sorted' || item.state === 'missed') {
        if (el) el.remove();
        return;
      }

      if (!el) {
        el = document.createElement('div');
        el.id = `token-${item.id}`;
        el.className = `token-crate ${item.type}`;
        el.innerHTML = `<span class="token-char">${item.char}</span>`;

        // Touch/Pointer Drag Listener
        el.addEventListener('pointerdown', (e) => onTokenPointerDown(e, item));
        tokensLane.appendChild(el);
      }

      // Update position and DOM parenting
      if (item.state === 'dragging') {
        el.classList.add('dragging');
        if (dragLayer && el.parentNode !== dragLayer) {
          dragLayer.appendChild(el);
        }
        el.style.left = `${item.dragX}%`;
        el.style.top = `${item.dragY}%`;
        el.style.transform = 'translate(-50%, -50%) scale(1.18)';
      } else {
        el.classList.remove('dragging');
        if (tokensLane && el.parentNode !== tokensLane) {
          tokensLane.appendChild(el);
        }
        el.style.left = `${item.xPct}%`;
        el.style.top = '50%';
        el.style.transform = 'translateY(-50%)';
      }

      // Focus leading item with pulsing indicator
      if (leadingItem && leadingItem.id === item.id) {
        el.classList.add('leading-focus');
      } else {
        el.classList.remove('leading-focus');
      }
    });
  }

  // Pointer Drag Handlers
  function onTokenPointerDown(e, item) {
    if (!gameState || gameState.status !== 'playing' || activePointerId !== null) return;
    if (e.cancelable) e.preventDefault();

    activePointerId = e.pointerId;
    draggedItem = item;
    item.state = 'dragging';

    const coords = getStageCoords(e.clientX, e.clientY, e.pointerType === 'touch');
    item.dragX = coords.x;
    item.dragY = coords.y;

    const el = document.getElementById(`token-${item.id}`);
    if (el) {
      if (dragLayer && el.parentNode !== dragLayer) {
        dragLayer.appendChild(el);
      }
      el.classList.add('dragging');
      el.style.left = `${coords.x}%`;
      el.style.top = `${coords.y}%`;
      el.style.transform = 'translate(-50%, -50%) scale(1.18)';
    }

    audio.playSfx('grab');

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
  }

  function onWindowPointerMove(e) {
    if (e.pointerId !== activePointerId || !draggedItem) return;
    if (e.cancelable) e.preventDefault();

    const isTouch = e.pointerType === 'touch';
    const coords = getStageCoords(e.clientX, e.clientY, isTouch);
    draggedItem.dragX = coords.x;
    draggedItem.dragY = coords.y;

    const el = document.getElementById(`token-${draggedItem.id}`);
    if (el) {
      el.style.left = `${coords.x}%`;
      el.style.top = `${coords.y}%`;
    }

    // Check Container Hover
    const hover = Core.getContainerAt(coords.x, coords.y);
    currentHoverContainer = hover ? hover.id : null;

    if (containerAlpha) {
      if (currentHoverContainer === 'alphabet') containerAlpha.classList.add('hover-target');
      else containerAlpha.classList.remove('hover-target');
    }
    if (containerNumber) {
      if (currentHoverContainer === 'number') containerNumber.classList.add('hover-target');
      else containerNumber.classList.remove('hover-target');
    }
  }

  function onWindowPointerUp(e) {
    if (e.pointerId !== activePointerId || !draggedItem) return;
    const isTouch = e.pointerType === 'touch';
    const coords = getStageCoords(e.clientX, e.clientY, isTouch);

    const targetContainer = Core.getContainerAt(coords.x, coords.y);
    const item = draggedItem;

    if (targetContainer) {
      cleanupDrag(false);
      resolveDrop(item, targetContainer.id);
    } else {
      cleanupDrag(true);
      if (scannerStatus) {
        scannerStatus.textContent = 'Token returned to conveyor belt.';
        scannerStatus.style.color = 'var(--color-cyan)';
      }
    }
  }

  function onWindowPointerCancel(e) {
    if (e.pointerId !== activePointerId || !draggedItem) return;
    cleanupDrag(true);
  }

  function cleanupDrag(returnToBelt = true) {
    if (draggedItem) {
      if (returnToBelt && draggedItem.state === 'dragging') {
        draggedItem.state = 'riding';
        const el = document.getElementById(`token-${draggedItem.id}`);
        if (el && tokensLane) {
          tokensLane.appendChild(el);
          el.classList.remove('dragging');
          el.style.left = `${draggedItem.xPct}%`;
          el.style.top = '50%';
          el.style.transform = 'translateY(-50%)';
        }
      }
    }
    activePointerId = null;
    draggedItem = null;
    currentHoverContainer = null;
    if (containerAlpha) containerAlpha.classList.remove('hover-target');
    if (containerNumber) containerNumber.classList.remove('hover-target');
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerCancel);
  }

  // --- 6. DROP RESOLUTION & QUICK SORT ---
  function resolveDrop(item, targetContainerId) {
    if (!targetContainerId) {
      // Dropped in open space -> snap back onto conveyor
      item.state = 'riding';
      return;
    }

    const validation = Core.validateDrop(item, targetContainerId);

    if (validation.success) {
      item.state = 'sorted';
      gameState.sortedCount++;
      gameState.streak++;
      if (gameState.streak > gameState.bestStreak) {
        gameState.bestStreak = gameState.streak;
      }
      gameState.score += 100 + gameState.streak * 25;

      const targetEl = targetContainerId === 'alphabet' ? containerAlpha : containerNumber;
      if (targetEl) {
        targetEl.classList.add('success-bounce');
        setTimeout(() => targetEl.classList.remove('success-bounce'), 350);
      }

      if (gameState.streak >= 3) {
        audio.playSfx('combo');
      } else {
        audio.playSfx('drop-success');
      }

      if (scannerStatus) {
        scannerStatus.textContent = validation.reason;
        scannerStatus.style.color = 'var(--color-green)';
      }

      updateHud();

      // Check Victory
      if (gameState.sortedCount >= gameState.level.targetQuota) {
        handleVictory();
      }
    } else {
      // Wrong Container
      item.state = 'sorted'; // remove from belt to prevent repeated failure
      gameState.mistakesCount++;
      gameState.streak = 0;

      audio.playSfx('drop-fail');
      triggerScreenRumble();

      if (scannerStatus) {
        scannerStatus.textContent = validation.reason;
        scannerStatus.style.color = 'var(--color-danger)';
      }

      updateHud();

      if (gameState.mistakesCount >= gameState.level.maxMistakes) {
        handleGameOver(validation.reason);
      }
    }
  }

  // On-Screen Tactical Quick Sort (Routes leading visible item to container)
  function quickSortLeadingItem(targetContainerId) {
    if (!gameState || gameState.status !== 'playing') return;

    // Find leading item on belt
    const visibleActive = gameState.items
      .filter(it => it.state === 'riding' && it.xPct >= -5 && it.xPct <= 92)
      .sort((a, b) => b.xPct - a.xPct);
    const leading = visibleActive[0];

    if (!leading) {
      if (scannerStatus) {
        scannerStatus.textContent = 'NO TOKENS CURRENTLY IN INSPECTION ZONE!';
        scannerStatus.style.color = 'var(--color-gold)';
      }
      return;
    }

    resolveDrop(leading, targetContainerId);
  }

  function handleVictory() {
    gameState.status = 'victory';
    const stars = Core.calculateStars(gameState.level, gameState.sortedCount, gameState.mistakesCount, gameState.items.length);

    if (!saveData.unlockedLevels.includes(gameState.level.id + 1) && gameState.level.id < 12) {
      saveData.unlockedLevels.push(gameState.level.id + 1);
    }
    const oldStars = (saveData.levelStars && saveData.levelStars[gameState.level.id]) || 0;
    saveData.levelStars[gameState.level.id] = Math.max(oldStars, stars);
    if (gameState.score > (saveData.highScore || 0)) {
      saveData.highScore = gameState.score;
    }
    Core.saveGameData(window.localStorage, saveData);

    const victorySorted = document.getElementById('victory-sorted');
    const victoryStreak = document.getElementById('victory-streak');
    const victoryStarsRow = document.getElementById('victory-stars-row');

    if (victorySorted) victorySorted.textContent = `${gameState.sortedCount}/${gameState.level.targetQuota}`;
    if (victoryStreak) victoryStreak.textContent = `${gameState.bestStreak}🔥`;
    if (victoryStarsRow) {
      victoryStarsRow.innerHTML = '';
      for (let i = 0; i < stars; i++) {
        const span = document.createElement('span');
        span.className = 'modal-star-symbol';
        span.textContent = '⭐';
        victoryStarsRow.appendChild(span);
      }
    }

    audio.playSfx('level-clear');
    if (modalVictory) modalVictory.classList.add('active');
  }

  function handleGameOver(reason) {
    gameState.status = 'gameover';
    audio.playSfx('gameover');

    const defeatReason = document.getElementById('defeat-reason');
    const defeatSorted = document.getElementById('defeat-sorted');
    const defeatMistakes = document.getElementById('defeat-mistakes');

    if (defeatReason) defeatReason.textContent = reason;
    if (defeatSorted) defeatSorted.textContent = `${gameState.sortedCount}`;
    if (defeatMistakes) defeatMistakes.textContent = `${gameState.mistakesCount}/${gameState.level.maxMistakes}`;

    if (modalDefeat) modalDefeat.classList.add('active');
  }

  function toggleBeltPause() {
    if (!gameState) return;
    gameState.beltPaused = !gameState.beltPaused;
    if (labelBeltPause) {
      labelBeltPause.textContent = gameState.beltPaused ? '▶️ RESUME BELT' : '⏸️ PAUSE BELT';
    }
  }

  function cycleBeltSpeed() {
    if (!gameState) return;
    if (gameState.speedMultiplier === 1.0) gameState.speedMultiplier = 1.8;
    else if (gameState.speedMultiplier === 1.8) gameState.speedMultiplier = 0.6;
    else gameState.speedMultiplier = 1.0;

    if (labelBeltSpeed) {
      labelBeltSpeed.textContent = `SPEED: ${gameState.speedMultiplier}X`;
    }
  }

  // Tap listener utility
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
      if (dist < 28) fire(e);
    });

    el.addEventListener('pointercancel', () => {
      isDown = false;
      el.classList.remove('active-press');
    });

    el.addEventListener('click', fire);
  }

  function exitGame() {
    const params = new URLSearchParams(window.location.search);
    const fromTab = params.get('from');
    if (fromTab === 'games') {
      window.location.href = '../../index.html#games';
    } else {
      window.location.href = '../../index.html#rc-games';
    }
  }

  // --- 7. EVENT LISTENERS ---
  function setupEventListeners() {
    // Page 1: Landing
    addTapListener(document.getElementById('btn-landing-exit'), exitGame);
    addTapListener(document.getElementById('btn-quick-play'), () => startLevel(Core.LEVELS[0]));
    addTapListener(document.getElementById('btn-start'), () => showScreen('tutorial'));

    const landingSection = document.getElementById('screen-landing');
    if (landingSection) {
      addTapListener(landingSection, (e) => {
        if (e.target.closest('#btn-landing-exit') || e.target.closest('.btn-mute') || e.target.closest('#btn-start')) {
          return;
        }
        startLevel(Core.LEVELS[0]);
      });
    }

    // Page 2: Tutorial
    addTapListener(document.getElementById('btn-tutorial-back'), () => showScreen('landing'));
    addTapListener(document.getElementById('btn-tutorial-continue'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-tutorial-play'), () => startLevel(Core.LEVELS[0]));

    // Page 3: Map
    addTapListener(document.getElementById('btn-map-exit'), exitGame);
    addTapListener(document.getElementById('btn-map-quick-launch'), () => {
      const unlocked = (saveData && Array.isArray(saveData.unlockedLevels) && saveData.unlockedLevels.length > 0)
        ? saveData.unlockedLevels
        : [1];
      const targetId = Math.max(...unlocked);
      const targetLevel = Core.LEVELS.find(l => l.id === targetId) || Core.LEVELS[0];
      startLevel(targetLevel);
    });

    // Page 4: HUD
    addTapListener(document.getElementById('btn-game-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-game-exit'), exitGame);
    addTapListener(document.getElementById('btn-game-retry'), () => startLevel(activeLevel));

    // Bottom Tactical Control Deck Keys
    addTapListener(document.getElementById('btn-sort-alpha'), () => quickSortLeadingItem('alphabet'));
    addTapListener(document.getElementById('btn-sort-num'), () => quickSortLeadingItem('number'));
    addTapListener(document.getElementById('btn-belt-pause'), toggleBeltPause);
    addTapListener(document.getElementById('btn-belt-speed'), cycleBeltSpeed);

    // Deck Auxiliary Keys
    addTapListener(document.getElementById('btn-deck-retry'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-deck-rules'), () => {
      if (modalRules) modalRules.classList.add('active');
    });
    addTapListener(document.getElementById('btn-deck-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-deck-exit'), exitGame);

    // Modals
    addTapListener(document.getElementById('btn-close-rules'), () => modalRules.classList.remove('active'));
    addTapListener(document.getElementById('btn-rules-understand'), () => modalRules.classList.remove('active'));

    addTapListener(document.getElementById('btn-next-level'), () => {
      modalVictory.classList.remove('active');
      const nextLevel = Core.LEVELS.find(l => l.id === activeLevel.id + 1);
      if (nextLevel) startLevel(nextLevel);
      else showScreen('map');
    });
    addTapListener(document.getElementById('btn-replay-level'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-victory-map'), () => showScreen('map'));

    addTapListener(document.getElementById('btn-defeat-retry'), () => startLevel(activeLevel));
    addTapListener(document.getElementById('btn-defeat-map'), () => showScreen('map'));

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

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modalRules && modalRules.classList.contains('active')) {
          modalRules.classList.remove('active');
          return;
        }
        if (currentScreen === 'game') showScreen('map');
        else if (currentScreen === 'map' || currentScreen === 'tutorial') showScreen('landing');
        return;
      }

      if (currentScreen === 'landing') {
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

      if (currentScreen === 'game' && gameState) {
        if (e.key === 'r' || e.key === 'R') {
          startLevel(activeLevel);
          return;
        }
        if (e.key === 'i' || e.key === 'I') {
          if (modalRules) modalRules.classList.toggle('active');
          return;
        }

        if (gameState.status === 'playing') {
          if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            quickSortLeadingItem('alphabet');
          } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            quickSortLeadingItem('number');
          } else if (e.key === ' ') {
            e.preventDefault();
            toggleBeltPause();
          }
        }
      }
    });

    window.addEventListener('resize', updateViewportUnits);
    window.addEventListener('orientationchange', updateViewportUnits);
  }

  // --- 8. INITIALIZATION ---
  function init() {
    updateViewportUnits();
    setupEventListeners();
    renderSectorMap();

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
