/**
 * Tetris — QC Core Matrix Controller & Canvas Renderer
 * Implements standard SRS mechanics, 7-bag piece generation,
 * tactile on-screen controls with auto-repeat (DAS+ARR), swipe gestures,
 * and seamless multi-page state transitions.
 */

(function () {
  'use strict';

  const Core = window.TetrisCore;
  const AudioManager = window.TetrisAudio;

  if (!Core || !AudioManager) {
    console.error('Tetris: Missing Core or Audio module.');
    return;
  }

  // Preloaded textures storage
  window.__TETRIS_PRELOADED_IMAGES__ = [];
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
  let gravityAccumulator = 0;
  let activeTimeouts = [];

  // DOM Elements
  const stage = document.getElementById('stage');
  const screens = {
    landing: document.getElementById('screen-landing'),
    tutorial: document.getElementById('screen-tutorial'),
    map: document.getElementById('screen-map'),
    game: document.getElementById('screen-game')
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const holdCanvas = document.getElementById('hold-canvas');
  const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;
  const gesturePad = document.getElementById('canvas-gesture-pad');

  // Modals & HUD
  const modalVictory = document.getElementById('modal-victory');
  const modalDefeat = document.getElementById('modal-defeat');
  const modalRules = document.getElementById('modal-rules');
  const hudLevelName = document.getElementById('hud-level-name');
  const hudLinesLabel = document.getElementById('hud-lines-label');
  const hudScoreLabel = document.getElementById('hud-score-label');
  const sideStatLevel = document.getElementById('side-stat-level');
  const sideStatTarget = document.getElementById('side-stat-target');
  const sideStatScore = document.getElementById('side-stat-score');
  const sideStatHigh = document.getElementById('side-stat-high');

  // Visual Effects
  let lineClearFlash = []; // row indices flashing
  let lineClearTimer = 0;

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
      if (statusEl) statusEl.textContent = `Synthesizing matrix blocks... ${pct}%`;

      if (completed >= total) {
        if (statusEl) statusEl.textContent = 'Matrix systems nominal. Ready for launch.';
        if (startWrap) startWrap.style.display = 'flex';
      }
    }

    assetList.forEach(rawSrc => {
      let resolved = rawSrc;
      if (rawSrc.startsWith('assets/tetris-assets/')) {
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
          window.__TETRIS_PRELOADED_IMAGES__.push(img);
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
          <img src="../tetris-assets/page-3/${level.sectorBadge}.png" alt="${level.sector}" class="sector-badge" onerror="this.style.display='none'">
          <div class="level-info">
            <span class="level-number">Sector ${level.id}</span>
            <span class="level-name">${level.title}</span>
            <span class="level-sector-name">${level.sector}</span>
          </div>
        </div>
        <div class="level-card-right">
          ${isUnlocked
            ? `<div class="stars-earned-box">${'★'.repeat(starsEarned)}${'☆'.repeat(3 - starsEarned)}</div><button class="btn-level-play-pill">PLAY ▶</button>`
            : `<img src="../tetris-assets/page-3/lock-icon.png" alt="Locked" class="level-lock-badge">`
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

    // Update floating quick launch button target
    const mapQuickBtn = document.getElementById('btn-map-quick-launch');
    if (mapQuickBtn) {
      const titleSpan = mapQuickBtn.querySelector('.launch-title');
      if (titleSpan) {
        titleSpan.textContent = `🕹️ PLAY SECTOR ${latestUnlockedLevel.id} NOW`;
      }
    }
  }

  // --- 4. GAMEPLAY LOOP & LOGIC ---
  function startLevel(levelConfig) {
    activeLevel = levelConfig;
    gameState = Core.initGameState(levelConfig);
    gravityAccumulator = 0;
    lineClearFlash = [];
    lineClearTimer = 0;

    if (modalVictory) modalVictory.classList.remove('active');
    if (modalDefeat) modalDefeat.classList.remove('active');
    if (modalRules) modalRules.classList.remove('active');

    updateHud();
    showScreen('game');
    renderHoldAndNext();

    lastFrameTime = performance.now();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function updateHud() {
    if (!gameState) return;
    if (hudLevelName) hudLevelName.textContent = `Sector ${gameState.level.id}: ${gameState.level.title}`;
    if (hudLinesLabel) hudLinesLabel.textContent = `LINES: ${gameState.linesClearedTotal} / ${gameState.level.targetLines}`;
    if (hudScoreLabel) hudScoreLabel.textContent = `SCORE: ${gameState.score}`;

    if (sideStatLevel) sideStatLevel.textContent = `${gameState.level.id}`;
    if (sideStatTarget) sideStatTarget.textContent = `${gameState.level.targetLines}L`;
    if (sideStatScore) sideStatScore.textContent = `${gameState.score}`;
    if (sideStatHigh) sideStatHigh.textContent = `${saveData.highScore || 0}`;
  }

  function triggerScreenRumble() {
    if (!stage) return;
    stage.style.transition = 'transform 0.05s ease';
    stage.style.transform = `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px)`;
    setTimeout(() => {
      stage.style.transform = 'translate(0, 0)';
    }, 100);
  }

  function triggerLineClear(clearedIndices) {
    lineClearFlash = [...clearedIndices];
    lineClearTimer = 180; // flash ms
    triggerScreenRumble();
  }

  function gameLoop(now) {
    const dt = Math.min(80, now - lastFrameTime);
    lastFrameTime = now;

    if (currentScreen === 'game' && gameState && gameState.status === 'playing') {
      if (lineClearTimer > 0) {
        lineClearTimer -= dt;
        if (lineClearTimer <= 0) {
          lineClearFlash = [];
        }
      }

      // Gravity accumulation
      gravityAccumulator += dt;
      if (gravityAccumulator >= gameState.dropIntervalMs) {
        gravityAccumulator = 0;
        stepGravity();
      }

      renderGameCanvas();
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function stepGravity() {
    if (!gameState || gameState.status !== 'playing') return;

    if (Core.isValidPosition(gameState.board, gameState.currentPiece, 0, 1)) {
      gameState.currentPiece.y++;
    } else {
      // Piece landed: lock it!
      lockCurrentPiece();
    }
  }

  function lockCurrentPiece(isHardDrop = false, dropRows = 0) {
    const lockResult = Core.lockPiece(gameState.board, gameState.currentPiece);
    gameState.board = lockResult.board;
    gameState.canHold = true; // allow hold again for next piece

    if (lockResult.gameOver) {
      handleGameOver('Containment Breach: Blocks exceeded matrix ceiling!');
      return;
    }

    const lines = lockResult.linesCleared;
    if (lines > 0) {
      gameState.linesClearedTotal += lines;
      const points = Core.calculateScore(lines, gameState.level.id, isHardDrop, dropRows);
      gameState.score += points;
      if (gameState.score > (saveData.highScore || 0)) {
        saveData.highScore = gameState.score;
        Core.saveGameData(window.localStorage, saveData);
      }

      triggerLineClear(lockResult.clearedIndices);
      if (lines >= 4) {
        audio.playSfx('tetris');
      } else {
        audio.playSfx('clear');
      }
    } else {
      audio.playSfx('drop');
    }

    updateHud();

    // Check Victory
    if (gameState.linesClearedTotal >= gameState.level.targetLines || gameState.score >= gameState.level.targetScore) {
      handleVictory();
      return;
    }

    // Spawn Next Piece
    const nextType = gameState.nextQueue.pop();
    if (gameState.nextQueue.length < 5) {
      gameState.nextQueue.unshift(...Core.generate7Bag());
    }
    const newPiece = Core.createPiece(nextType);

    // If new piece cannot spawn, game over!
    if (!Core.isValidPosition(gameState.board, newPiece, 0, 0)) {
      handleGameOver('Matrix Blocked: Unable to spawn new tetromino!');
      return;
    }

    gameState.currentPiece = newPiece;
    renderHoldAndNext();
  }

  function handleVictory() {
    gameState.status = 'victory';
    const stars = Core.calculateStars(gameState.level, gameState.linesClearedTotal, gameState.score);

    // Save Progress
    if (!saveData.unlockedLevels.includes(gameState.level.id + 1) && gameState.level.id < 12) {
      saveData.unlockedLevels.push(gameState.level.id + 1);
    }
    const oldStars = (saveData.levelStars && saveData.levelStars[gameState.level.id]) || 0;
    saveData.levelStars[gameState.level.id] = Math.max(oldStars, stars);
    Core.saveGameData(window.localStorage, saveData);

    // Render Modal
    const victoryLines = document.getElementById('victory-lines');
    const victoryScore = document.getElementById('victory-score');
    const victoryStarsRow = document.getElementById('victory-stars-row');
    if (victoryLines) victoryLines.textContent = `${gameState.linesClearedTotal}/${gameState.level.targetLines}`;
    if (victoryScore) victoryScore.textContent = `${gameState.score}`;
    if (victoryStarsRow) {
      victoryStarsRow.innerHTML = '';
      for (let i = 0; i < stars; i++) {
        const span = document.createElement('span');
        span.className = 'modal-star-symbol';
        span.textContent = '⭐';
        victoryStarsRow.appendChild(span);
      }
    }

    audio.playSfx('tetris');
    if (modalVictory) modalVictory.classList.add('active');
  }

  function handleGameOver(reason) {
    gameState.status = 'gameover';
    audio.playSfx('gameover');

    const defeatReason = document.getElementById('defeat-reason');
    const defeatLines = document.getElementById('defeat-lines');
    const defeatScore = document.getElementById('defeat-score');

    if (defeatReason) defeatReason.textContent = reason;
    if (defeatLines) defeatLines.textContent = `${gameState.linesClearedTotal}`;
    if (defeatScore) defeatScore.textContent = `${gameState.score}`;

    if (modalDefeat) modalDefeat.classList.add('active');
  }

  // --- 5. TACTILE CONTROL ACTIONS ---
  function moveLeft() {
    if (!gameState || gameState.status !== 'playing') return;
    if (Core.isValidPosition(gameState.board, gameState.currentPiece, -1, 0)) {
      gameState.currentPiece.x--;
      audio.playSfx('move');
    }
  }

  function moveRight() {
    if (!gameState || gameState.status !== 'playing') return;
    if (Core.isValidPosition(gameState.board, gameState.currentPiece, 1, 0)) {
      gameState.currentPiece.x++;
      audio.playSfx('move');
    }
  }

  function softDrop() {
    if (!gameState || gameState.status !== 'playing') return;
    if (Core.isValidPosition(gameState.board, gameState.currentPiece, 0, 1)) {
      gameState.currentPiece.y++;
      gameState.score += 1;
      updateHud();
      audio.playSfx('move');
    }
  }

  function hardDrop() {
    if (!gameState || gameState.status !== 'playing') return;
    const ghostY = Core.getGhostY(gameState.board, gameState.currentPiece);
    const dropDist = ghostY - gameState.currentPiece.y;
    gameState.currentPiece.y = ghostY;
    triggerScreenRumble();
    lockCurrentPiece(true, dropDist);
  }

  function rotateCW() {
    if (!gameState || gameState.status !== 'playing') return;
    const res = Core.tryRotate(gameState.board, gameState.currentPiece, 1);
    if (res.success) {
      gameState.currentPiece = res.newPiece;
      audio.playSfx('rotate');
    }
  }

  function rotateCCW() {
    if (!gameState || gameState.status !== 'playing') return;
    const res = Core.tryRotate(gameState.board, gameState.currentPiece, -1);
    if (res.success) {
      gameState.currentPiece = res.newPiece;
      audio.playSfx('rotate');
    }
  }

  function holdPiece() {
    if (!gameState || gameState.status !== 'playing') return;
    const swapped = Core.swapHoldPiece(gameState);
    if (swapped) {
      audio.playSfx('rotate');
      renderHoldAndNext();
    }
  }

  // --- 6. CANVAS RENDERING ---
  function renderGameCanvas() {
    if (!ctx || !gameState) return;

    const w = canvas.width;
    const h = canvas.height;
    const cellSize = w / Core.COLS; // 30px per cell

    ctx.clearRect(0, 0, w, h);

    // 1. Grid Background & Guide Lines
    ctx.fillStyle = '#060a1c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let c = 1; c < Core.COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellSize, 0);
      ctx.lineTo(c * cellSize, h);
      ctx.stroke();
    }
    for (let r = 1; r < Core.ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellSize);
      ctx.lineTo(w, r * cellSize);
      ctx.stroke();
    }

    // 2. Draw Locked Blocks in Visible Board (Rows 2 to 21 map to 0 to 19)
    for (let r = Core.HIDDEN_ROWS; r < Core.TOTAL_ROWS; r++) {
      const displayY = (r - Core.HIDDEN_ROWS) * cellSize;
      const isFlashing = lineClearFlash.includes(r);

      for (let c = 0; c < Core.COLS; c++) {
        const cell = gameState.board[r][c];
        const displayX = c * cellSize;

        if (cell !== null) {
          if (isFlashing) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(displayX, displayY, cellSize, cellSize);
          } else {
            drawBlock(ctx, displayX, displayY, cellSize, cell.color, cell.texture);
          }
        }
      }
    }

    // 3. Draw Ghost Piece Projection
    const ghostY = Core.getGhostY(gameState.board, gameState.currentPiece);
    drawPiece(ctx, gameState.currentPiece, gameState.currentPiece.x, ghostY, cellSize, true);

    // 4. Draw Active Falling Piece
    drawPiece(ctx, gameState.currentPiece, gameState.currentPiece.x, gameState.currentPiece.y, cellSize, false);
  }

  function drawPiece(targetCtx, piece, px, py, cellSize, isGhost = false) {
    const shape = Core.TETROMINOES[piece.type].rotations[piece.rotation];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const boardY = py + r;
          const boardX = px + c;
          // Only draw if within visible rows
          if (boardY >= Core.HIDDEN_ROWS && boardY < Core.TOTAL_ROWS) {
            const displayY = (boardY - Core.HIDDEN_ROWS) * cellSize;
            const displayX = boardX * cellSize;
            if (isGhost) {
              drawGhostBlock(targetCtx, displayX, displayY, cellSize, piece.color);
            } else {
              drawBlock(targetCtx, displayX, displayY, cellSize, piece.color, piece.texture);
            }
          }
        }
      }
    }
  }

  function drawBlock(targetCtx, x, y, size, color, textureName) {
    const img = imageCache.get(textureName);
    if (img && img.complete && img.naturalWidth > 0) {
      targetCtx.drawImage(img, x, y, size, size);
      return;
    }

    // Beveled Procedural Fallback Block
    targetCtx.fillStyle = color;
    targetCtx.fillRect(x + 1, y + 1, size - 2, size - 2);

    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    targetCtx.lineWidth = 2;
    targetCtx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
  }

  function drawGhostBlock(targetCtx, x, y, size, color) {
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = 1.5;
    targetCtx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    targetCtx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    targetCtx.fillRect(x + 2, y + 2, size - 4, size - 4);
  }

  function renderHoldAndNext() {
    if (holdCtx) {
      holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
      if (gameState.holdPiece) {
        drawMiniPiece(holdCtx, gameState.holdPiece, holdCanvas.width, holdCanvas.height);
      }
    }
    if (nextCtx) {
      nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      const nextType = gameState.nextQueue[gameState.nextQueue.length - 1];
      if (nextType) {
        drawMiniPiece(nextCtx, nextType, nextCanvas.width, nextCanvas.height);
      }
    }
  }

  function drawMiniPiece(targetCtx, type, width, height) {
    const def = Core.TETROMINOES[type];
    const shape = def.rotations[0];
    const cellSize = 12;
    const pieceWidth = shape[0].length * cellSize;
    const pieceHeight = shape.length * cellSize;
    const startX = (width - pieceWidth) / 2;
    const startY = (height - pieceHeight) / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          drawBlock(targetCtx, startX + c * cellSize, startY + r * cellSize, cellSize, def.color, def.texture);
        }
      }
    }
  }

  // --- 7. TACTILE INPUT & AUTO-REPEAT CONTROLLERS ---
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

    el.addEventListener('click', (e) => {
      fire(e);
    });
  }

  // Auto-Repeat Tap Listener (DAS: 160ms initial delay, ARR: 45ms repeat)
  function addAutoRepeatListener(el, onStep) {
    if (!el) return;
    let timer = null;
    let isDown = false;

    function startRepeat(e) {
      if (isDown) return;
      isDown = true;
      if (e.cancelable) e.preventDefault();
      el.classList.add('active-press');
      onStep();

      timer = setTimeout(() => {
        timer = setInterval(() => {
          onStep();
        }, 45);
      }, 160);
    }

    function stopRepeat() {
      isDown = false;
      el.classList.remove('active-press');
      if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
        timer = null;
      }
    }

    el.addEventListener('pointerdown', startRepeat);
    window.addEventListener('pointerup', stopRepeat);
    window.addEventListener('pointercancel', stopRepeat);
  }

  // Gesture Recognition Pad
  function setupGesturePad() {
    if (!gesturePad) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isSwiping = false;

    gesturePad.addEventListener('pointerdown', (e) => {
      if (!gameState || gameState.status !== 'playing') return;
      if (e.cancelable) e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      isSwiping = true;
    });

    gesturePad.addEventListener('pointermove', (e) => {
      if (!isSwiping || !gameState || gameState.status !== 'playing') return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Threshold for lateral slide
      if (Math.abs(dx) > 30) {
        if (dx > 0) moveRight();
        else moveLeft();
        startX = e.clientX;
        startY = e.clientY;
      } else if (dy > 40) {
        softDrop();
        startY = e.clientY;
      }
    });

    gesturePad.addEventListener('pointerup', (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const duration = Date.now() - startTime;

      // Swipe Up -> Hard Drop
      if (dy < -45 && Math.abs(dx) < 35 && duration < 350) {
        hardDrop();
      } else if (Math.hypot(dx, dy) < 15 && duration < 250) {
        // Simple Tap -> Rotate Clockwise
        rotateCW();
      }
    });

    gesturePad.addEventListener('pointercancel', () => {
      isSwiping = false;
    });
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

  // --- 8. GLOBAL EVENT LISTENERS ---
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

    // Page 4: Top HUD
    addTapListener(document.getElementById('btn-game-map'), () => showScreen('map'));
    addTapListener(document.getElementById('btn-game-exit'), exitGame);
    addTapListener(document.getElementById('btn-game-retry'), () => startLevel(activeLevel));

    // Bottom Tactical Control Deck Keys
    addAutoRepeatListener(document.getElementById('btn-left'), moveLeft);
    addAutoRepeatListener(document.getElementById('btn-right'), moveRight);
    addAutoRepeatListener(document.getElementById('btn-soft-drop'), softDrop);

    addTapListener(document.getElementById('btn-hold'), holdPiece);
    addTapListener(document.getElementById('btn-rot-ccw'), rotateCCW);
    addTapListener(document.getElementById('btn-rot-cw'), rotateCW);
    addTapListener(document.getElementById('btn-hard-drop'), hardDrop);

    // Deck Auxiliary Buttons
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

    // Setup Gesture Pad on Canvas
    setupGesturePad();

    // Physical Keyboard Handlers
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
            moveLeft();
          } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            moveRight();
          } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            e.preventDefault();
            softDrop();
          } else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') {
            e.preventDefault();
            rotateCW();
          } else if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            rotateCCW();
          } else if (e.key === ' ') {
            e.preventDefault();
            hardDrop();
          } else if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') {
            e.preventDefault();
            holdPiece();
          }
        }
      }
    });

    window.addEventListener('resize', updateViewportUnits);
    window.addEventListener('orientationchange', updateViewportUnits);
  }

  // --- 9. INITIALIZATION ---
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
